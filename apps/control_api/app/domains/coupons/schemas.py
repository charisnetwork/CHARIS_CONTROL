from __future__ import annotations

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import CouponKind, CouponStatus, DurationUnit, ValueType

COUPON_CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,99}$")


class CouponCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=100)
    kind: CouponKind = CouponKind.PROMOTION
    affiliate_id: uuid.UUID | None = None
    discount_type: ValueType
    discount_value: Decimal = Field(gt=0, max_digits=19, decimal_places=4)
    commission_type: ValueType | None = None
    commission_value: Decimal | None = Field(default=None, gt=0, max_digits=19, decimal_places=4)
    commission_currency: str | None = Field(default=None, min_length=3, max_length=3)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    starts_at: datetime
    ends_at: datetime
    maximum_redemptions: int = Field(gt=0)
    per_subscriber_limit: int | None = Field(default=1, gt=0)
    first_subscription_only: bool = False
    minimum_duration_value: int | None = Field(default=None, gt=0)
    minimum_duration_unit: DurationUnit | None = None
    status: CouponStatus = CouponStatus.ACTIVE
    plan_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not COUPON_CODE_PATTERN.fullmatch(value):
            raise ValueError("code must use uppercase letters, numbers, hyphens, or underscores")
        return value

    @field_validator("currency", "commission_currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_coupon(self) -> Self:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("starts_at and ends_at must include a timezone")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.discount_type == ValueType.PERCENTAGE:
            if self.discount_value > 100 or self.currency is not None:
                raise ValueError("percentage discounts must be at most 100 and have no currency")
        elif self.currency is None:
            raise ValueError("fixed discounts require a currency")
        if self.kind == CouponKind.PROMOTION:
            if any(
                value is not None
                for value in (
                    self.affiliate_id,
                    self.commission_type,
                    self.commission_value,
                    self.commission_currency,
                )
            ):
                raise ValueError("promotion coupons cannot define affiliate commission fields")
        elif any(
            value is None
            for value in (self.affiliate_id, self.commission_type, self.commission_value)
        ):
            raise ValueError("affiliate coupons require affiliate and commission fields")
        if self.commission_type == ValueType.PERCENTAGE:
            if self.commission_value is not None and self.commission_value > 100:
                raise ValueError("percentage commission must be at most 100")
            if self.commission_currency is not None:
                raise ValueError("percentage commission must not define a currency")
        elif self.commission_type == ValueType.FIXED and self.commission_currency is None:
            raise ValueError("fixed commission requires a currency")
        if (self.minimum_duration_value is None) != (self.minimum_duration_unit is None):
            raise ValueError("minimum duration value and unit must be supplied together")
        if len(self.plan_ids) != len(set(self.plan_ids)):
            raise ValueError("plan_ids must not contain duplicates")
        return self


class CouponRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    name: str
    code: str
    kind: CouponKind
    affiliate_id: uuid.UUID | None
    discount_type: ValueType
    discount_value: Decimal
    commission_type: ValueType | None
    commission_value: Decimal | None
    commission_currency: str | None
    currency: str | None
    starts_at: datetime
    ends_at: datetime
    maximum_redemptions: int
    per_subscriber_limit: int | None
    first_subscription_only: bool
    minimum_duration_value: int | None
    minimum_duration_unit: DurationUnit | None
    redemption_count: int
    status: CouponStatus
    plan_ids: list[uuid.UUID] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime


__all__ = ["CouponCreate", "CouponRead"]
