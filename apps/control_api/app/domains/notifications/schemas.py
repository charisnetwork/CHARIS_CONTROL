from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import DeliveryStatus, NotificationAudienceType, NotificationStatus


class NotificationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    deep_link: str | None = Field(default=None, max_length=2048)
    action_metadata: dict[str, Any] = Field(default_factory=dict)
    audience_type: NotificationAudienceType
    plan_ids: list[uuid.UUID] = Field(default_factory=list)
    status: NotificationStatus = NotificationStatus.DRAFT
    scheduled_at: datetime | None = None

    @field_validator("deep_link")
    @classmethod
    def safe_deep_link(cls, value: str | None) -> str | None:
        if value is not None and (not value.startswith("/") or value.startswith("//")):
            raise ValueError("deep_link must be an application-relative path")
        return value

    @model_validator(mode="after")
    def validate_notification(self) -> Self:
        if self.audience_type == NotificationAudienceType.PLANS and not self.plan_ids:
            raise ValueError("plan audience requires at least one plan")
        if self.audience_type == NotificationAudienceType.ALL_SUBSCRIBERS and self.plan_ids:
            raise ValueError("all-subscriber audience cannot include plan IDs")
        if len(self.plan_ids) != len(set(self.plan_ids)):
            raise ValueError("plan_ids must not contain duplicates")
        if self.status not in {NotificationStatus.DRAFT, NotificationStatus.SCHEDULED}:
            raise ValueError("new notifications must be draft or scheduled")
        if self.status == NotificationStatus.SCHEDULED:
            if self.scheduled_at is None or self.scheduled_at.tzinfo is None:
                raise ValueError("scheduled notifications require a timezone-aware scheduled_at")
        elif self.scheduled_at is not None:
            raise ValueError("draft notifications cannot have scheduled_at")
        return self


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    title: str
    message: str
    deep_link: str | None
    action_metadata: dict[str, Any]
    audience_type: NotificationAudienceType
    status: NotificationStatus
    scheduled_at: datetime | None
    sent_at: datetime | None
    created_by_user_id: uuid.UUID
    plan_ids: list[uuid.UUID] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime


class NotificationDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    notification_id: uuid.UUID
    subscriber_id: uuid.UUID
    provider: str
    provider_reference: str | None
    status: DeliveryStatus
    attempt_count: int
    last_error_code: str | None
    last_attempt_at: datetime | None
    delivered_at: datetime | None


class DispatchResponse(BaseModel):
    notification_id: uuid.UUID
    status: NotificationStatus
    recipient_count: int
    idempotent_replay: bool


__all__ = [
    "DispatchResponse",
    "NotificationCreate",
    "NotificationDeliveryRead",
    "NotificationRead",
]
