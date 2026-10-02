from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import hash_login_identifier
from app.db.models import AuthSession, ControlUser, LoginAttempt, UserStatus


@dataclass(frozen=True, slots=True)
class LoginThrottleState:
    blocked: bool
    retry_after_seconds: int


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _window_start(now: datetime, window_minutes: int) -> datetime:
    window_seconds = window_minutes * 60
    epoch_seconds = int(now.timestamp())
    return datetime.fromtimestamp(epoch_seconds - epoch_seconds % window_seconds, tz=UTC)


async def get_login_throttle_state(
    db: AsyncSession,
    *,
    email: str,
    ip_address: str,
    settings: Settings,
    now: datetime,
) -> LoginThrottleState:
    identifier_hash = hash_login_identifier(email, settings)
    blocked_until = await db.scalar(
        select(LoginAttempt.blocked_until)
        .where(
            LoginAttempt.identifier_hash == identifier_hash,
            LoginAttempt.ip_address == ip_address,
            LoginAttempt.blocked_until.is_not(None),
            LoginAttempt.blocked_until > now,
        )
        .order_by(LoginAttempt.blocked_until.desc())
        .limit(1)
    )
    if blocked_until is None:
        return LoginThrottleState(blocked=False, retry_after_seconds=0)
    retry_after = max(1, int((_as_utc(blocked_until) - now).total_seconds()))
    return LoginThrottleState(blocked=True, retry_after_seconds=retry_after)


async def record_login_failure(
    db: AsyncSession,
    *,
    email: str,
    ip_address: str,
    settings: Settings,
    now: datetime,
) -> LoginThrottleState:
    identifier_hash = hash_login_identifier(email, settings)
    window_start = _window_start(now, settings.login_throttle_window_minutes)
    blocked_until = now + timedelta(minutes=settings.login_throttle_lockout_minutes)
    next_attempt_count = LoginAttempt.attempt_count + 1
    statement = (
        insert(LoginAttempt)
        .values(
            id=uuid.uuid4(),
            identifier_hash=identifier_hash,
            ip_address=ip_address,
            window_start=window_start,
            attempt_count=1,
            blocked_until=(blocked_until if settings.login_throttle_max_attempts <= 1 else None),
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_login_attempt_window",
            set_={
                "attempt_count": next_attempt_count,
                "blocked_until": case(
                    (
                        next_attempt_count >= settings.login_throttle_max_attempts,
                        blocked_until,
                    ),
                    else_=LoginAttempt.blocked_until,
                ),
                "updated_at": now,
            },
        )
        .returning(LoginAttempt.blocked_until)
    )
    current_blocked_until = (await db.execute(statement)).scalar_one_or_none()
    if current_blocked_until is None:
        return LoginThrottleState(blocked=False, retry_after_seconds=0)
    retry_after = max(1, int((_as_utc(current_blocked_until) - now).total_seconds()))
    return LoginThrottleState(blocked=True, retry_after_seconds=retry_after)


async def clear_login_failures(
    db: AsyncSession,
    *,
    email: str,
    ip_address: str,
    settings: Settings,
    now: datetime,
) -> None:
    await db.execute(
        update(LoginAttempt)
        .where(
            LoginAttempt.identifier_hash == hash_login_identifier(email, settings),
            LoginAttempt.ip_address == ip_address,
        )
        .values(attempt_count=0, blocked_until=None, updated_at=now)
    )


async def delete_expired_login_attempts(db: AsyncSession, *, before: datetime) -> None:
    await db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.window_start < before,
            (LoginAttempt.blocked_until.is_(None) | (LoginAttempt.blocked_until < before)),
        )
    )


async def get_active_session_with_user(
    db: AsyncSession,
    *,
    refresh_token_hash: str,
) -> tuple[AuthSession, ControlUser] | None:
    result = await db.execute(
        select(AuthSession, ControlUser)
        .join(ControlUser, ControlUser.id == AuthSession.user_id)
        .where(AuthSession.refresh_token_hash == refresh_token_hash)
        .with_for_update(of=AuthSession)
    )
    row = result.first()
    if row is None:
        return None
    auth_session, user = row
    if user.status != UserStatus.ACTIVE:
        return None
    return auth_session, user


__all__ = [
    "LoginThrottleState",
    "clear_login_failures",
    "delete_expired_login_attempts",
    "get_active_session_with_user",
    "get_login_throttle_state",
    "record_login_failure",
]
