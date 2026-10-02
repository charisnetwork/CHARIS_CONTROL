from __future__ import annotations

import hashlib
import hmac
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import AccessTokenClaims, TokenValidationError, decode_access_token
from app.db.models import (
    AppCredential,
    Application,
    ApplicationStatus,
    AppPermission,
    AuthSession,
    ControlUser,
    CredentialStatus,
    UserAppPermission,
    UserRole,
    UserStatus,
)
from app.db.session import get_db_session

bearer_scheme = HTTPBearer(auto_error=False)
DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]


def integration_credential_statement(
    app_id: uuid.UUID, prefix: str
) -> Select[tuple[Application, AppCredential]]:
    return (
        select(Application, AppCredential)
        .join(AppCredential, AppCredential.application_id == Application.id)
        .where(
            Application.id == app_id,
            Application.status == ApplicationStatus.ACTIVE,
            AppCredential.key_prefix == prefix,
            AppCredential.status.in_([CredentialStatus.ACTIVE, CredentialStatus.GRACE]),
        )
    )


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user: ControlUser
    session: AuthSession
    claims: AccessTokenClaims


@dataclass(frozen=True, slots=True)
class AppAuthorization:
    application: Application
    principal: AuthenticatedUser
    permissions: frozenset[AppPermission]

    @property
    def application_id(self) -> uuid.UUID:
        return self.application.id


@dataclass(frozen=True, slots=True)
class IntegrationAuthorization:
    application: Application
    credential: AppCredential

    @property
    def application_id(self) -> uuid.UUID:
        return self.application.id


def _unauthorized(detail: str = "Invalid or expired authentication") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def get_current_user(
    db: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise _unauthorized("Bearer access token is required")

    try:
        claims = decode_access_token(credentials.credentials)
    except TokenValidationError as exc:
        raise _unauthorized() from exc

    result = await db.execute(
        select(AuthSession, ControlUser)
        .join(ControlUser, ControlUser.id == AuthSession.user_id)
        .where(
            AuthSession.id == claims.session_id,
            AuthSession.user_id == claims.user_id,
        )
    )
    row = result.first()
    if row is None:
        raise _unauthorized()

    auth_session, user = row
    now = datetime.now(UTC)
    if (
        auth_session.revoked_at is not None
        or _as_utc(auth_session.expires_at) <= now
        or user.status != UserStatus.ACTIVE
    ):
        raise _unauthorized()

    return AuthenticatedUser(user=user, session=auth_session, claims=claims)


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


async def require_integration_credential(
    app_id: uuid.UUID,
    db: DatabaseSession,
    api_key: Annotated[str | None, Header(alias="X-Charis-App-Key")] = None,
) -> IntegrationAuthorization:
    if not api_key or "." not in api_key:
        raise _unauthorized("Application credential is required")
    prefix = api_key.split(".", 1)[0]
    row = (await db.execute(integration_credential_statement(app_id, prefix))).first()
    if row is None:
        raise _unauthorized("Invalid application credential")
    application, credential = row
    now = datetime.now(UTC)
    if credential.valid_from > now or (
        credential.status == CredentialStatus.GRACE
        and (credential.grace_ends_at is None or credential.grace_ends_at <= now)
    ):
        raise _unauthorized("Expired application credential")
    supplied_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    if credential.secret_hash is None or not hmac.compare_digest(
        supplied_hash, credential.secret_hash
    ):
        raise _unauthorized("Invalid application credential")
    return IntegrationAuthorization(application=application, credential=credential)


IntegrationCredential = Annotated[IntegrationAuthorization, Depends(require_integration_credential)]


def require_app_permission(
    *required_permissions: AppPermission,
) -> Callable[..., Awaitable[AppAuthorization]]:
    if not required_permissions:
        raise ValueError("At least one application permission is required")
    required = frozenset(required_permissions)

    async def authorize(
        app_id: uuid.UUID,
        principal: CurrentUser,
        db: DatabaseSession,
    ) -> AppAuthorization:
        application = await db.scalar(
            select(Application).where(
                Application.id == app_id,
                Application.status != ApplicationStatus.ARCHIVED,
            )
        )
        if application is None:
            # Do not reveal whether an inaccessible application exists.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
            )

        if principal.user.role == UserRole.OWNER:
            permissions = frozenset(AppPermission)
        else:
            permission_result = await db.scalars(
                select(UserAppPermission.permission).where(
                    UserAppPermission.user_id == principal.user.id,
                    UserAppPermission.application_id == app_id,
                )
            )
            permissions = frozenset(permission_result.all())

        if not required.issubset(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permission for this application",
            )

        return AppAuthorization(
            application=application,
            principal=principal,
            permissions=permissions,
        )

    return authorize


__all__ = [
    "AppAuthorization",
    "AuthenticatedUser",
    "CurrentUser",
    "DatabaseSession",
    "IntegrationAuthorization",
    "IntegrationCredential",
    "get_current_user",
    "integration_credential_statement",
    "require_app_permission",
    "require_integration_credential",
]
