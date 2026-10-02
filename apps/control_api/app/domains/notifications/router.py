from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission, Notification
from app.domains.notifications.schemas import (
    DispatchResponse,
    NotificationCreate,
    NotificationDeliveryRead,
    NotificationRead,
)
from app.domains.notifications.service import notification_service

router = APIRouter(prefix="/apps/{app_id}/notifications", tags=["notifications"])
ViewNotifications = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_NOTIFICATIONS))
]
ManageNotifications = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_NOTIFICATIONS))
]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


def _read(notification: Notification, plan_ids: list[uuid.UUID]) -> NotificationRead:
    return NotificationRead.model_validate({**notification.__dict__, "plan_ids": plan_ids})


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    authorization: ViewNotifications, db: DatabaseSession
) -> list[NotificationRead]:
    rows = await notification_service.list_notifications(
        db, application_id=authorization.application_id
    )
    return [_read(notification, plan_ids) for notification, plan_ids in rows]


@router.post("", response_model=NotificationRead, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    request: Request,
    authorization: ManageNotifications,
    db: DatabaseSession,
) -> NotificationRead:
    notification, plan_ids = await notification_service.create_notification(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return _read(notification, plan_ids)


@router.post("/{notification_id}/dispatch", response_model=DispatchResponse)
async def dispatch_notification(
    notification_id: uuid.UUID,
    request: Request,
    authorization: ManageNotifications,
    db: DatabaseSession,
) -> DispatchResponse:
    notification, recipient_count, replay = await notification_service.dispatch(
        db,
        application_id=authorization.application_id,
        notification_id=notification_id,
        principal=authorization.principal,
        correlation_id=_correlation_id(request),
    )
    return DispatchResponse(
        notification_id=notification.id,
        status=notification.status,
        recipient_count=recipient_count,
        idempotent_replay=replay,
    )


@router.post("/{notification_id}/cancel", response_model=NotificationRead)
async def cancel_notification(
    notification_id: uuid.UUID,
    request: Request,
    authorization: ManageNotifications,
    db: DatabaseSession,
) -> NotificationRead:
    notification = await notification_service.cancel(
        db,
        application_id=authorization.application_id,
        notification_id=notification_id,
        principal=authorization.principal,
        correlation_id=_correlation_id(request),
    )
    return _read(notification, [])


@router.get("/{notification_id}/deliveries", response_model=list[NotificationDeliveryRead])
async def list_notification_deliveries(
    notification_id: uuid.UUID,
    authorization: ViewNotifications,
    db: DatabaseSession,
) -> list[NotificationDeliveryRead]:
    rows = await notification_service.list_deliveries(
        db,
        application_id=authorization.application_id,
        notification_id=notification_id,
    )
    return [NotificationDeliveryRead.model_validate(row) for row in rows]


__all__ = ["router"]
