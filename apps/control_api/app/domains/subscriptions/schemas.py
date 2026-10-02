from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.db.models import SubscriberStatus, SubscriptionStatus
from app.domains.entitlements.schemas import EntitlementDecision, EntitlementSnapshot


class SubscriberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    external_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = None
    mobile_number: str | None = Field(default=None, max_length=32)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubscriberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    external_id: str
    name: str
    email: EmailStr | None
    mobile_number: str | None
    status: SubscriberStatus
    metadata: dict[str, Any] = Field(validation_alias=AliasChoices("metadata_json", "metadata"))
    version: int
    created_at: datetime
    updated_at: datetime


class SubscriptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subscriber_id: uuid.UUID
    plan_id: uuid.UUID
    external_id: str | None = Field(default=None, max_length=255)
    starts_at: datetime
    auto_renews: bool = False
    coupon_code: str | None = Field(default=None, min_length=2, max_length=100)
    coupon_idempotency_key: str | None = Field(default=None, min_length=8, max_length=255)

    @field_validator("coupon_code", mode="before")
    @classmethod
    def normalize_coupon_code(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("starts_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("starts_at must include a timezone")
        return value

    @model_validator(mode="after")
    def require_coupon_pair(self) -> Self:
        if (self.coupon_code is None) != (self.coupon_idempotency_key is None):
            raise ValueError("coupon_code and coupon_idempotency_key must be supplied together")
        return self


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    subscriber_id: uuid.UUID
    plan_id: uuid.UUID
    external_id: str | None
    status: SubscriptionStatus
    starts_at: datetime
    ends_at: datetime | None
    auto_renews: bool
    commercial_snapshot: dict[str, Any]
    entitlement_snapshot: list[EntitlementSnapshot]
    version: int
    created_at: datetime
    updated_at: datetime


class UsageConsumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(min_length=8, max_length=255)
    amount: int = Field(default=1, gt=0, le=1_000_000_000)
    operation: str = Field(min_length=2, max_length=100)
    metadata: dict[str, Any] = Field(default_factory=dict)


class UsageConsumeResponse(BaseModel):
    decision: EntitlementDecision
    consumed: bool
    idempotent_replay: bool
    period_start: datetime | None
    period_end: datetime | None


__all__ = [
    "SubscriberCreate",
    "SubscriberRead",
    "SubscriptionCreate",
    "SubscriptionRead",
    "UsageConsumeRequest",
    "UsageConsumeResponse",
]
