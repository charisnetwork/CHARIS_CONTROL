from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DatabaseSession
from app.core.config import Settings, get_settings
from app.core.security import (
    constant_time_equal,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_csrf_token,
    new_refresh_token,
    normalize_email,
    password_needs_rehash,
    utc_now,
    verify_password,
)
from app.db.models import (
    AppPermission,
    AuthSession,
    ControlUser,
    UserAppPermission,
    UserRole,
    UserStatus,
)
from app.domains.auth.service import (
    clear_login_failures,
    get_active_session_with_user,
    get_login_throttle_state,
    record_login_failure,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
CurrentSettings = Annotated[Settings, Depends(get_settings)]


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=1024)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: UserRole


class PermissionGrantResponse(BaseModel):
    application_id: uuid.UUID
    permission: AppPermission


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    expires_at: datetime
    csrf_token: str
    user: UserResponse


class MeResponse(BaseModel):
    user: UserResponse
    permissions: list[PermissionGrantResponse]


def _client_ip(request: Request) -> str:
    # Proxy headers are intentionally ignored until trusted proxy ranges are configured.
    return (request.client.host if request.client else "unknown")[:64]


def _cookie_policy(settings: Settings) -> tuple[bool, Literal["lax", "strict", "none"]]:
    secure = settings.environment.casefold() != "development"
    return secure, "none" if secure else "lax"


def _set_session_cookies(
    response: Response,
    *,
    refresh_token: str,
    csrf_token: str,
    settings: Settings,
    expires_at: datetime,
) -> None:
    secure, same_site = _cookie_policy(settings)
    max_age = max(0, int((expires_at - utc_now()).total_seconds()))
    cookie_path = f"{settings.api_v1_prefix}/auth"
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        max_age=max_age,
        expires=expires_at,
        path=cookie_path,
        secure=secure,
        httponly=True,
        samesite=same_site,
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        max_age=max_age,
        expires=expires_at,
        path=cookie_path,
        secure=secure,
        httponly=False,
        samesite=same_site,
    )


def _clear_session_cookies(response: Response, settings: Settings) -> None:
    secure, same_site = _cookie_policy(settings)
    cookie_path = f"{settings.api_v1_prefix}/auth"
    response.delete_cookie(
        settings.refresh_cookie_name,
        path=cookie_path,
        secure=secure,
        httponly=True,
        samesite=same_site,
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        path=cookie_path,
        secure=secure,
        httponly=False,
        samesite=same_site,
    )


def _validate_csrf(request: Request, settings: Settings) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get("x-csrf-token")
    if not cookie_token or not header_token or not constant_time_equal(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")


def _token_response(
    *,
    access_token: str,
    expires_at: datetime,
    csrf_token: str,
    user: ControlUser,
) -> AccessTokenResponse:
    return AccessTokenResponse(
        access_token=access_token,
        expires_in=max(0, int((expires_at - utc_now()).total_seconds())),
        expires_at=expires_at,
        csrf_token=csrf_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=AccessTokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DatabaseSession,
    settings: CurrentSettings,
) -> AccessTokenResponse:
    now = utc_now()
    email = normalize_email(str(payload.email))
    ip_address = _client_ip(request)
    throttle = await get_login_throttle_state(
        db,
        email=email,
        ip_address=ip_address,
        settings=settings,
        now=now,
    )
    if throttle.blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(throttle.retry_after_seconds)},
        )

    user = await db.scalar(select(ControlUser).where(ControlUser.email == email))
    password = payload.password.get_secret_value()
    valid_password = verify_password(password, user.password_hash if user else None)
    if user is None or not valid_password or user.status != UserStatus.ACTIVE:
        throttle = await record_login_failure(
            db,
            email=email,
            ip_address=ip_address,
            settings=settings,
            now=now,
        )
        await db.commit()
        headers = {"WWW-Authenticate": "Bearer"}
        if throttle.blocked:
            headers["Retry-After"] = str(throttle.retry_after_seconds)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers=headers,
        )

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = now
    await clear_login_failures(
        db,
        email=email,
        ip_address=ip_address,
        settings=settings,
        now=now,
    )

    refresh_token = new_refresh_token()
    session_expires_at = now + timedelta(days=settings.refresh_token_ttl_days)
    auth_session = AuthSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=session_expires_at,
        ip_address=ip_address,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    db.add(auth_session)
    await db.flush()
    access_token, access_expires_at = create_access_token(
        user.id,
        auth_session.id,
        settings=settings,
        now=now,
    )
    csrf_token = new_csrf_token()
    await db.commit()
    _set_session_cookies(
        response,
        refresh_token=refresh_token,
        csrf_token=csrf_token,
        settings=settings,
        expires_at=session_expires_at,
    )
    return _token_response(
        access_token=access_token,
        expires_at=access_expires_at,
        csrf_token=csrf_token,
        user=user,
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: DatabaseSession,
    settings: CurrentSettings,
) -> AccessTokenResponse:
    _validate_csrf(request, settings)
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh session is required",
        )

    session_and_user = await get_active_session_with_user(
        db,
        refresh_token_hash=hash_refresh_token(refresh_token),
    )
    if session_and_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh session",
        )

    auth_session, user = session_and_user
    now = datetime.now(UTC)
    session_expiry = (
        auth_session.expires_at
        if auth_session.expires_at.tzinfo is not None
        else auth_session.expires_at.replace(tzinfo=UTC)
    )
    if auth_session.revoked_at is not None or session_expiry <= now:
        if auth_session.revoked_at is None:
            auth_session.revoked_at = now
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh session",
        )

    rotated_refresh_token = new_refresh_token()
    auth_session.refresh_token_hash = hash_refresh_token(rotated_refresh_token)
    auth_session.last_used_at = now
    access_token, access_expires_at = create_access_token(
        user.id,
        auth_session.id,
        settings=settings,
        now=now,
    )
    csrf_token = new_csrf_token()
    await db.commit()
    _set_session_cookies(
        response,
        refresh_token=rotated_refresh_token,
        csrf_token=csrf_token,
        settings=settings,
        expires_at=session_expiry,
    )
    return _token_response(
        access_token=access_token,
        expires_at=access_expires_at,
        csrf_token=csrf_token,
        user=user,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: DatabaseSession,
    settings: CurrentSettings,
) -> None:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token:
        _validate_csrf(request, settings)
        session_and_user = await get_active_session_with_user(
            db,
            refresh_token_hash=hash_refresh_token(refresh_token),
        )
        if session_and_user is not None:
            auth_session, _ = session_and_user
            if auth_session.revoked_at is None:
                auth_session.revoked_at = utc_now()
                await db.commit()
    _clear_session_cookies(response, settings)


@router.get("/me", response_model=MeResponse)
async def me(principal: CurrentUser, db: DatabaseSession) -> MeResponse:
    result = await db.execute(
        select(UserAppPermission.application_id, UserAppPermission.permission)
        .where(UserAppPermission.user_id == principal.user.id)
        .order_by(UserAppPermission.application_id, UserAppPermission.permission)
    )
    permissions = [
        PermissionGrantResponse(application_id=application_id, permission=permission)
        for application_id, permission in result.all()
    ]
    return MeResponse(user=UserResponse.model_validate(principal.user), permissions=permissions)


__all__ = ["router"]
