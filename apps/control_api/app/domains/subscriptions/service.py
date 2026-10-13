from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AppFeature,
    AuditLog,
    DurationUnit,
    PlanEntitlement,
    PlanStatus,
    Subscriber,
    Subscription,
    SubscriptionEvent,
    SubscriptionPlan,
    SubscriptionStatus,
    UsageCounter,
    UsageEvent,
    WebhookEvent,
)
from app.domains.coupons.service import coupon_service
from app.domains.entitlements.schemas import EntitlementDecision, EntitlementSnapshot
from app.domains.entitlements.service import evaluate_entitlement
from app.domains.subscriptions.schemas import (
    SubscriberCreate,
    SubscriptionCreate,
    SubscriptionReplaceTerm,
    SubscriptionTransition,
    UsageConsumeRequest,
)


def _subscription_end(starts_at: datetime, value: int, unit: DurationUnit) -> datetime:
    if unit == DurationUnit.DAY:
        return starts_at + timedelta(days=value)
    if unit == DurationUnit.MONTH:
        return starts_at + relativedelta(months=value)
    return starts_at + relativedelta(years=value)


def _period_bounds(
    snapshot: EntitlementSnapshot,
    *,
    subscription: Subscription,
    now: datetime,
) -> tuple[datetime, datetime | None]:
    period = snapshot.reset_period
    if period is None or period.value in {"total", "billing_cycle"}:
        return subscription.starts_at, subscription.ends_at
    if period.value == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=1)
    if period.value == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        days = monthrange(start.year, start.month)[1]
        return start, start + timedelta(days=days)
    start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, start + relativedelta(years=1)


def locked_subscription_statement(
    application_id: uuid.UUID, subscription_id: uuid.UUID
) -> Select[tuple[Subscription]]:
    return (
        select(Subscription)
        .where(
            Subscription.id == subscription_id,
            Subscription.application_id == application_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def locked_counter_statement(
    application_id: uuid.UUID,
    subscription_id: uuid.UUID,
    feature_id: uuid.UUID,
    period_start: datetime,
) -> Select[tuple[UsageCounter]]:
    return (
        select(UsageCounter)
        .where(
            UsageCounter.application_id == application_id,
            UsageCounter.subscription_id == subscription_id,
            UsageCounter.feature_id == feature_id,
            UsageCounter.period_start == period_start,
        )
        .with_for_update()
    )


def _audit(
    application_id: uuid.UUID,
    principal: AuthenticatedUser,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    correlation_id: str,
    after: dict[str, object],
) -> AuditLog:
    return AuditLog(
        application_id=application_id,
        actor_user_id=principal.user.id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        correlation_id=correlation_id,
        after_summary=after,
    )


def transition_target(
    current: SubscriptionStatus, action: str, ends_at: datetime | None, now: datetime
) -> SubscriptionStatus:
    allowed = {
        "suspend": ({SubscriptionStatus.ACTIVE}, SubscriptionStatus.SUSPENDED),
        "resume": ({SubscriptionStatus.SUSPENDED}, SubscriptionStatus.ACTIVE),
        "cancel": (
            {SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED},
            SubscriptionStatus.CANCELLED,
        ),
    }
    rule = allowed.get(action)
    if rule is None or current not in rule[0]:
        raise HTTPException(status_code=409, detail="Invalid subscription transition")
    if action != "cancel" and ends_at is not None and ends_at <= now:
        raise HTTPException(status_code=409, detail="Expired subscriptions require a new term")
    return rule[1]


class SubscriptionService:
    async def replace_term(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        subscription_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: SubscriptionReplaceTerm,
        correlation_id: str,
    ) -> Subscription:
        preliminary = await db.scalar(
            select(Subscription).where(
                Subscription.id == subscription_id, Subscription.application_id == application_id
            )
        )
        if preliminary is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        await db.scalar(
            select(Subscriber)
            .where(
                Subscriber.id == preliminary.subscriber_id,
                Subscriber.application_id == application_id,
            )
            .with_for_update()
        )
        old = await db.scalar(locked_subscription_statement(application_id, subscription_id))
        if old is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        if old.version != payload.expected_version:
            raise HTTPException(
                status_code=409, detail="Subscription changed. Refresh before retrying."
            )
        now = datetime.now(UTC)
        if payload.action == "renew":
            if (
                old.ends_at is None
                or old.ends_at > now
                or old.status == SubscriptionStatus.CANCELLED
            ):
                raise HTTPException(
                    status_code=409, detail="Renewal requires an expired, non-cancelled term"
                )
            if payload.plan_id != old.plan_id:
                raise HTTPException(
                    status_code=422,
                    detail="Renewal uses the same plan; select replacement to change plans",
                )
        elif old.status not in {SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED}:
            raise HTTPException(
                status_code=409, detail="Only active or suspended subscriptions can be replaced"
            )
        # Do not overwrite a newer term or leave another suspended term resumable.
        other = await db.scalar(
            select(Subscription.id).where(
                Subscription.application_id == application_id,
                Subscription.subscriber_id == old.subscriber_id,
                Subscription.id != old.id,
                Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]),
            )
        )
        if other is not None:
            raise HTTPException(
                status_code=409, detail="Another current term exists for this subscriber"
            )
        old.status = (
            SubscriptionStatus.EXPIRED
            if payload.action == "renew"
            else SubscriptionStatus.CANCELLED
        )
        old.auto_renews = False
        old.version += 1
        if payload.action == "replace":
            old.cancelled_at = now
        await db.flush()
        new = await self.create_subscription(
            db,
            application_id=application_id,
            principal=principal,
            payload=SubscriptionCreate(
                subscriber_id=old.subscriber_id,
                plan_id=payload.plan_id,
                starts_at=now,
                auto_renews=False,
            ),
            correlation_id=correlation_id,
            commit=False,
        )
        details: dict[str, object] = {
            "old_subscription_id": str(old.id),
            "new_subscription_id": str(new.id),
            "reason": payload.reason,
            "action": payload.action,
            "payment_processed": False,
        }
        event_type = f"subscription.{payload.action}"
        db.add_all(
            [
                SubscriptionEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    subscription_id=old.id,
                    event_type=event_type,
                    effective_at=now,
                    details=details,
                    actor_user_id=principal.user.id,
                ),
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    event_type=event_type,
                    aggregate_type="subscription",
                    aggregate_id=str(new.id),
                    payload=details,
                    occurred_at=now,
                    idempotency_key=f"subscription.replace-term:{old.id}:{old.version}",
                ),
                _audit(
                    application_id,
                    principal,
                    event_type,
                    "subscription",
                    old.id,
                    correlation_id,
                    details,
                ),
            ]
        )
        await self._commit_unique(db, "Subscriber already has another current term")
        await db.refresh(new)
        return new

    async def transition(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        subscription_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: SubscriptionTransition,
        correlation_id: str,
    ) -> Subscription:
        record = await db.scalar(locked_subscription_statement(application_id, subscription_id))
        if record is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        if record.version != payload.expected_version:
            raise HTTPException(
                status_code=409, detail="Subscription changed. Refresh before retrying."
            )
        now = datetime.now(UTC)
        target = transition_target(record.status, payload.action, record.ends_at, now)
        before = record.status.value
        record.status = target
        record.version += 1
        if target == SubscriptionStatus.CANCELLED:
            record.cancelled_at = now
            record.auto_renews = False
        details: dict[str, object] = {
            "previous_status": before,
            "status": target.value,
            "reason": payload.reason,
            "version": record.version,
        }
        event_type = f"subscription.{payload.action}"
        db.add_all(
            [
                SubscriptionEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    subscription_id=record.id,
                    event_type=event_type,
                    effective_at=now,
                    details=details,
                    actor_user_id=principal.user.id,
                ),
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    event_type=event_type,
                    aggregate_type="subscription",
                    aggregate_id=str(record.id),
                    payload={"subscription_id": str(record.id), **details},
                    idempotency_key=f"subscription.transition:{record.id}:{record.version}",
                    occurred_at=now,
                ),
                _audit(
                    application_id,
                    principal,
                    event_type,
                    "subscription",
                    record.id,
                    correlation_id,
                    details,
                ),
            ]
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=409, detail="Subscription conflicts with an active plan"
            ) from exc
        await db.refresh(record)
        return record

    async def list_subscribers(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[Subscriber]:
        rows = await db.scalars(
            select(Subscriber)
            .where(Subscriber.application_id == application_id)
            .order_by(Subscriber.created_at.desc(), Subscriber.id)
        )
        return list(rows.all())

    async def create_subscriber(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: SubscriberCreate,
        correlation_id: str,
    ) -> Subscriber:
        subscriber = Subscriber(
            id=uuid.uuid4(),
            application_id=application_id,
            external_id=payload.external_id,
            name=payload.name,
            email=str(payload.email) if payload.email else None,
            mobile_number=payload.mobile_number,
            metadata_json=payload.metadata,
        )
        db.add_all(
            [
                subscriber,
                _audit(
                    application_id,
                    principal,
                    "subscriber.created",
                    "subscriber",
                    subscriber.id,
                    correlation_id,
                    {"external_id": subscriber.external_id},
                ),
            ]
        )
        await self._commit_unique(db, "A subscriber with this external ID already exists")
        return subscriber

    async def list_subscriptions(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[Subscription]:
        rows = await db.scalars(
            select(Subscription)
            .where(Subscription.application_id == application_id)
            .order_by(Subscription.created_at.desc(), Subscription.id)
        )
        return list(rows.all())

    async def create_subscription(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: SubscriptionCreate,
        correlation_id: str,
        commit: bool = True,
        initial_status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    ) -> Subscription:
        subscriber = await db.scalar(
            select(Subscriber)
            .where(
                Subscriber.id == payload.subscriber_id,
                Subscriber.application_id == application_id,
            )
            .with_for_update()
        )
        now = datetime.now(UTC)
        plan = await db.scalar(
            select(SubscriptionPlan)
            .where(
                SubscriptionPlan.id == payload.plan_id,
                SubscriptionPlan.application_id == application_id,
                SubscriptionPlan.status == PlanStatus.ACTIVE,
                or_(SubscriptionPlan.effective_at.is_(None), SubscriptionPlan.effective_at <= now),
            )
            .with_for_update()
        )
        if subscriber is None or plan is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Subscriber and active plan must belong to the selected application",
            )
        if payload.starts_at > now:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Future subscription activation is not implemented yet",
            )
        existing = await db.scalar(
            select(Subscription.id).where(
                Subscription.application_id == application_id,
                Subscription.subscriber_id == subscriber.id,
                Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]),
            )
        )
        if existing is not None and initial_status == SubscriptionStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Subscriber already has an active or suspended subscription",
            )

        entitlement_rows = (
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
                )
            )
        ).all()
        snapshots = [
            EntitlementSnapshot(
                feature_code=feature.code,
                enabled=entitlement.enabled,
                limit_type=entitlement.limit_type,
                limit_value=entitlement.limit_value,
                unit=entitlement.unit,
                reset_period=entitlement.reset_period,
            )
            for entitlement, feature in entitlement_rows
        ]
        ends_at = _subscription_end(payload.starts_at, plan.duration_value, plan.duration_unit)
        subscription = Subscription(
            id=uuid.uuid4(),
            application_id=application_id,
            subscriber_id=subscriber.id,
            plan_id=plan.id,
            external_id=payload.external_id,
            status=initial_status,
            starts_at=payload.starts_at,
            ends_at=ends_at,
            auto_renews=payload.auto_renews,
            commercial_snapshot={
                "plan_code": plan.code,
                "plan_name": plan.name,
                "price": str(Decimal(plan.price)),
                "currency": plan.currency,
                "duration_value": plan.duration_value,
                "duration_unit": plan.duration_unit.value,
            },
            entitlement_snapshot=[item.model_dump(mode="json") for item in snapshots],
        )
        if payload.coupon_code is not None and payload.coupon_idempotency_key is not None:
            applied = await coupon_service.apply_to_subscription(
                db,
                application_id=application_id,
                subscriber_id=subscriber.id,
                subscription=subscription,
                plan=plan,
                code=payload.coupon_code,
                idempotency_key=payload.coupon_idempotency_key,
                now=now,
            )
            subscription.commercial_snapshot.update(
                {
                    "gross_price": str(Decimal(plan.price)),
                    "coupon_code": applied.code,
                    "discount_amount": str(applied.discount_amount),
                    "final_price": str(applied.final_amount),
                }
            )
        else:
            subscription.commercial_snapshot.update(
                {
                    "gross_price": str(Decimal(plan.price)),
                    "discount_amount": "0.00",
                    "final_price": str(Decimal(plan.price)),
                }
            )
        # Coupon processing may already have flushed this parent. Explicitly
        # mark the JSON snapshot changed after adding the commercial outcome.
        flag_modified(subscription, "commercial_snapshot")
        db.add(subscription)
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=409, detail="The active subscription conflicts with an existing record"
            ) from exc
        event = SubscriptionEvent(
            id=uuid.uuid4(),
            application_id=application_id,
            subscription_id=subscription.id,
            event_type="subscription.created",
            effective_at=payload.starts_at,
            details={
                "plan_id": str(plan.id),
                "subscriber_id": str(subscriber.id),
                "coupon_code": payload.coupon_code,
            },
            actor_user_id=principal.user.id,
        )
        webhook = WebhookEvent(
            id=uuid.uuid4(),
            application_id=application_id,
            event_type="subscription.created",
            aggregate_type="subscription",
            aggregate_id=str(subscription.id),
            payload={
                "subscription_id": str(subscription.id),
                "subscriber_external_id": subscriber.external_id,
                "plan_code": plan.code,
                "coupon_code": payload.coupon_code,
            },
            idempotency_key=f"subscription.created:{subscription.id}",
            occurred_at=now,
        )
        db.add_all(
            [
                subscription,
                event,
                webhook,
                _audit(
                    application_id,
                    principal,
                    "subscription.created",
                    "subscription",
                    subscription.id,
                    correlation_id,
                    {
                        "subscriber_id": str(subscriber.id),
                        "plan_id": str(plan.id),
                        "entitlement_count": len(snapshots),
                    },
                ),
            ]
        )
        if commit:
            await self._commit_unique(
                db, "The active subscription conflicts with an existing record"
            )
        return subscription

    async def consume_usage(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        subscription_id: uuid.UUID,
        feature_code: str,
        payload: UsageConsumeRequest,
    ) -> tuple[EntitlementDecision, bool, bool, datetime | None, datetime | None]:
        subscription = await db.scalar(
            locked_subscription_statement(application_id, subscription_id)
        )
        now = datetime.now(UTC)
        if (
            subscription is None
            or subscription.status != SubscriptionStatus.ACTIVE
            or subscription.starts_at > now
            or (subscription.ends_at is not None and subscription.ends_at <= now)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Subscription is not active",
            )
        snapshots = [
            EntitlementSnapshot.model_validate(item) for item in subscription.entitlement_snapshot
        ]
        normalized_code = feature_code.strip().casefold().replace("-", "_")
        snapshot = next((item for item in snapshots if item.feature_code == normalized_code), None)
        if snapshot is None or not snapshot.enabled:
            decision = evaluate_entitlement(
                snapshots, feature_code=normalized_code, requested_value=payload.amount
            )
            return decision, False, False, None, None

        feature = await db.scalar(
            select(AppFeature).where(
                AppFeature.application_id == application_id,
                AppFeature.code == normalized_code,
                AppFeature.active.is_(True),
            )
        )
        if feature is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Entitled feature is no longer registered",
            )
        period_start, period_end = _period_bounds(snapshot, subscription=subscription, now=now)
        counter = await db.scalar(
            locked_counter_statement(
                application_id,
                subscription_id,
                feature.id,
                period_start,
            )
        )
        if counter is None:
            counter = UsageCounter(
                id=uuid.uuid4(),
                application_id=application_id,
                subscription_id=subscription_id,
                feature_id=feature.id,
                period_start=period_start,
                period_end=period_end,
                used_value=0,
            )
            db.add(counter)
            await db.flush()

        prior_event = await db.scalar(
            select(UsageEvent).where(
                UsageEvent.application_id == application_id,
                UsageEvent.idempotency_key == payload.idempotency_key,
            )
        )
        if prior_event is not None:
            if (
                prior_event.counter_id != counter.id
                or prior_event.delta != payload.amount
                or prior_event.operation != payload.operation
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key was already used for a different usage request",
                )
            current_decision = evaluate_entitlement(
                snapshots,
                feature_code=normalized_code,
                used_value=counter.used_value,
                requested_value=1,
            )
            decision = current_decision.model_copy(
                update={"allowed": True, "reason": "idempotent_replay"}
            )
            return decision, True, True, period_start, period_end

        decision = evaluate_entitlement(
            snapshots,
            feature_code=normalized_code,
            used_value=counter.used_value,
            requested_value=payload.amount,
        )
        if not decision.allowed:
            return decision, False, False, period_start, period_end

        counter.used_value += payload.amount
        counter.version += 1
        db.add(
            UsageEvent(
                id=uuid.uuid4(),
                application_id=application_id,
                counter_id=counter.id,
                idempotency_key=payload.idempotency_key,
                delta=payload.amount,
                operation=payload.operation,
                metadata_json=payload.metadata,
                occurred_at=now,
            )
        )
        await self._commit_unique(db, "Usage request conflicts with an existing idempotency key")
        final_decision = evaluate_entitlement(
            snapshots,
            feature_code=normalized_code,
            used_value=counter.used_value,
            requested_value=1,
        )
        return final_decision, True, False, period_start, period_end

    @staticmethod
    async def _commit_unique(db: AsyncSession, detail: str) -> None:
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc


subscription_service = SubscriptionService()


__all__ = [
    "SubscriptionService",
    "locked_counter_statement",
    "locked_subscription_statement",
    "subscription_service",
]
