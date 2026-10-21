from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AccessState = Literal[
    "active", "pending", "expired", "cancelled", "suspended", "no_plan", "restricted"
]


class UserCoupon(BaseModel):
    code: str
    name: str
    discount_amount: Decimal
    affiliate_id: uuid.UUID | None
    affiliate_name: str | None


class UserSubscription(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: str
    billing: str
    price: Decimal
    currency: str
    status: str
    starts_at: datetime
    ends_at: datetime | None
    cancelled_at: datetime | None
    coupon: UserCoupon | None


class UserPayment(BaseModel):
    id: uuid.UUID
    subscription_id: uuid.UUID
    amount: Decimal
    net_amount: Decimal
    currency: str
    status: str
    paid_at: datetime | None
    provider_payment_id: str


class UserRow(BaseModel):
    """One customer account of an app, as the app reports it. Read-only in OS."""

    id: uuid.UUID
    external_id: str
    business_name: str
    contact_name: str | None
    contact_user_id: str | None
    email: str | None
    mobile_number: str | None
    gender: str | None
    date_of_birth: date | None
    location: str | None
    team_size: int | None
    joined_at: datetime | None
    last_active_at: datetime | None
    profile_synced_at: datetime | None
    access: AccessState
    subscription: UserSubscription | None
    first_subscribed_at: datetime | None
    inactive_since: datetime | None
    total_paid: Decimal
    restricted_at: datetime | None
    restriction_reason: str | None


class UserPage(BaseModel):
    total: int
    items: list[UserRow]


class UserDetail(UserRow):
    subscriptions: list[UserSubscription]
    payments: list[UserPayment]


class RestrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=5, max_length=500)


class RestoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    note: str = Field(min_length=5, max_length=500)
