from __future__ import annotations

import ipaddress
import re
import uuid
from datetime import datetime
from typing import Self
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import ApplicationEnvironment, ApplicationStatus

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SENSITIVE_CONFIG_KEY = re.compile(
    r"(?:secret|password|token|private[_-]?key|api[_-]?key|credential)", re.IGNORECASE
)


def _validate_public_integration_url(
    value: AnyHttpUrl | None,
    *,
    environment: ApplicationEnvironment,
    field_name: str,
) -> None:
    if value is None:
        return

    parsed = urlsplit(str(value))
    if parsed.username or parsed.password:
        raise ValueError(f"{field_name} must not contain embedded credentials")
    if parsed.query or parsed.fragment:
        raise ValueError(f"{field_name} must not contain a query string or fragment")

    hostname = (parsed.hostname or "").rstrip(".").casefold()
    if not hostname:
        raise ValueError(f"{field_name} must contain a hostname")

    is_development = environment == ApplicationEnvironment.DEVELOPMENT
    if not is_development and parsed.scheme != "https":
        raise ValueError(f"{field_name} must use HTTPS outside development")

    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        if not is_development:
            raise ValueError(f"{field_name} must not target a local hostname")
        return

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return

    if not is_development and not address.is_global:
        raise ValueError(f"{field_name} must not target a private or reserved address")


class ApplicationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(min_length=2, max_length=100)
    logo_url: AnyHttpUrl | None = None
    frontend_url: AnyHttpUrl | None = None
    control_api_base_url: AnyHttpUrl
    health_path: str = Field(default="/control/v1/health", min_length=1, max_length=255)
    environment: ApplicationEnvironment
    integration_config: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name must not be blank")
        return normalized

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        return value.strip().casefold() if isinstance(value, str) else value

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not SLUG_PATTERN.fullmatch(value):
            raise ValueError("slug must contain lowercase letters, numbers, and single hyphens")
        return value

    @field_validator("health_path")
    @classmethod
    def validate_health_path(cls, value: str) -> str:
        if not value.startswith("/control/v1/"):
            raise ValueError("health_path must be a /control/v1/ path")
        if value.startswith("//") or "?" in value or "#" in value or "\\" in value:
            raise ValueError("health_path must be a relative path without query or fragment")
        return value

    @field_validator("integration_config")
    @classmethod
    def reject_inline_secrets(
        cls, value: dict[str, str | int | float | bool | None]
    ) -> dict[str, str | int | float | bool | None]:
        sensitive_keys = sorted(key for key in value if SENSITIVE_CONFIG_KEY.search(key))
        if sensitive_keys:
            raise ValueError("integration_config must not contain credentials or secrets")
        return value

    @model_validator(mode="after")
    def validate_urls(self) -> Self:
        for field_name in ("logo_url", "frontend_url", "control_api_base_url"):
            _validate_public_integration_url(
                getattr(self, field_name),
                environment=self.environment,
                field_name=field_name,
            )
        return self


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None
    frontend_url: str | None
    control_api_base_url: str
    health_path: str
    environment: ApplicationEnvironment
    status: ApplicationStatus
    version: int
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class IssuedCredential(BaseModel):
    credential_type: str
    key_prefix: str
    credential_version: int
    secret: str = Field(repr=False)
    valid_from: datetime
    notice: str = "Store this credential now. It cannot be retrieved again."


class ApplicationCreated(BaseModel):
    application: ApplicationRead
    credential: IssuedCredential


class ApplicationArchived(BaseModel):
    application: ApplicationRead


__all__ = [
    "ApplicationArchived",
    "ApplicationCreate",
    "ApplicationCreated",
    "ApplicationRead",
    "IssuedCredential",
]
