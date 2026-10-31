"""App-scoped subscription adapter. Never accepts control-user credentials."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Path, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import Select, or_, select
from sqlalchemy.dialects.postgresql import insert

from app.api.dependencies import DatabaseSession, IntegrationCredential
from app.core.config import get_settings
from app.db.models import (
    AppFeature,
    AuditLog,
    Coupon,
    CouponKind,
    CouponPlan,
    CouponStatus,
    PlanEntitlement,
    PlanStatus,
    PlanUiConfig,
    PlanUiItem,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.domains.catalog.schemas import FeatureManifest
from app.domains.catalog.service import catalog_service
from app.domains.entitlements.schemas import EntitlementSnapshot

router = APIRouter(prefix="/integrations/apps/{app_id}", tags=["subscription integration"])


class TenantOwner(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    user_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=160)
    gender: str | None = Field(default=None, max_length=32)
    date_of_birth: date | None = None


class TenantProfile(BaseModel):
    """Company/contact sync. Fields after mobile_number are optional so older apps still sync."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = None
    mobile_number: str | None = Field(default=None, max_length=32)
    owner: TenantOwner | None = None
    location: str | None = Field(default=None, max_length=200)
    team_size: int | None = Field(default=None, ge=0, le=1_000_000)
    joined_at: datetime | None = None
    last_active_at: datetime | None = None

    def column_values(self) -> dict[str, Any]:
        """Subscriber columns to write; profile fields an app does not send are left as they are."""
        values: dict[str, Any] = self.model_dump(include={"name", "email", "mobile_number"})
        values.update(
            self.model_dump(
                include={"location", "team_size", "joined_at", "last_active_at"},
                exclude_unset=True,
            )
        )
        if "owner" in self.model_fields_set:
            owner = self.owner
            values.update(
                contact_user_id=owner.user_id if owner else None,
                contact_name=owner.name if owner else None,
                gender=owner.gender if owner else None,
                date_of_birth=owner.date_of_birth if owner else None,
            )
        return values


@router.put("/tenants/{external_id}")
async def sync_tenant(
    profile: TenantProfile,
    authorization: IntegrationCredential,
    db: DatabaseSession,
    response: Response,
    external_id: str = Path(min_length=1, max_length=255),
) -> dict[str, Any]:
    """Idempotent company/contact sync; never changes grants, status or billing."""
    response.headers["Cache-Control"] = "no-store"
    values = profile.column_values()
    created_id = await db.scalar(
        insert(Subscriber)
        .values(application_id=authorization.application_id, external_id=external_id, **values)
        .on_conflict_do_nothing(constraint="uq_subscribers_app_external")
        .returning(Subscriber.id)
    )
    subscriber = (
        await db.execute(
            select(Subscriber)
            .where(
                Subscriber.application_id == authorization.application_id,
                Subscriber.external_id == external_id,
            )
            .with_for_update()
        )
    ).scalar_one()
    changed = any(getattr(subscriber, key) != value for key, value in values.items())
    if changed:
        for key, value in values.items():
            setattr(subscriber, key, value)
        subscriber.version += 1
    subscriber.profile_synced_at = datetime.now(UTC)
    if created_id is not None or changed:
        db.add(
            AuditLog(
                application_id=authorization.application_id,
                action="integration.tenant.created" if created_id else "integration.tenant.updated",
                entity_type="subscriber",
                entity_id=str(subscriber.id),
                correlation_id=str(uuid.uuid4()),
                after_summary={"external_id": external_id, "source": "application_credential"},
            )
        )
    await db.commit()
    return {
        "contract_version": 1,
        "application_id": str(authorization.application_id),
        "tenant_id": external_id,
        "subscriber_id": str(subscriber.id),
        "synced": True,
    }


def subscription_statement(
    application_id: uuid.UUID, external_id: str
) -> Select[tuple[Subscription, Subscriber]]:
    return (
        select(Subscription, Subscriber)
        .join(
            Subscriber,
            (Subscriber.id == Subscription.subscriber_id)
            & (Subscriber.application_id == Subscription.application_id),
        )
        .where(
            Subscription.application_id == application_id,
            Subscriber.application_id == application_id,
            Subscriber.external_id == external_id,
        )
        .order_by(Subscription.starts_at.desc(), Subscription.created_at.desc())
    )


@router.get("/tenants/{external_id}/subscription")
async def tenant_subscription(
    external_id: str,
    authorization: IntegrationCredential,
    db: DatabaseSession,
    response: Response,
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    now = datetime.now(UTC)
    rows = (
        await db.execute(subscription_statement(authorization.application_id, external_id))
    ).all()
    # Ignore future renewals while a current term exists. No subscription grants no rights.
    eligible = [
        row
        for row in rows
        if row[0].starts_at <= now and row[0].status != SubscriptionStatus.PENDING
    ]
    current = next(
        (
            row
            for row in eligible
            if row[0].status == SubscriptionStatus.ACTIVE
            and (row[0].ends_at is None or row[0].ends_at > now)
        ),
        eligible[0] if eligible else None,
    )
    base: dict[str, Any] = {
        "contract_version": 1,
        "application_id": str(authorization.application_id),
        "tenant_id": external_id,
        "checked_at": now.isoformat(),
        "status": "unassigned",
        "subscription_id": None,
        "plan_name": None,
        "starts_at": None,
        "ends_at": None,
        "entitlements": [],
        "restricted": False,
    }
    # An operator restriction blocks the whole account, with or without a subscription.
    restricted_at = await db.scalar(
        select(Subscriber.restricted_at).where(
            Subscriber.application_id == authorization.application_id,
            Subscriber.external_id == external_id,
        )
    )
    if restricted_at is not None:
        base.update(status="suspended", restricted=True)
    if current is None:
        return base
    subscription, subscriber = current
    state = subscription.status.value
    if subscriber.status != SubscriberStatus.ACTIVE:
        state = "suspended"
    elif subscription.ends_at is not None and subscription.ends_at <= now:
        state = "expired"
    base.update(
        status=state,
        subscription_id=str(subscription.id),
        plan_name=subscription.commercial_snapshot.get("plan_name"),
        starts_at=subscription.starts_at.isoformat(),
        ends_at=subscription.ends_at.isoformat() if subscription.ends_at else None,
        entitlements=[
            EntitlementSnapshot.model_validate(item).model_dump(mode="json")
            for item in subscription.entitlement_snapshot
        ],
    )
    return base


@router.put("/feature-catalog")
async def publish_feature_catalog(
    payload: FeatureManifest,
    authorization: IntegrationCredential,
    db: DatabaseSession,
    response: Response,
) -> dict[str, Any]:
    """The app publishes the features its code enforces; OS admins pick from these."""
    response.headers["Cache-Control"] = "no-store"
    counts = await catalog_service.sync_manifest(
        db, application_id=authorization.application_id, manifest=payload
    )
    return {"contract_version": 1, "application_id": str(authorization.application_id), **counts}


def resolved_visuals(
    plans: list[SubscriptionPlan], recommended: uuid.UUID | None
) -> dict[uuid.UUID, tuple[str, str]]:
    """Turn "auto" artwork/accent into concrete presets so every app shows the same card.

    Free plans get a leaf, the recommended plan a gem, the priciest paid plan (per month) a
    crown and other paid plans a rocket. The OS plan editor preview uses the same rule.
    """
    months = {"day": Decimal(1) / 30, "month": Decimal(1), "year": Decimal(12)}

    def monthly(plan: SubscriptionPlan) -> Decimal:
        return plan.price / (months[plan.duration_unit.value] * plan.duration_value)

    paid = [plan for plan in plans if plan.price > 0]
    top = max((monthly(plan) for plan in paid), default=None) if len(paid) > 1 else None
    result: dict[uuid.UUID, tuple[str, str]] = {}
    for plan in plans:
        if plan.price == 0:
            auto = ("leaf", "emerald")
        elif plan.id == recommended:
            auto = ("gem", "violet")
        elif top is not None and monthly(plan) == top:
            auto = ("crown", "amber")
        else:
            auto = ("rocket", "blue")
        result[plan.id] = (
            auto[0] if plan.artwork == "auto" else plan.artwork,
            auto[1] if plan.accent == "auto" else plan.accent,
        )
    return result


async def _live_offers(
    db: DatabaseSession, application_id: uuid.UUID, plans: list[SubscriptionPlan]
) -> dict[uuid.UUID, dict[str, Any]]:
    """Advertised offers that checkout would accept right now; anything else is left out.

    Display only: the discounted price is always recomputed by the checkout quote.
    """
    wanted = {plan.id: plan for plan in plans if plan.offer_coupon_id and plan.coupons_allowed}
    if not wanted:
        return {}
    now = datetime.now(UTC)
    coupons = {
        coupon.id: coupon
        for coupon in (
            await db.scalars(
                select(Coupon).where(
                    Coupon.application_id == application_id,
                    Coupon.id.in_({plan.offer_coupon_id for plan in wanted.values()}),
                    Coupon.kind == CouponKind.PROMOTION,
                    Coupon.status.in_([CouponStatus.ACTIVE, CouponStatus.SCHEDULED]),
                    Coupon.starts_at <= now,
                    Coupon.ends_at > now,
                    Coupon.redemption_count < Coupon.maximum_redemptions,
                )
            )
        ).all()
    }
    scopes: dict[uuid.UUID, set[uuid.UUID]] = {}
    for coupon_id, plan_id in (
        await db.execute(
            select(CouponPlan.coupon_id, CouponPlan.plan_id).where(
                CouponPlan.application_id == application_id,
                CouponPlan.coupon_id.in_(list(coupons)),
            )
        )
    ).all():
        scopes.setdefault(coupon_id, set()).add(plan_id)
    offers: dict[uuid.UUID, dict[str, Any]] = {}
    for plan_id, plan in wanted.items():
        coupon = coupons.get(plan.offer_coupon_id)  # type: ignore[arg-type]
        if coupon is None or (coupon.id in scopes and plan_id not in scopes[coupon.id]):
            continue
        if coupon.discount_type.value == "fixed" and coupon.currency != plan.currency:
            continue
        offers[plan_id] = {
            "code": coupon.code,
            "label": coupon.name,
            "discount_type": coupon.discount_type.value,
            "discount_value": str(coupon.discount_value),
            "ends_at": coupon.ends_at.isoformat(),
            "first_subscription_only": coupon.first_subscription_only,
        }
    return offers


@router.get("/subscription-catalog")
async def subscription_catalog(
    authorization: IntegrationCredential, db: DatabaseSession, response: Response
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    rows = (
        await db.execute(
            select(SubscriptionPlan, PlanUiItem)
            .join(
                PlanUiItem,
                (PlanUiItem.plan_id == SubscriptionPlan.id)
                & (PlanUiItem.application_id == SubscriptionPlan.application_id),
            )
            .where(
                SubscriptionPlan.application_id == authorization.application_id,
                PlanUiItem.application_id == authorization.application_id,
                PlanUiItem.visible.is_(True),
                SubscriptionPlan.status == PlanStatus.ACTIVE,
                or_(
                    SubscriptionPlan.effective_at.is_(None),
                    SubscriptionPlan.effective_at <= datetime.now(UTC),
                ),
            )
            .order_by(PlanUiItem.display_order, SubscriptionPlan.id)
        )
    ).all()
    recommended = await db.scalar(
        select(PlanUiConfig.recommended_plan_id).where(
            PlanUiConfig.application_id == authorization.application_id
        )
    )
    published_grants: dict[uuid.UUID, list[dict[str, Any]]] = {}
    if rows:
        grants = (
            await db.execute(
                select(PlanEntitlement, AppFeature)
                .join(
                    AppFeature,
                    (AppFeature.id == PlanEntitlement.feature_id)
                    & (AppFeature.application_id == PlanEntitlement.application_id),
                )
                .where(
                    PlanEntitlement.application_id == authorization.application_id,
                    AppFeature.application_id == authorization.application_id,
                    PlanEntitlement.plan_id.in_([plan.id for plan, _ in rows]),
                )
            )
        ).all()
        for grant, feature in sorted(grants, key=lambda row: (row[1].display_order, row[1].name)):
            published_grants.setdefault(grant.plan_id, []).append(
                {
                    **EntitlementSnapshot(
                        feature_code=feature.code,
                        enabled=grant.enabled,
                        limit_type=grant.limit_type,
                        limit_value=grant.limit_value,
                        unit=grant.unit,
                        reset_period=grant.reset_period,
                    ).model_dump(mode="json"),
                    # Display only; access decisions use feature_code.
                    "name": feature.name,
                    "description": feature.description,
                    "group": feature.group_name,
                }
            )
    features = (
        await db.scalars(
            select(AppFeature)
            .where(
                AppFeature.application_id == authorization.application_id,
                AppFeature.active.is_(True),
            )
            .order_by(AppFeature.display_order, AppFeature.name)
        )
    ).all()
    offers = await _live_offers(db, authorization.application_id, [plan for plan, _ in rows])
    visuals = resolved_visuals([plan for plan, _ in rows], recommended)
    return {
        "contract_version": 1,
        "application_id": str(authorization.application_id),
        "checkout_enabled": get_settings().razorpay_enabled,
        "plans": [
            {
                "id": str(plan.id),
                "name": item.display_label or plan.name,
                "description": plan.description,
                "price": str(plan.price),
                "currency": plan.currency,
                "duration_value": plan.duration_value,
                "duration_unit": plan.duration_unit.value,
                "entitlements": published_grants.get(plan.id, []),
                "recommended": plan.id == recommended,
                "tagline": plan.tagline,
                "badge": plan.badge,
                "compare_at_price": str(plan.compare_at_price) if plan.compare_at_price else None,
                "pricing_group": plan.pricing_group,
                "highlights": list(plan.highlights or []),
                "artwork": visuals[plan.id][0],
                "accent": visuals[plan.id][1],
                "coupons_allowed": plan.coupons_allowed,
                "offer": offers.get(plan.id),
            }
            for plan, item in rows
        ],
        # Every published feature, for the "compare all features" table.
        "features": [
            {
                "code": feature.code,
                "name": feature.name,
                "description": feature.description,
                "group": feature.group_name,
                "kind": "limit" if feature.supports_numeric_limit else "toggle",
            }
            for feature in features
        ],
    }
