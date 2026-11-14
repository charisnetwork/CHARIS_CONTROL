"""Bounded read-only access to operator-configured application reporting APIs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings

Count = Annotated[int, Field(ge=0)]


class CustomerCounts(BaseModel):
    total: Count
    active_30d: Count
    new_in_range: Count


class UserCounts(BaseModel):
    total: Count
    enabled: Count
    active_24h: Count
    active_7d: Count


class UsageCounts(BaseModel):
    # Civil's original fields; other apps report their own numbers as metrics instead.
    projects: Count = 0
    photos: Count = 0
    photo_storage_bytes: Count = 0


class Metric(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    value: Count


class AppSummary(BaseModel):
    contract_version: Literal[1]
    generated_at: datetime
    customers: CustomerCounts
    users: UserCounts
    usage: UsageCounts = Field(default_factory=UsageCounts)
    metrics: list[Metric] = Field(default_factory=list, max_length=8)


class AppCustomer(BaseModel):
    external_id: str = Field(max_length=255)
    company: str = Field(max_length=500)
    owner: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, max_length=200)
    registered_at: datetime
    last_login_at: datetime | None = None
    last_active_at: datetime | None = None
    users: Count
    projects: Count
    status: Literal["active", "disabled"]


class AppCustomers(BaseModel):
    contract_version: Literal[1]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: Count
    items: list[AppCustomer] = Field(max_length=100)
    # What AppCustomer.projects counts for this app (e.g. "invoices"); Civil leaves it out.
    count_label: str | None = Field(default=None, max_length=30)


async def fetch_report[Result: BaseModel](
    application_id: uuid.UUID,
    resource: Literal["summary", "customers"],
    schema: type[Result],
    params: dict[str, str] | None = None,
) -> Result:
    connection = get_settings().reporting_adapters.get(application_id)
    if connection is None:
        raise HTTPException(503, "Application reporting is not configured")
    # Neither the browser nor the application registry can select the target or
    # credential. Each app UUID has a separate operator-controlled configuration.
    url = f"{str(connection.base_url).rstrip('/')}/{resource}"
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0), follow_redirects=False, trust_env=False
        ) as client:
            async with client.stream(
                "GET",
                url,
                params=params,
                headers={"Authorization": f"Bearer {connection.token.get_secret_value()}"},
            ) as response:
                response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > 1_048_576:
                        raise ValueError("Response exceeds reporting limit")
        # Explicit models discard unexpected fields, including payroll or secrets.
        return schema.model_validate_json(bytes(body))
    except (httpx.HTTPError, ValidationError, ValueError):
        raise HTTPException(502, "Application reporting is temporarily unavailable") from None
