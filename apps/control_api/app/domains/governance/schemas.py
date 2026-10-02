from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.db.models import AppPermission, UserStatus


class TeamMemberCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: SecretStr = Field(min_length=12, max_length=1024)
    permissions: list[AppPermission] = Field(min_length=1)

    @field_validator("permissions")
    @classmethod
    def unique_permissions(cls, value: list[AppPermission]) -> list[AppPermission]:
        if len(value) != len(set(value)):
            raise ValueError("permissions must not contain duplicates")
        return value


class TeamPermissionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    permissions: list[AppPermission] = Field(min_length=1)

    @field_validator("permissions")
    @classmethod
    def unique_permissions(cls, value: list[AppPermission]) -> list[AppPermission]:
        if len(value) != len(set(value)):
            raise ValueError("permissions must not contain duplicates")
        return value


class TeamMemberRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    status: UserStatus
    permissions: list[AppPermission]


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    application_id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: str | None
    correlation_id: str
    before_summary: dict[str, object] | None
    after_summary: dict[str, object] | None
    ip_address: str | None
    occurred_at: datetime


__all__ = ["AuditLogRead", "TeamMemberCreate", "TeamMemberRead", "TeamPermissionUpdate"]
