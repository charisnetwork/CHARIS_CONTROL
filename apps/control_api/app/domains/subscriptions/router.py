from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.subscriptions.schemas import (
    SubscriberCreate,
    SubscriberRead,
    SubscriptionCreate,
    SubscriptionRead,
    UsageConsumeRequest,
    UsageConsumeResponse,
)
from app.domains.subscriptions.service import subscription_service

router = APIRouter(prefix="/apps/{app_id}", tags=["subscribers and subscriptions"])
ViewSubscribers = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_SUBSCRIBERS)),
]
ManageSubscribers = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.MANAGE_SUBSCRIBERS)),
]
ViewSubscriptions = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_SUBSCRIPTIONS)),
]
ManageSubscriptions = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.MANAGE_SUBSCRIPTIONS)),
]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


@router.get("/subscribers", response_model=list[SubscriberRead])
async def list_subscribers(
    authorization: ViewSubscribers,
    db: DatabaseSession,
) -> list[SubscriberRead]:
    subscribers = await subscription_service.list_subscribers(
        db, application_id=authorization.application_id
    )
    return [SubscriberRead.model_validate(subscriber) for subscriber in subscribers]


@router.post("/subscribers", response_model=SubscriberRead, status_code=status.HTTP_201_CREATED)
async def create_subscriber(
    payload: SubscriberCreate,
    request: Request,
    authorization: ManageSubscribers,
    db: DatabaseSession,
) -> SubscriberRead:
    subscriber = await subscription_service.create_subscriber(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return SubscriberRead.model_validate(subscriber)


@router.get("/subscriptions", response_model=list[SubscriptionRead])
async def list_subscriptions(
    authorization: ViewSubscriptions,
    db: DatabaseSession,
) -> list[SubscriptionRead]:
    subscriptions = await subscription_service.list_subscriptions(
        db, application_id=authorization.application_id
    )
    return [SubscriptionRead.model_validate(subscription) for subscription in subscriptions]


@router.post("/subscriptions", response_model=SubscriptionRead, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    payload: SubscriptionCreate,
    request: Request,
    authorization: ManageSubscriptions,
    db: DatabaseSession,
) -> SubscriptionRead:
    subscription = await subscription_service.create_subscription(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return SubscriptionRead.model_validate(subscription)


@router.post(
    "/subscriptions/{subscription_id}/usage/{feature_code}/consume",
    response_model=UsageConsumeResponse,
)
async def consume_usage(
    subscription_id: uuid.UUID,
    feature_code: str,
    payload: UsageConsumeRequest,
    authorization: ManageSubscriptions,
    db: DatabaseSession,
) -> UsageConsumeResponse:
    decision, consumed, replay, period_start, period_end = await subscription_service.consume_usage(
        db,
        application_id=authorization.application_id,
        subscription_id=subscription_id,
        feature_code=feature_code,
        payload=payload,
    )
    return UsageConsumeResponse(
        decision=decision,
        consumed=consumed,
        idempotent_replay=replay,
        period_start=period_start,
        period_end=period_end,
    )


__all__ = ["router"]
