from __future__ import annotations

import enum
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExportReportType(enum.StrEnum):
    SUBSCRIPTIONS = "subscriptions"
    PAYMENTS = "payments"
    COUPON_REDEMPTIONS = "coupon_redemptions"
    AFFILIATE_COMMISSIONS = "affiliate_commissions"
    USAGE_EVENTS = "usage_events"


class ReportRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime = Field(default_factory=lambda: datetime.now(UTC) - timedelta(days=30))
    ends_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("report dates must include a timezone")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        if self.ends_at - self.starts_at > timedelta(days=366):
            raise ValueError("report range cannot exceed 366 days")
        return self


class ExportRequest(ReportRange):
    report_type: ExportReportType


class CurrencyAmount(BaseModel):
    currency: str
    amount: Decimal
    count: int


class PlanSubscriptionCount(BaseModel):
    plan_id: str
    plan_name: str
    active_subscriptions: int


class DailySubscriptionCount(BaseModel):
    date: str
    subscriptions: int


class ReportSummary(BaseModel):
    starts_at: datetime
    ends_at: datetime
    new_subscribers: int
    new_subscriptions: int
    active_subscriptions: int
    coupon_redemptions: int
    discount_total_by_currency: list[CurrencyAmount]
    collected_revenue_by_currency: list[CurrencyAmount]
    earned_commission_by_currency: list[CurrencyAmount]
    usage_events: int
    plan_distribution: list[PlanSubscriptionCount]
    subscription_trend: list[DailySubscriptionCount]


__all__ = [
    "CurrencyAmount",
    "DailySubscriptionCount",
    "ExportReportType",
    "ExportRequest",
    "PlanSubscriptionCount",
    "ReportRange",
    "ReportSummary",
]
