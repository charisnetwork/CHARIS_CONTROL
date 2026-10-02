from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AuditLog,
    DeliveryStatus,
    Notification,
    NotificationAudienceType,
    NotificationDelivery,
    NotificationPlanAudience,
    NotificationStatus,
    PlanStatus,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    WebhookEvent,
)
from app.domains.notifications.schemas import NotificationCreate


def locked_notification_statement(
    application_id: uuid.UUID, notification_id: uuid.UUID
) -> Select[tuple[Notification]]:
    return (
        select(Notification)
        .where(
            Notification.application_id == application_id,
            Notification.id == notification_id,
        )
        .with_for_update()
    )


class NotificationService:
    async def list_notifications(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[tuple[Notification, list[uuid.UUID]]]:
        notifications = list(
            (
                await db.scalars(
                    select(Notification)
                    .where(Notification.application_id == application_id)
                    .order_by(Notification.created_at.desc(), Notification.id)
                )
            ).all()
        )
        if not notifications:
            return []
        audiences = (
            await db.execute(
                select(
                    NotificationPlanAudience.notification_id,
                    NotificationPlanAudience.plan_id,
                ).where(
                    NotificationPlanAudience.application_id == application_id,
                    NotificationPlanAudience.notification_id.in_(
                        [notification.id for notification in notifications]
                    ),
                )
            )
        ).all()
        by_notification: dict[uuid.UUID, list[uuid.UUID]] = {
            notification.id: [] for notification in notifications
        }
        for notification_id, plan_id in audiences:
            by_notification[notification_id].append(plan_id)
        return [(item, by_notification[item.id]) for item in notifications]

    async def create_notification(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: NotificationCreate,
        correlation_id: str,
    ) -> tuple[Notification, list[uuid.UUID]]:
        if payload.plan_ids:
            plan_count = await db.scalar(
                select(func.count())
                .select_from(SubscriptionPlan)
                .where(
                    SubscriptionPlan.application_id == application_id,
                    SubscriptionPlan.id.in_(payload.plan_ids),
                    SubscriptionPlan.status != PlanStatus.ARCHIVED,
                )
            )
            if plan_count != len(payload.plan_ids):
                raise HTTPException(
                    status_code=422, detail="Audience plans must belong to this application"
                )
        notification = Notification(
            id=uuid.uuid4(),
            application_id=application_id,
            title=payload.title,
            message=payload.message,
            deep_link=payload.deep_link,
            action_metadata=payload.action_metadata,
            audience_type=payload.audience_type,
            status=payload.status,
            scheduled_at=payload.scheduled_at,
            sent_at=None,
            created_by_user_id=principal.user.id,
        )
        db.add_all(
            [
                notification,
                *[
                    NotificationPlanAudience(
                        application_id=application_id,
                        notification_id=notification.id,
                        plan_id=plan_id,
                    )
                    for plan_id in payload.plan_ids
                ],
                self._audit(
                    application_id,
                    principal,
                    "notification.created",
                    notification.id,
                    correlation_id,
                    {
                        "status": notification.status.value,
                        "audience_type": notification.audience_type.value,
                    },
                ),
            ]
        )
        await self._commit(db, "Notification could not be created")
        return notification, payload.plan_ids

    async def dispatch(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        notification_id: uuid.UUID,
        principal: AuthenticatedUser | None,
        correlation_id: str,
    ) -> tuple[Notification, int, bool]:
        notification = await db.scalar(
            locked_notification_statement(application_id, notification_id)
        )
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        existing_count = await db.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .where(
                NotificationDelivery.application_id == application_id,
                NotificationDelivery.notification_id == notification_id,
            )
        )
        if existing_count:
            return notification, existing_count, True
        if notification.status not in {NotificationStatus.DRAFT, NotificationStatus.SCHEDULED}:
            raise HTTPException(status_code=409, detail="Notification cannot be dispatched")
        now = datetime.now(UTC)
        subscriber_ids = await self._recipient_ids(
            db, application_id=application_id, notification=notification, now=now
        )
        deliveries = [
            NotificationDelivery(
                id=uuid.uuid4(),
                application_id=application_id,
                notification_id=notification.id,
                subscriber_id=subscriber_id,
                idempotency_key=f"notification:{notification.id}:subscriber:{subscriber_id}",
                provider="application_adapter",
                status=DeliveryStatus.PENDING,
                attempt_count=0,
            )
            for subscriber_id in subscriber_ids
        ]
        notification.status = (
            NotificationStatus.PROCESSING if deliveries else NotificationStatus.SENT
        )
        notification.sent_at = now if not deliveries else None
        notification.version += 1
        db.add_all(
            [
                *deliveries,
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    event_type="notification.dispatch.requested",
                    aggregate_type="notification",
                    aggregate_id=str(notification.id),
                    payload={
                        "notification_id": str(notification.id),
                        "recipient_count": len(deliveries),
                    },
                    idempotency_key=f"notification.dispatch.requested:{notification.id}",
                    occurred_at=now,
                ),
                self._audit(
                    application_id,
                    principal,
                    "notification.dispatched",
                    notification.id,
                    correlation_id,
                    {"recipient_count": len(deliveries)},
                ),
            ]
        )
        await self._commit(db, "Notification dispatch was already created")
        return notification, len(deliveries), False

    async def dispatch_due(self, db: AsyncSession, *, limit: int = 100) -> tuple[int, int]:
        now = datetime.now(UTC)
        due = (
            await db.execute(
                select(Notification.application_id, Notification.id)
                .where(
                    Notification.status == NotificationStatus.SCHEDULED,
                    Notification.scheduled_at <= now,
                )
                .order_by(Notification.scheduled_at, Notification.id)
                .limit(limit)
            )
        ).all()
        processed = 0
        recipients = 0
        for application_id, notification_id in due:
            _, count, replay = await self.dispatch(
                db,
                application_id=application_id,
                notification_id=notification_id,
                principal=None,
                correlation_id=f"notification-scheduler:{notification_id}",
            )
            if not replay:
                processed += 1
                recipients += count
        return processed, recipients

    async def cancel(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        notification_id: uuid.UUID,
        principal: AuthenticatedUser,
        correlation_id: str,
    ) -> Notification:
        notification = await db.scalar(
            locked_notification_statement(application_id, notification_id)
        )
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        if notification.status not in {NotificationStatus.DRAFT, NotificationStatus.SCHEDULED}:
            raise HTTPException(
                status_code=409, detail="Only draft or scheduled notifications can be cancelled"
            )
        notification.status = NotificationStatus.CANCELLED
        notification.version += 1
        db.add(
            self._audit(
                application_id,
                principal,
                "notification.cancelled",
                notification.id,
                correlation_id,
                {},
            )
        )
        await db.commit()
        return notification

    async def list_deliveries(
        self, db: AsyncSession, *, application_id: uuid.UUID, notification_id: uuid.UUID
    ) -> list[NotificationDelivery]:
        found = await db.scalar(
            select(Notification.id).where(
                Notification.application_id == application_id, Notification.id == notification_id
            )
        )
        if found is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        rows = await db.scalars(
            select(NotificationDelivery)
            .where(
                NotificationDelivery.application_id == application_id,
                NotificationDelivery.notification_id == notification_id,
            )
            .order_by(NotificationDelivery.subscriber_id)
        )
        return list(rows.all())

    async def _recipient_ids(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        notification: Notification,
        now: datetime,
    ) -> list[uuid.UUID]:
        if notification.audience_type == NotificationAudienceType.ALL_SUBSCRIBERS:
            statement = select(Subscriber.id).where(
                Subscriber.application_id == application_id,
                Subscriber.status == SubscriberStatus.ACTIVE,
            )
        else:
            plan_ids = select(NotificationPlanAudience.plan_id).where(
                NotificationPlanAudience.application_id == application_id,
                NotificationPlanAudience.notification_id == notification.id,
            )
            statement = (
                select(Subscriber.id)
                .join(
                    Subscription,
                    (Subscription.subscriber_id == Subscriber.id)
                    & (Subscription.application_id == Subscriber.application_id),
                )
                .where(
                    Subscriber.application_id == application_id,
                    Subscriber.status == SubscriberStatus.ACTIVE,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                    Subscription.starts_at <= now,
                    (Subscription.ends_at.is_(None)) | (Subscription.ends_at > now),
                    Subscription.plan_id.in_(plan_ids),
                )
                .distinct()
            )
        return list((await db.scalars(statement)).all())

    @staticmethod
    def _audit(
        application_id: uuid.UUID,
        principal: AuthenticatedUser | None,
        action: str,
        notification_id: uuid.UUID,
        correlation_id: str,
        after: dict[str, object],
    ) -> AuditLog:
        return AuditLog(
            application_id=application_id,
            actor_user_id=principal.user.id if principal is not None else None,
            action=action,
            entity_type="notification",
            entity_id=str(notification_id),
            correlation_id=correlation_id,
            after_summary=after,
        )

    @staticmethod
    async def _commit(db: AsyncSession, detail: str) -> None:
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=409, detail=detail) from exc


notification_service = NotificationService()

__all__ = ["NotificationService", "locked_notification_statement", "notification_service"]
