from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.db.models import HealthStatus


class OverviewCounts(BaseModel):
    subscribers: int
    subscriptions: int
    active_subscriptions: int
    plans: int
    active_coupons: int


class LatestHealth(BaseModel):
    status: HealthStatus
    frontend_status: HealthStatus
    backend_status: HealthStatus
    database_status: HealthStatus
    latency_ms: int | None
    checked_at: datetime


class ApplicationOverviewResponse(BaseModel):
    counts: OverviewCounts
    latest_health: LatestHealth | None
    data_sources: dict[str, bool]


__all__ = ["ApplicationOverviewResponse", "LatestHealth", "OverviewCounts"]
