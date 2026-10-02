from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import Settings, get_settings

ACCESS_TOKEN_ALGORITHM = "HS256"
REFRESH_TOKEN_BYTES = 48
CSRF_TOKEN_BYTES = 32

password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65_536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)

# Running a real Argon2 verification for unknown accounts makes the login path less
# useful as an account-existence timing oracle. This value is process-local and is
# never accepted for a real user.
_dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))


class TokenValidationError(ValueError):
    """Raised when an access token fails structural or cryptographic validation."""


@dataclass(frozen=True, slots=True)
class AccessTokenClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID
    token_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime


def utc_now() -> datetime:
    return datetime.now(UTC)


def normalize_email(value: str) -> str:
    return value.strip().casefold()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    candidate_hash = password_hash or _dummy_password_hash
    try:
        valid = password_hasher.verify(candidate_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False
    return bool(valid) and password_hash is not None


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def new_refresh_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(CSRF_TOKEN_BYTES)


def hash_login_identifier(identifier: str, settings: Settings | None = None) -> str:
    current_settings = settings or get_settings()
    normalized = normalize_email(identifier)
    return hmac.new(
        current_settings.jwt_signing_secret.get_secret_value().encode("utf-8"),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def create_access_token(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    settings: Settings | None = None,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    current_settings = settings or get_settings()
    issued_at = now or utc_now()
    expires_at = issued_at + timedelta(minutes=current_settings.access_token_ttl_minutes)
    token_id = uuid.uuid4()
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "jti": str(token_id),
        "type": "access",
        "iss": current_settings.jwt_issuer,
        "aud": current_settings.jwt_audience,
        "iat": issued_at,
        "nbf": issued_at,
        "exp": expires_at,
    }
    token = jwt.encode(
        payload,
        current_settings.jwt_signing_secret.get_secret_value(),
        algorithm=ACCESS_TOKEN_ALGORITHM,
    )
    return token, expires_at


def decode_access_token(
    token: str,
    *,
    settings: Settings | None = None,
) -> AccessTokenClaims:
    current_settings = settings or get_settings()
    try:
        payload = jwt.decode(
            token,
            current_settings.jwt_signing_secret.get_secret_value(),
            algorithms=[ACCESS_TOKEN_ALGORITHM],
            audience=current_settings.jwt_audience,
            issuer=current_settings.jwt_issuer,
            options={"require": ["sub", "sid", "jti", "type", "iss", "aud", "iat", "nbf", "exp"]},
        )
        if payload.get("type") != "access":
            raise TokenValidationError("Unexpected token type")
        issued_at = datetime.fromtimestamp(int(payload["iat"]), tz=UTC)
        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
        return AccessTokenClaims(
            user_id=uuid.UUID(str(payload["sub"])),
            session_id=uuid.UUID(str(payload["sid"])),
            token_id=uuid.UUID(str(payload["jti"])),
            issued_at=issued_at,
            expires_at=expires_at,
        )
    except TokenValidationError:
        raise
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise TokenValidationError("Invalid or expired access token") from exc


def constant_time_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


__all__ = [
    "AccessTokenClaims",
    "TokenValidationError",
    "constant_time_equal",
    "create_access_token",
    "decode_access_token",
    "hash_login_identifier",
    "hash_password",
    "hash_refresh_token",
    "new_csrf_token",
    "new_refresh_token",
    "normalize_email",
    "password_needs_rehash",
    "utc_now",
    "verify_password",
]
