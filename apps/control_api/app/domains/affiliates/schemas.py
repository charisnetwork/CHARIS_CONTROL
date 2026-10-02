from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.db.models import AffiliateStatus, CommissionEntryType


class AffiliateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    company_name: str | None = Field(default=None, max_length=200)
    contact_name: str = Field(min_length=2, max_length=160)
    mobile_number: str | None = Field(default=None, max_length=32)
    email: EmailStr
    tax_registration_number: str | None = Field(default=None, max_length=64)
    address: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=4000)


class AffiliateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    company_name: str | None
    contact_name: str
    mobile_number: str | None
    email: EmailStr
    tax_registration_number: str | None
    address: dict[str, Any]
    notes: str | None
    status: AffiliateStatus
    archived_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class AffiliateStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: AffiliateStatus


class CommissionEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    entry_type: CommissionEntryType
    amount: Decimal = Field(max_digits=19, decimal_places=4)
    currency: str = Field(min_length=3, max_length=3)
    reference: str = Field(min_length=8, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    occurred_at: datetime

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_entry(self) -> Self:
        if self.entry_type == CommissionEntryType.EARNED:
            raise ValueError("earned commission entries are created by coupon redemption")
        if self.amount == 0:
            raise ValueError("commission amount must be non-zero")
        if self.entry_type == CommissionEntryType.PAID and self.amount < 0:
            raise ValueError("paid commission amount must be positive")
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        return self


class CommissionEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    affiliate_id: uuid.UUID
    redemption_id: uuid.UUID | None
    entry_type: CommissionEntryType
    amount: Decimal
    currency: str
    reference: str
    notes: str | None
    occurred_at: datetime


class CommissionCurrencySummary(BaseModel):
    currency: str
    earned: Decimal
    paid: Decimal
    adjustments: Decimal
    balance: Decimal


__all__ = [
    "AffiliateCreate",
    "AffiliateRead",
    "AffiliateStatusUpdate",
    "CommissionCurrencySummary",
    "CommissionEntryCreate",
    "CommissionEntryRead",
]
