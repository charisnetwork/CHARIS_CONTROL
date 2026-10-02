from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    Affiliate,
    AffiliateCommission,
    AffiliateStatus,
    AuditLog,
    CommissionEntryType,
    Coupon,
    CouponPlan,
    CouponRedemption,
    CouponStatus,
    Subscription,
    SubscriptionPlan,
    ValueType,
    WebhookEvent,
)
from app.domains.coupons.schemas import CouponCreate

MONEY_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class AppliedCoupon:
    code: str
    discount_amount: Decimal
    final_amount: Decimal


def calculate_discount(coupon: Coupon, price: Decimal) -> Decimal:
    raw = (
        price * Decimal(coupon.discount_value) / Decimal(100)
        if coupon.discount_type == ValueType.PERCENTAGE
        else Decimal(coupon.discount_value)
    )
    return min(price, raw).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def calculate_commission(coupon: Coupon, net_amount: Decimal) -> Decimal:
    raw = (
        Decimal(coupon.commission_value or 0)
        if coupon.commission_type == ValueType.FIXED
        else net_amount * Decimal(coupon.commission_value or 0) / Decimal(100)
    )
    return min(net_amount, raw).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def locked_coupon_statement(application_id: uuid.UUID, code: str) -> Select[tuple[Coupon]]:
    return (
        select(Coupon)
        .where(Coupon.application_id == application_id, Coupon.code == code)
        .with_for_update()
    )


class CouponService:
    async def list_coupons(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[tuple[Coupon, list[uuid.UUID]]]:
        coupons = list(
            (
                await db.scalars(
                    select(Coupon)
                    .where(Coupon.application_id == application_id)
                    .order_by(Coupon.created_at.desc(), Coupon.id)
                )
            ).all()
        )
        if not coupons:
            return []
        rows = (
            await db.execute(
                select(CouponPlan.coupon_id, CouponPlan.plan_id).where(
                    CouponPlan.application_id == application_id,
                    CouponPlan.coupon_id.in_([coupon.id for coupon in coupons]),
                )
            )
        ).all()
        plans: dict[uuid.UUID, list[uuid.UUID]] = {coupon.id: [] for coupon in coupons}
        for coupon_id, plan_id in rows:
            plans[coupon_id].append(plan_id)
        return [(coupon, plans[coupon.id]) for coupon in coupons]

    async def create_coupon(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: CouponCreate,
        correlation_id: str,
    ) -> tuple[Coupon, list[uuid.UUID]]:
        if payload.plan_ids:
            count = await db.scalar(
                select(func.count())
                .select_from(SubscriptionPlan)
                .where(
                    SubscriptionPlan.application_id == application_id,
                    SubscriptionPlan.id.in_(payload.plan_ids),
                )
            )
            if count != len(payload.plan_ids):
                raise HTTPException(
                    status_code=422, detail="Every selected plan must belong to this application"
                )
        if payload.affiliate_id is not None:
            affiliate = await db.scalar(
                select(Affiliate.id).where(
                    Affiliate.application_id == application_id,
                    Affiliate.id == payload.affiliate_id,
                    Affiliate.status == AffiliateStatus.ACTIVE,
                )
            )
            if affiliate is None:
                raise HTTPException(
                    status_code=422, detail="Affiliate must be active in this application"
                )
        effective_status = payload.status
        if payload.status != CouponStatus.DISABLED:
            effective_status = (
                CouponStatus.SCHEDULED
                if payload.starts_at > datetime.now(UTC)
                else CouponStatus.ACTIVE
            )
        coupon = Coupon(
            id=uuid.uuid4(),
            application_id=application_id,
            name=payload.name,
            code=payload.code,
            kind=payload.kind,
            affiliate_id=payload.affiliate_id,
            discount_type=payload.discount_type,
            discount_value=payload.discount_value,
            commission_type=payload.commission_type,
            commission_value=payload.commission_value,
            commission_currency=payload.commission_currency,
            currency=payload.currency,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            maximum_redemptions=payload.maximum_redemptions,
            per_subscriber_limit=payload.per_subscriber_limit,
            first_subscription_only=payload.first_subscription_only,
            minimum_duration_value=payload.minimum_duration_value,
            minimum_duration_unit=payload.minimum_duration_unit,
            redemption_count=0,
            status=effective_status,
        )
        db.add_all(
            [
                coupon,
                *[
                    CouponPlan(application_id=application_id, coupon_id=coupon.id, plan_id=plan_id)
                    for plan_id in payload.plan_ids
                ],
                AuditLog(
                    application_id=application_id,
                    actor_user_id=principal.user.id,
                    action="coupon.created",
                    entity_type="coupon",
                    entity_id=str(coupon.id),
                    correlation_id=correlation_id,
                    after_summary={"code": coupon.code, "plan_count": len(payload.plan_ids)},
                ),
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    event_type="coupon.created",
                    aggregate_type="coupon",
                    aggregate_id=str(coupon.id),
                    payload={"coupon_id": str(coupon.id), "code": coupon.code},
                    idempotency_key=f"coupon.created:{coupon.id}",
                    occurred_at=datetime.now(UTC),
                ),
            ]
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=409, detail="Coupon code or related record already exists"
            ) from exc
        return coupon, payload.plan_ids

    async def apply_to_subscription(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        subscriber_id: uuid.UUID,
        subscription: Subscription,
        plan: SubscriptionPlan,
        code: str,
        idempotency_key: str,
        now: datetime,
    ) -> AppliedCoupon:
        prior = await db.scalar(
            select(CouponRedemption.id).where(
                CouponRedemption.application_id == application_id,
                CouponRedemption.idempotency_key == idempotency_key,
            )
        )
        if prior is not None:
            raise HTTPException(
                status_code=409, detail="Coupon idempotency key has already been used"
            )
        coupon = await db.scalar(locked_coupon_statement(application_id, code))
        if coupon is None:
            raise HTTPException(status_code=422, detail="Coupon is invalid")
        if coupon.status not in {CouponStatus.ACTIVE, CouponStatus.SCHEDULED} or not (
            coupon.starts_at <= now < coupon.ends_at
        ):
            raise HTTPException(status_code=422, detail="Coupon is not currently redeemable")
        if not plan.coupons_allowed:
            raise HTTPException(status_code=422, detail="This plan does not allow coupons")
        if coupon.redemption_count >= coupon.maximum_redemptions:
            raise HTTPException(status_code=422, detail="Coupon redemption limit has been reached")
        if coupon.discount_type == ValueType.FIXED and coupon.currency != plan.currency:
            raise HTTPException(
                status_code=422, detail="Coupon currency does not match the plan currency"
            )
        scoped_plan_count = await db.scalar(
            select(func.count())
            .select_from(CouponPlan)
            .where(
                CouponPlan.application_id == application_id,
                CouponPlan.coupon_id == coupon.id,
            )
        )
        if scoped_plan_count:
            applies = await db.scalar(
                select(CouponPlan.plan_id).where(
                    CouponPlan.application_id == application_id,
                    CouponPlan.coupon_id == coupon.id,
                    CouponPlan.plan_id == plan.id,
                )
            )
            if applies is None:
                raise HTTPException(status_code=422, detail="Coupon does not apply to this plan")
        if coupon.first_subscription_only:
            subscriptions = await db.scalar(
                select(func.count())
                .select_from(Subscription)
                .where(
                    Subscription.application_id == application_id,
                    Subscription.subscriber_id == subscriber_id,
                )
            )
            if subscriptions:
                raise HTTPException(
                    status_code=422, detail="Coupon is limited to a subscriber's first subscription"
                )
        if coupon.per_subscriber_limit is not None:
            redemptions = await db.scalar(
                select(func.count())
                .select_from(CouponRedemption)
                .join(
                    Subscription,
                    (Subscription.id == CouponRedemption.subscription_id)
                    & (Subscription.application_id == CouponRedemption.application_id),
                )
                .where(
                    CouponRedemption.application_id == application_id,
                    CouponRedemption.coupon_id == coupon.id,
                    Subscription.subscriber_id == subscriber_id,
                )
            )
            if (redemptions or 0) >= coupon.per_subscriber_limit:
                raise HTTPException(
                    status_code=422, detail="Subscriber coupon limit has been reached"
                )
        if coupon.minimum_duration_value is not None and coupon.minimum_duration_unit is not None:
            from app.domains.subscriptions.service import _subscription_end

            minimum_end = _subscription_end(
                subscription.starts_at, coupon.minimum_duration_value, coupon.minimum_duration_unit
            )
            if subscription.ends_at is None or subscription.ends_at < minimum_end:
                raise HTTPException(
                    status_code=422, detail="Plan duration is below the coupon minimum"
                )
        price = Decimal(plan.price)
        discount = calculate_discount(coupon, price)
        final = (price - discount).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
        coupon.redemption_count += 1
        coupon.version += 1
        redemption = CouponRedemption(
            id=uuid.uuid4(),
            application_id=application_id,
            coupon_id=coupon.id,
            subscription_id=subscription.id,
            payment_id=None,
            idempotency_key=idempotency_key,
            discount_amount=discount,
            currency=plan.currency,
            redeemed_at=now,
        )
        # Eligibility checks above must run before persisting the new subscription
        # (in particular first-subscription-only). Parent and children remain atomic.
        db.add(subscription)
        await db.flush()
        db.add(redemption)
        await db.flush()
        if coupon.affiliate_id is not None:
            active_affiliate = await db.scalar(
                select(Affiliate.id).where(
                    Affiliate.application_id == application_id,
                    Affiliate.id == coupon.affiliate_id,
                    Affiliate.status == AffiliateStatus.ACTIVE,
                )
            )
            if active_affiliate is None:
                raise HTTPException(status_code=422, detail="Coupon affiliate is not active")
            if coupon.commission_type == ValueType.FIXED:
                if coupon.commission_currency != plan.currency:
                    raise HTTPException(
                        status_code=422,
                        detail="Affiliate commission currency does not match the plan currency",
                    )
            commission = calculate_commission(coupon, final)
            if commission > 0:
                db.add(
                    AffiliateCommission(
                        id=uuid.uuid4(),
                        application_id=application_id,
                        affiliate_id=coupon.affiliate_id,
                        redemption_id=redemption.id,
                        entry_type=CommissionEntryType.EARNED,
                        amount=commission,
                        currency=plan.currency,
                        reference=f"coupon-redemption:{redemption.id}",
                        notes=f"Earned from coupon {coupon.code}",
                        occurred_at=now,
                    )
                )
        return AppliedCoupon(code=coupon.code, discount_amount=discount, final_amount=final)


coupon_service = CouponService()

__all__ = [
    "AppliedCoupon",
    "CouponService",
    "calculate_commission",
    "calculate_discount",
    "coupon_service",
    "locked_coupon_statement",
]
