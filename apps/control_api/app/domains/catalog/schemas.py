from __future__ import annotations

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import DurationUnit, LimitType, PlanStatus, ResetPeriod

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,99}$")


class FeatureCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    default_unit: str | None = Field(default=None, max_length=64)
    allowed_reset_periods: list[ResetPeriod] = Field(default_factory=list)
    supports_numeric_limit: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        return value.strip().casefold().replace("-", "_") if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not CODE_PATTERN.fullmatch(value):
            raise ValueError("code must use lowercase letters, numbers, and underscores")
        return value

    @model_validator(mode="after")
    def validate_limit_capability(self) -> Self:
        if not self.supports_numeric_limit and (self.default_unit or self.allowed_reset_periods):
            raise ValueError("non-numeric features cannot define units or reset periods")
        if len(set(self.allowed_reset_periods)) != len(self.allowed_reset_periods):
            raise ValueError("allowed_reset_periods must not contain duplicates")
        return self


class ManifestFeature(BaseModel):
    """One feature an app enforces, as published by the app itself."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    group: str | None = Field(default=None, max_length=80)
    kind: Literal["toggle", "limit"] = "toggle"
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    reset_periods: list[ResetPeriod] = Field(default_factory=list)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not CODE_PATTERN.fullmatch(value):
            raise ValueError("code must use lowercase letters, numbers, and underscores")
        return value

    @model_validator(mode="after")
    def validate_kind(self) -> Self:
        if self.kind == "toggle" and (self.unit or self.reset_periods):
            raise ValueError("on/off features cannot define units or reset periods")
        if self.kind == "limit" and (not self.unit or not self.reset_periods):
            raise ValueError("limit features need a unit and at least one reset period")
        return self


class FeatureManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal[1]
    features: list[ManifestFeature] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def unique_codes(self) -> Self:
        codes = [feature.code for feature in self.features]
        if len(codes) != len(set(codes)):
            raise ValueError("feature codes must be unique")
        return self


class FeatureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    code: str
    name: str
    description: str | None
    default_unit: str | None
    allowed_reset_periods: list[ResetPeriod]
    supports_numeric_limit: bool
    active: bool
    group_name: str | None = None
    display_order: int = 0
    source: str = "manual"
    synced_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class EntitlementInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    feature_id: uuid.UUID
    enabled: bool
    limit_type: LimitType | None = None
    limit_value: int | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    reset_period: ResetPeriod | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> Self:
        if not self.enabled:
            if any(
                value is not None
                for value in (self.limit_type, self.limit_value, self.unit, self.reset_period)
            ):
                raise ValueError("disabled entitlements cannot define limits")
            return self
        if self.limit_type is None:
            raise ValueError("enabled entitlements require limit_type")
        if self.limit_type == LimitType.UNLIMITED:
            if self.limit_value is not None or self.reset_period is not None:
                raise ValueError("unlimited entitlements cannot define a value or reset period")
            return self
        if self.limit_value is None or self.unit is None or self.reset_period is None:
            raise ValueError("limited entitlements require limit_value, unit, and reset_period")
        return self


class EntitlementRead(EntitlementInput):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    plan_id: uuid.UUID
    version: int
    created_at: datetime
    updated_at: datetime


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=4000)
    price: Decimal = Field(ge=0, max_digits=19, decimal_places=4)
    currency: str = Field(min_length=3, max_length=3)
    duration_value: int = Field(gt=0, le=1200)
    duration_unit: DurationUnit
    coupons_allowed: bool = True
    user_limit: int | None = Field(default=None, gt=0)
    user_limit_unlimited: bool = False
    status: PlanStatus = PlanStatus.DRAFT
    effective_at: datetime | None = None
    tagline: str | None = Field(default=None, max_length=200)
    badge: str | None = Field(default=None, max_length=40)
    compare_at_price: Decimal | None = Field(default=None, gt=0, max_digits=19, decimal_places=4)
    pricing_group: str | None = Field(default=None, max_length=100)
    entitlements: list[EntitlementInput] = Field(default_factory=list)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        return value.strip().casefold().replace("-", "_") if isinstance(value, str) else value

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not CODE_PATTERN.fullmatch(value):
            raise ValueError("code must use lowercase letters, numbers, and underscores")
        return value

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_plan(self) -> Self:
        if self.user_limit_unlimited == (self.user_limit is not None):
            raise ValueError("define either a limited user_limit or user_limit_unlimited")
        feature_ids = [item.feature_id for item in self.entitlements]
        if len(feature_ids) != len(set(feature_ids)):
            raise ValueError("each feature may appear only once per plan")
        if self.status == PlanStatus.ACTIVE:
            if self.effective_at is None:
                raise ValueError("active plans require effective_at")
            if self.effective_at.tzinfo is None:
                raise ValueError("effective_at must include a timezone")
        if self.status == PlanStatus.ARCHIVED:
            raise ValueError("new plans cannot be archived")
        if self.compare_at_price is not None and self.compare_at_price <= self.price:
            raise ValueError("the original (struck-through) price must be higher than the price")
        return self


class PlanUpdate(BaseModel):
    """Partial plan edit. Existing subscriptions keep their frozen price and entitlements."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    expected_version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    price: Decimal | None = Field(default=None, ge=0, max_digits=19, decimal_places=4)
    duration_value: int | None = Field(default=None, gt=0, le=1200)
    duration_unit: DurationUnit | None = None
    coupons_allowed: bool | None = None
    user_limit: int | None = Field(default=None, gt=0)
    user_limit_unlimited: bool | None = None
    status: PlanStatus | None = None
    effective_at: datetime | None = None
    tagline: str | None = Field(default=None, max_length=200)
    badge: str | None = Field(default=None, max_length=40)
    compare_at_price: Decimal | None = Field(default=None, gt=0, max_digits=19, decimal_places=4)
    pricing_group: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_update(self) -> Self:
        if self.effective_at is not None and self.effective_at.tzinfo is None:
            raise ValueError("effective_at must include a timezone")
        if self.user_limit is not None and self.user_limit_unlimited:
            raise ValueError("define either a limited user_limit or user_limit_unlimited")
        return self


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    name: str
    code: str
    description: str | None
    price: Decimal
    currency: str
    duration_value: int
    duration_unit: DurationUnit
    coupons_allowed: bool
    user_limit: int | None
    user_limit_unlimited: bool
    status: PlanStatus
    effective_at: datetime | None
    archived_at: datetime | None
    tagline: str | None = None
    badge: str | None = None
    compare_at_price: Decimal | None = None
    pricing_group: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    entitlements: list[EntitlementRead] = Field(default_factory=list)


class EntitlementSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entitlements: list[EntitlementInput]

    @model_validator(mode="after")
    def reject_duplicate_features(self) -> Self:
        feature_ids = [item.feature_id for item in self.entitlements]
        if len(feature_ids) != len(set(feature_ids)):
            raise ValueError("each feature may appear only once per plan")
        return self


__all__ = [
    "EntitlementInput",
    "EntitlementRead",
    "EntitlementSet",
    "FeatureCreate",
    "FeatureManifest",
    "FeatureRead",
    "PlanCreate",
    "PlanRead",
    "PlanUpdate",
]
