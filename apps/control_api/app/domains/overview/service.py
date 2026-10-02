from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import cast

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Coupon,
    CouponStatus,
    HealthCheck,
    PlanStatus,
    Subscriber,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
)


@dataclass(frozen=True, slots=True)
class OverviewCountValues:
    subscribers: int
    subscriptions: int
    active_subscriptions: int
    plans: int
    active_coupons: int


def overview_counts_statement(application_id: uuid.UUID) -> Select[tuple[int, int, int, int, int]]:
    subscribers = (
        select(func.count(Subscriber.id))
        .where(Subscriber.application_id == application_id)
        .scalar_subquery()
    )
    subscriptions = (
        select(func.count(Subscription.id))
        .where(Subscription.application_id == application_id)
        .scalar_subquery()
    )
    active_subscriptions = (
        select(func.count(Subscription.id))
        .where(
            Subscription.application_id == application_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
        .scalar_subquery()
    )
    plans = (
        select(func.count(SubscriptionPlan.id))
        .where(
            SubscriptionPlan.application_id == application_id,
            SubscriptionPlan.status != PlanStatus.ARCHIVED,
        )
        .scalar_subquery()
    )
    active_coupons = (
        select(func.count(Coupon.id))
        .where(
            Coupon.application_id == application_id,
            Coupon.status == CouponStatus.ACTIVE,
        )
        .scalar_subquery()
    )
    return select(subscribers, subscriptions, active_subscriptions, plans, active_coupons)


class OverviewService:
    async def counts(self, db: AsyncSession, *, application_id: uuid.UUID) -> OverviewCountValues:
        row = (await db.execute(overview_counts_statement(application_id))).one()
        return OverviewCountValues(
            subscribers=int(row[0] or 0),
            subscriptions=int(row[1] or 0),
            active_subscriptions=int(row[2] or 0),
            plans=int(row[3] or 0),
            active_coupons=int(row[4] or 0),
        )

    async def latest_health(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> HealthCheck | None:
        return cast(
            HealthCheck | None,
            await db.scalar(
                select(HealthCheck)
                .where(HealthCheck.application_id == application_id)
                .order_by(HealthCheck.checked_at.desc(), HealthCheck.id.desc())
                .limit(1)
            ),
        )


overview_service = OverviewService()


__all__ = [
    "OverviewCountValues",
    "OverviewService",
    "overview_counts_statement",
    "overview_service",
]
