from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import ApplicationEnvironment, CredentialStatus, HealthStatus
from app.domains.applications.schemas import (
    SENSITIVE_CONFIG_KEY,
    _validate_public_integration_url,
)


class ApplicationSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=160)
    logo_url: AnyHttpUrl | None = None
    frontend_url: AnyHttpUrl | None = None
    control_api_base_url: AnyHttpUrl
    health_path: str = Field(min_length=1, max_length=255)
    environment: ApplicationEnvironment
    integration_config: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("health_path")
    @classmethod
    def safe_health_path(cls, value: str) -> str:
        if not value.startswith("/control/v1/") or any(item in value for item in ("?", "#", "\\")):
            raise ValueError("health_path must be a safe /control/v1/ path")
        return value

    @model_validator(mode="after")
    def validate_settings(self) -> Self:
        if any(SENSITIVE_CONFIG_KEY.search(key) for key in self.integration_config):
            raise ValueError("integration_config must not contain secrets")
        for field_name in ("logo_url", "frontend_url", "control_api_base_url"):
            _validate_public_integration_url(
                getattr(self, field_name), environment=self.environment, field_name=field_name
            )
        return self


class CredentialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    credential_type: str
    key_prefix: str
    credential_version: int
    status: CredentialStatus
    valid_from: datetime
    grace_ends_at: datetime | None
    revoked_at: datetime | None


class CredentialRotationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    grace_hours: int = Field(default=24, ge=0, le=168)


class HealthReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    overall_status: HealthStatus
    frontend_status: HealthStatus
    backend_status: HealthStatus
    database_status: HealthStatus
    latency_ms: int | None = Field(default=None, ge=0, le=600_000)
    dependencies: dict[str, Any] = Field(default_factory=dict)
    incident_summary: str | None = Field(default=None, max_length=4000)
    checked_at: datetime

    @field_validator("dependencies")
    @classmethod
    def reject_dependency_secrets(cls, value: dict[str, Any]) -> dict[str, Any]:
        if any(SENSITIVE_CONFIG_KEY.search(str(key)) for key in value):
            raise ValueError("health dependencies must not contain secrets")
        return value

    @field_validator("checked_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("checked_at must include a timezone")
        return value


class HealthReportRead(HealthReportCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    application_id: uuid.UUID


class PlanUiItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    plan_id: uuid.UUID
    visible: bool = True
    display_order: int = Field(ge=0)
    display_label: str | None = Field(default=None, max_length=160)


class PlanUiSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recommended_plan_id: uuid.UUID | None = None
    show_feature_comparison: bool = True
    show_billing_period_selector: bool = True
    display_labels: dict[str, str] = Field(default_factory=dict)
    items: list[PlanUiItemInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_plans_and_order(self) -> Self:
        if len({item.plan_id for item in self.items}) != len(self.items):
            raise ValueError("each plan may appear only once")
        if len({item.display_order for item in self.items}) != len(self.items):
            raise ValueError("display_order values must be unique")
        return self


class PlanUiSettingsRead(PlanUiSettingsUpdate):
    id: uuid.UUID | None = None
    application_id: uuid.UUID
    version: int = 0


__all__ = [
    "ApplicationSettingsUpdate",
    "CredentialRead",
    "CredentialRotationRequest",
    "HealthReportCreate",
    "HealthReportRead",
    "PlanUiItemInput",
    "PlanUiSettingsRead",
    "PlanUiSettingsUpdate",
]
