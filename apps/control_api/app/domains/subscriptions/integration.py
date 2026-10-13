"""Read-only application adapter contract. Never accepts control-user credentials."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import Select, or_, select

from app.api.dependencies import DatabaseSession, IntegrationCredential
from app.db.models import (
    PlanStatus,
    PlanUiItem,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)
from app.domains.entitlements.schemas import EntitlementSnapshot

router = APIRouter(prefix="/integrations/apps/{app_id}", tags=["subscription integration"])


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
    }
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
    return {
        "contract_version": 1,
        "application_id": str(authorization.application_id),
        "checkout_enabled": False,
        "plans": [
            {
                "id": str(plan.id),
                "name": item.display_label or plan.name,
                "description": plan.description,
                "price": str(plan.price),
                "currency": plan.currency,
                "duration_value": plan.duration_value,
                "duration_unit": plan.duration_unit.value,
            }
            for plan, item in rows
        ],
    }
