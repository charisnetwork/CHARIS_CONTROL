"""Customer checkout adapter: product app credentials, never OS owner credentials."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Self

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Select, select

from app.api.dependencies import DatabaseSession, IntegrationCredential
from app.core.config import get_settings
from app.db.models import (
    PlanUiItem,
    RazorpayCheckout,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.domains.payments import gateway
from app.domains.payments.schemas import CheckoutCreate, CheckoutVerify
from app.domains.payments.service import (
    checkout_view,
    minor_amount,
    settle_payment,
    start_checkout,
)
from app.domains.subscriptions.schemas import SubscriptionCreate
from app.domains.subscriptions.service import subscription_service

router = APIRouter(
    prefix="/integrations/apps/{app_id}/tenants/{external_id}/checkout", tags=["customer checkout"]
)


class CustomerOrder(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    plan_id: uuid.UUID
    idempotency_key: uuid.UUID
    actor_id: str = Field(min_length=1, max_length=255)
    previous_subscription_id: uuid.UUID | None = None
    previous_version: int | None = Field(default=None, ge=1)
    replacement_acknowledged: bool = False
    coupon_code: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("coupon_code", mode="before")
    @classmethod
    def normalize_coupon_code(cls, value: object) -> object:
        return value.strip().upper() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def previous_pair(self) -> Self:
        if (self.previous_subscription_id is None) != (self.previous_version is None):
            raise ValueError("Current subscription and version must be supplied together")
        return self


class CustomerQuote(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    plan_id: uuid.UUID
    coupon_code: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("coupon_code", mode="before")
    @classmethod
    def normalize_coupon_code(cls, value: object) -> object:
        return value.strip().upper() or None if isinstance(value, str) else value


async def visible_plan(db: DatabaseSession, app_id: uuid.UUID, plan_id: uuid.UUID) -> None:
    visible = await db.scalar(
        select(PlanUiItem).where(
            PlanUiItem.application_id == app_id,
            PlanUiItem.plan_id == plan_id,
            PlanUiItem.visible.is_(True),
        )
    )
    if visible is None:
        raise HTTPException(status_code=404, detail="Plan is not available for purchase")


async def tenant(db: DatabaseSession, app_id: uuid.UUID, external_id: str) -> Subscriber:
    subscriber = await db.scalar(
        select(Subscriber).where(
            Subscriber.application_id == app_id,
            Subscriber.external_id == external_id,
            Subscriber.archived_at.is_(None),
        )
    )
    if subscriber is None:
        raise HTTPException(status_code=404, detail="Customer registration is pending; retry")
    return subscriber


def order_statement(app_id: uuid.UUID, subscriber_id: uuid.UUID) -> Select[tuple[RazorpayCheckout]]:
    return (
        select(RazorpayCheckout)
        .join(
            Subscription,
            (
                (Subscription.id == RazorpayCheckout.subscription_id)
                & (Subscription.application_id == RazorpayCheckout.application_id)
            ),
        )
        .where(
            RazorpayCheckout.application_id == app_id,
            Subscription.application_id == app_id,
            Subscription.subscriber_id == subscriber_id,
        )
    )


@router.get("")
async def customer_checkouts(
    external_id: str, authorization: IntegrationCredential, db: DatabaseSession, response: Response
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    subscriber = await tenant(db, authorization.application_id, external_id)
    settings = get_settings()
    records = (
        await db.scalars(
            order_statement(authorization.application_id, subscriber.id)
            .order_by(RazorpayCheckout.created_at.desc())
            .limit(20)
        )
    ).all()
    terms = (
        await db.scalars(
            select(Subscription)
            .where(
                Subscription.application_id == authorization.application_id,
                Subscription.subscriber_id == subscriber.id,
                Subscription.status.in_(
                    [
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.SUSPENDED,
                        SubscriptionStatus.EXPIRED,
                    ]
                ),
            )
            .order_by(Subscription.starts_at.desc())
        )
    ).all()
    now = datetime.now(UTC)
    current = next(
        (
            t
            for t in terms
            if t.status in {SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED}
            and (t.ends_at is None or t.ends_at > now)
        ),
        terms[0] if terms else None,
    )
    return {
        "application_id": str(authorization.application_id),
        "tenant_id": external_id,
        "enabled": settings.razorpay_enabled,
        "mode": settings.razorpay_mode,
        "current_term": {
            "id": str(current.id),
            "version": current.version,
            "plan_id": str(current.plan_id),
            "status": current.status.value,
            "ends_at": current.ends_at.isoformat() if current.ends_at else None,
        }
        if current
        else None,
        "checkouts": [checkout_view(r) for r in records] if settings.razorpay_enabled else [],
    }


@router.post("/orders", status_code=201)
async def customer_order(
    payload: CustomerOrder,
    external_id: str,
    authorization: IntegrationCredential,
    db: DatabaseSession,
) -> dict[str, Any]:
    app_id = authorization.application_id
    subscriber = await tenant(db, app_id, external_id)
    if subscriber.status != SubscriberStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Account suspended; contact support")
    await visible_plan(db, app_id, payload.plan_id)
    plan = await db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.application_id == app_id, SubscriptionPlan.id == payload.plan_id
        )
    )
    if plan is not None and Decimal(plan.price) == 0:
        return await activate_free_plan(db, app_id, subscriber, payload, external_id)
    gateway.payment_settings()  # Paid plans need the configured payment provider.
    if payload.previous_subscription_id:
        previous = await db.scalar(
            select(Subscription).where(
                Subscription.application_id == app_id,
                Subscription.subscriber_id == subscriber.id,
                Subscription.id == payload.previous_subscription_id,
            )
        )
        if previous is None:
            raise HTTPException(status_code=404, detail="Current subscription not found")
        if previous.status == SubscriptionStatus.SUSPENDED:
            raise HTTPException(status_code=409, detail="Subscription suspended; contact support")
        if previous.ends_at is None or previous.ends_at > datetime.now(UTC):
            if previous.plan_id == payload.plan_id:
                raise HTTPException(
                    status_code=409, detail="Plan is already active; renew after expiry"
                )
            if not payload.replacement_acknowledged:
                raise HTTPException(
                    status_code=422, detail="Confirm full-term replacement without proration"
                )
    record = await start_checkout(
        db,
        application_id=app_id,
        principal=None,
        external_actor_id=payload.actor_id,
        payload=CheckoutCreate(
            subscriber_id=subscriber.id,
            plan_id=payload.plan_id,
            idempotency_key=payload.idempotency_key,
            previous_subscription_id=payload.previous_subscription_id,
            previous_version=payload.previous_version,
            reason="Customer self-service plan purchase",
            coupon_code=payload.coupon_code,
        ),
        correlation_id=str(uuid.uuid4()),
    )
    return {
        "application_id": str(app_id),
        "tenant_id": external_id,
        "checkout": checkout_view(record),
    }


async def activate_free_plan(
    db: DatabaseSession,
    app_id: uuid.UUID,
    subscriber: Subscriber,
    payload: CustomerOrder,
    external_id: str,
) -> dict[str, Any]:
    """A visible ₹0 plan needs no payment, but only for customers without a current term."""
    if payload.coupon_code:
        raise HTTPException(status_code=422, detail="Coupons do not apply to free plans")
    now = datetime.now(UTC)
    terms = (
        await db.scalars(
            select(Subscription)
            .where(
                Subscription.application_id == app_id,
                Subscription.subscriber_id == subscriber.id,
                Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]),
            )
            .with_for_update()
        )
    ).all()
    if any(t.ends_at is None or t.ends_at > now for t in terms):
        raise HTTPException(status_code=409, detail="A plan is already active for this account")
    for term in terms:  # Lapsed terms are recorded as expired before the free term starts.
        term.status = SubscriptionStatus.EXPIRED
        term.version += 1
    await db.flush()
    created = await subscription_service.create_subscription(
        db,
        application_id=app_id,
        principal=None,
        payload=SubscriptionCreate(
            subscriber_id=subscriber.id, plan_id=payload.plan_id, starts_at=now
        ),
        correlation_id=str(uuid.uuid4()),
        customer_free_plan=True,
    )
    return {
        "application_id": str(app_id),
        "tenant_id": external_id,
        "checkout": None,
        "subscription": {
            "id": str(created.id),
            "plan_id": str(created.plan_id),
            "status": created.status.value,
            "ends_at": created.ends_at.isoformat() if created.ends_at else None,
        },
    }


@router.post("/quote")
async def customer_quote(
    payload: CustomerQuote,
    external_id: str,
    authorization: IntegrationCredential,
    db: DatabaseSession,
    response: Response,
) -> dict[str, Any]:
    """Price a plan (optionally with a coupon) using the real checkout rules; nothing is saved."""
    response.headers["Cache-Control"] = "no-store"
    app_id = authorization.application_id
    subscriber = await tenant(db, app_id, external_id)
    await visible_plan(db, app_id, payload.plan_id)
    try:
        pending = await subscription_service.create_subscription(
            db,
            application_id=app_id,
            principal=None,
            payload=SubscriptionCreate(
                subscriber_id=subscriber.id,
                plan_id=payload.plan_id,
                starts_at=datetime.now(UTC),
                coupon_code=payload.coupon_code,
                coupon_idempotency_key=f"quote:{uuid.uuid4()}" if payload.coupon_code else None,
            ),
            correlation_id=str(uuid.uuid4()),
            commit=False,
            initial_status=SubscriptionStatus.PENDING,
        )
        snapshot = dict(pending.commercial_snapshot)
    finally:
        await db.rollback()
    minor_amount(snapshot["final_price"], snapshot["currency"])  # Same payable bounds as checkout.
    return {
        "application_id": str(app_id),
        "tenant_id": external_id,
        "plan_id": str(payload.plan_id),
        "coupon_code": snapshot.get("coupon_code"),
        "currency": snapshot["currency"],
        "gross_price": snapshot["gross_price"],
        "discount_amount": snapshot["discount_amount"],
        "final_price": snapshot["final_price"],
    }


@router.post("/verify")
async def customer_verify(
    payload: CheckoutVerify,
    external_id: str,
    authorization: IntegrationCredential,
    db: DatabaseSession,
) -> dict[str, Any]:
    settings = gateway.payment_settings()
    subscriber = await tenant(db, authorization.application_id, external_id)
    record = await db.scalar(
        order_statement(authorization.application_id, subscriber.id).where(
            RazorpayCheckout.provider_order_id == payload.razorpay_order_id
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    body = f"{record.provider_order_id}|{payload.razorpay_payment_id}".encode()
    if not gateway.valid_signature(
        body, payload.razorpay_signature, settings.razorpay_key_secret.get_secret_value()
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    settled = await settle_payment(
        db,
        payment=await gateway.fetch_payment(payload.razorpay_payment_id),
        application_id=authorization.application_id,
        expected_checkout_id=record.id,
    )
    if settled is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    return {
        "application_id": str(authorization.application_id),
        "tenant_id": external_id,
        "checkout": checkout_view(settled),
    }
