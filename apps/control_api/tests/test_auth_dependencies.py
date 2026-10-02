from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import SecretStr

from app.api.dependencies import AuthenticatedUser, get_current_user, require_app_permission
from app.core.config import Settings
from app.core.security import create_access_token, decode_access_token
from app.db.models import (
    Application,
    ApplicationEnvironment,
    ApplicationStatus,
    AppPermission,
    AuthSession,
    ControlUser,
    UserRole,
    UserStatus,
)


class FirstResult:
    def __init__(self, value: object) -> None:
        self.value = value

    def first(self) -> object:
        return self.value


class ScalarListResult:
    def __init__(self, values: list[AppPermission]) -> None:
        self.values = values

    def all(self) -> list[AppPermission]:
        return self.values


def settings() -> Settings:
    return Settings(
        environment="test",
        jwt_signing_secret=SecretStr("test-secret-that-is-long-enough-for-hmac-signing"),
    )


def user(role: UserRole = UserRole.TEAM_MEMBER) -> ControlUser:
    return ControlUser(
        id=uuid.uuid4(),
        email="member@example.com",
        password_hash="not-used",
        display_name="Team Member",
        role=role,
        status=UserStatus.ACTIVE,
    )


def application(application_id: uuid.UUID) -> Application:
    return Application(
        id=application_id,
        name="Example application",
        slug=f"app-{application_id.hex[:8]}",
        control_api_base_url="https://example.com/control/v1",
        environment=ApplicationEnvironment.STAGING,
        status=ApplicationStatus.ACTIVE,
    )


@pytest.mark.asyncio
async def test_current_user_requires_a_live_matching_database_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_user = user()
    auth_session = AuthSession(
        id=uuid.uuid4(),
        user_id=current_user.id,
        refresh_token_hash="a" * 64,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    token, _ = create_access_token(current_user.id, auth_session.id, settings=settings())
    monkeypatch.setattr(
        "app.api.dependencies.decode_access_token",
        lambda value: decode_access_token(value, settings=settings()),
    )
    db = AsyncMock()
    db.execute.return_value = FirstResult((auth_session, current_user))

    principal = await get_current_user(
        db=db,
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
    )

    assert principal.user.id == current_user.id
    assert principal.session.id == auth_session.id

    auth_session.revoked_at = datetime.now(UTC)
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            db=db,
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        )
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_team_member_permission_is_scoped_to_selected_application() -> None:
    selected_app_id = uuid.uuid4()
    other_app_id = uuid.uuid4()
    current_user = user()
    auth_session = AuthSession(
        id=uuid.uuid4(),
        user_id=current_user.id,
        refresh_token_hash="b" * 64,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    token, _ = create_access_token(current_user.id, auth_session.id, settings=settings())
    principal = AuthenticatedUser(
        user=current_user,
        session=auth_session,
        claims=decode_access_token(token, settings=settings()),
    )
    authorize = require_app_permission(AppPermission.VIEW_PLANS)
    db = AsyncMock()
    db.scalar.side_effect = [application(selected_app_id), application(other_app_id)]
    db.scalars.side_effect = [
        ScalarListResult([AppPermission.VIEW_PLANS]),
        ScalarListResult([]),
    ]

    authorized = await authorize(app_id=selected_app_id, principal=principal, db=db)
    assert authorized.application_id == selected_app_id

    with pytest.raises(HTTPException) as exc_info:
        await authorize(app_id=other_app_id, principal=principal, db=db)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_owner_has_permissions_but_still_requires_a_real_application() -> None:
    current_user = user(UserRole.OWNER)
    auth_session = AuthSession(
        id=uuid.uuid4(),
        user_id=current_user.id,
        refresh_token_hash="c" * 64,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    token, _ = create_access_token(current_user.id, auth_session.id, settings=settings())
    principal = AuthenticatedUser(
        user=current_user,
        session=auth_session,
        claims=decode_access_token(token, settings=settings()),
    )
    authorize = require_app_permission(AppPermission.MANAGE_SETTINGS)
    selected_app_id = uuid.uuid4()
    db = AsyncMock()
    db.scalar.side_effect = [application(selected_app_id), None]

    authorized = await authorize(app_id=selected_app_id, principal=principal, db=db)
    assert AppPermission.MANAGE_SETTINGS in authorized.permissions
    db.scalars.assert_not_awaited()

    with pytest.raises(HTTPException) as exc_info:
        await authorize(app_id=uuid.uuid4(), principal=principal, db=db)
    assert exc_info.value.status_code == 404
