"""Give a plan's current features to customers who bought it before the features were added.

A subscription keeps the features it was sold with (entitlement_snapshot). When the owner later
switches a feature on, or raises a limit, on a plan, this lets them pass that on to chosen
existing subscribers. It only ever adds: a feature the plan has since switched off, or a lower
limit, never takes anything away from a customer.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AppFeature,
    AuditLog,
    PlanEntitlement,
    Subscriber,
    Subscription,
    SubscriptionEvent,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.domains.entitlements.schemas import EntitlementSnapshot

# Customers who still hold the plan: suspended ones get it too, for when they resume.
HOLDING = (SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED)
MAX_SUBSCRIPTIONS_PER_APPLY = 1000


def upgrade(current: dict[str, Any] | None, offered: EntitlementSnapshot) -> str | None:
    """What applying the plan's grant would do to the customer's grant, or None if nothing.

    'add': the customer doesn't have the feature (or it is off for them).
    'raise': they have it with a lower limit, counted the same way (same reset period).
    """
    if not offered.enabled:
        return None
    if current is None or not current.get("enabled"):
        return "add"
    if current.get("limit_type") == "unlimited":
        return None
    if offered.limit_type == "unlimited":
        return "raise"
    if current.get("reset_period") != (
        offered.reset_period.value if offered.reset_period else None
    ):
        return None  # counted differently: not comparable, leave it to a plan change
    if (offered.limit_value or 0) > (current.get("limit_value") or 0):
        return "raise"
    return None


def describe(grant: dict[str, Any] | EntitlementSnapshot | None) -> str:
    if grant is None:
        return "not included"
    data = grant.model_dump(mode="json") if isinstance(grant, EntitlementSnapshot) else grant
    if not data.get("enabled"):
        return "off"
    if data.get("limit_type") == "unlimited":
        return "unlimited"
    if data.get("limit_type") == "limited":
        period = data.get("reset_period")
        return f"{data.get('limit_value')}{f' / {period}' if period and period != 'total' else ''}"
    return "on"


async def _plan_grants(
    db: AsyncSession, application_id: uuid.UUID, plan_id: uuid.UUID
) -> tuple[SubscriptionPlan, list[tuple[AppFeature, EntitlementSnapshot]]]:
    plan = await db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.id == plan_id, SubscriptionPlan.application_id == application_id
        )
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    rows = (
        await db.execute(
            select(PlanEntitlement, AppFeature)
            .join(
                AppFeature,
                (AppFeature.id == PlanEntitlement.feature_id)
                & (AppFeature.application_id == PlanEntitlement.application_id),
            )
            .where(
                PlanEntitlement.application_id == application_id,
                PlanEntitlement.plan_id == plan.id,
                PlanEntitlement.enabled.is_(True),
            )
            .order_by(AppFeature.display_order, AppFeature.name)
        )
    ).all()
    grants = [
        (
            feature,
            EntitlementSnapshot(
                feature_code=feature.code,
                enabled=grant.enabled,
                limit_type=grant.limit_type,
                limit_value=grant.limit_value,
                unit=grant.unit,
                reset_period=grant.reset_period,
            ),
        )
        for grant, feature in rows
    ]
    return plan, grants


def _holding_statement(application_id: uuid.UUID, plan_id: uuid.UUID, now: datetime):
    return (
        select(Subscription, Subscriber)
        .join(
            Subscriber,
            (Subscriber.id == Subscription.subscriber_id)
            & (Subscriber.application_id == Subscription.application_id),
        )
        .where(
            Subscription.application_id == application_id,
            Subscription.plan_id == plan_id,
            Subscription.status.in_(HOLDING),
            or_(Subscription.ends_at.is_(None), Subscription.ends_at > now),
        )
        .order_by(Subscriber.name, Subscription.starts_at)
    )


def _changes(
    subscription: Subscription, grants: list[tuple[AppFeature, EntitlementSnapshot]]
) -> list[dict[str, Any]]:
    held = {item.get("feature_code"): item for item in subscription.entitlement_snapshot or []}
    changes = []
    for feature, offered in grants:
        kind = upgrade(held.get(feature.code), offered)
        if kind:
            changes.append(
                {
                    "feature_code": feature.code,
                    "feature_name": feature.name,
                    "change": kind,
                    "current": describe(held.get(feature.code)),
                    "new": describe(offered),
                }
            )
    return changes


class FeatureRolloutService:
    async def preview(
        self, db: AsyncSession, *, application_id: uuid.UUID, plan_id: uuid.UUID
    ) -> dict[str, Any]:
        """Every customer on the plan, with the features they would gain."""
        plan, grants = await _plan_grants(db, application_id, plan_id)
        rows = (
            await db.execute(_holding_statement(application_id, plan.id, datetime.now(UTC)))
        ).all()
        subscribers = [
            {
                "subscription_id": subscription.id,
                "subscriber_id": subscriber.id,
                "name": subscriber.name,
                "email": subscriber.email,
                "status": subscription.status.value,
                "ends_at": subscription.ends_at,
                "changes": _changes(subscription, grants),
            }
            for subscription, subscriber in rows
        ]
        return {
            "plan_id": plan.id,
            "plan_name": plan.name,
            "features": [
                {
                    "feature_code": feature.code,
                    "feature_name": feature.name,
                    "grant": describe(offered),
                }
                for feature, offered in grants
            ],
            "subscribers": subscribers,
        }

    async def apply(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        plan_id: uuid.UUID,
        principal: AuthenticatedUser,
        subscription_ids: list[uuid.UUID],
        feature_codes: list[str],
        correlation_id: str,
    ) -> dict[str, Any]:
        """Adds the chosen features (as the plan has them now) to the chosen subscriptions."""
        if not subscription_ids or not feature_codes:
            raise HTTPException(
                status_code=422, detail="Choose at least one customer and one feature"
            )
        if len(subscription_ids) > MAX_SUBSCRIPTIONS_PER_APPLY:
            raise HTTPException(status_code=422, detail="Too many customers in one go")
        plan, grants = await _plan_grants(db, application_id, plan_id)
        chosen = [
            (feature, offered) for feature, offered in grants if feature.code in set(feature_codes)
        ]
        if len(chosen) != len(set(feature_codes)):
            raise HTTPException(
                status_code=422,
                detail="Some features are not switched on in this plan any more. Refresh.",
            )
        now = datetime.now(UTC)
        statement = (
            _holding_statement(application_id, plan.id, now)
            .where(Subscription.id.in_(subscription_ids))
            .with_for_update(of=Subscription)
        )
        rows = (await db.execute(statement)).all()
        if len(rows) != len(set(subscription_ids)):
            raise HTTPException(
                status_code=409,
                detail="Some customers are no longer on this plan. Refresh the list and try again.",
            )
        updated = 0
        features_added = 0
        for subscription, subscriber in rows:
            changes = _changes(subscription, chosen)
            if not changes:
                continue
            by_code = {offered.feature_code: offered for _, offered in chosen}
            snapshot = [
                item
                for item in (subscription.entitlement_snapshot or [])
                if item.get("feature_code") not in {change["feature_code"] for change in changes}
            ]
            snapshot += [
                by_code[change["feature_code"]].model_dump(mode="json") for change in changes
            ]
            subscription.entitlement_snapshot = snapshot
            flag_modified(subscription, "entitlement_snapshot")
            subscription.version += 1
            details = {
                "plan_id": str(plan.id),
                "subscriber": subscriber.name,
                "changes": [
                    {key: change[key] for key in ("feature_code", "change", "current", "new")}
                    for change in changes
                ],
                "version": subscription.version,
            }
            db.add_all(
                [
                    SubscriptionEvent(
                        id=uuid.uuid4(),
                        application_id=application_id,
                        subscription_id=subscription.id,
                        event_type="subscription.features_added",
                        effective_at=now,
                        details=details,
                        actor_user_id=principal.user.id,
                    ),
                    AuditLog(
                        application_id=application_id,
                        actor_user_id=principal.user.id,
                        action="subscription.features_added",
                        entity_type="subscription",
                        entity_id=str(subscription.id),
                        correlation_id=correlation_id,
                        after_summary=details,
                    ),
                ]
            )
            updated += 1
            features_added += len(changes)
        await db.commit()
        return {"updated_subscriptions": updated, "features_added": features_added}


feature_rollout_service = FeatureRolloutService()
