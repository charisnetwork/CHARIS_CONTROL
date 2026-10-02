from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.core.security import (
    TokenValidationError,
    create_access_token,
    decode_access_token,
    hash_login_identifier,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    normalize_email,
    verify_password,
)


def settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "jwt_signing_secret": SecretStr("test-secret-that-is-long-enough-for-hmac-signing"),
        "jwt_issuer": "test-issuer",
        "jwt_audience": "test-audience",
    }
    values.update(overrides)
    return Settings(**values)


def test_password_hashing_uses_argon2_and_rejects_wrong_password() -> None:
    password_hash = hash_password("a sufficiently long passphrase")

    assert password_hash.startswith("$argon2id$")
    assert verify_password("a sufficiently long passphrase", password_hash)
    assert not verify_password("wrong passphrase", password_hash)
    assert not verify_password("anything", None)


def test_access_token_is_bound_to_user_session_issuer_and_audience() -> None:
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    now = datetime.now(UTC).replace(microsecond=0)

    token, expires_at = create_access_token(user_id, session_id, settings=settings(), now=now)
    claims = decode_access_token(token, settings=settings())

    assert claims.user_id == user_id
    assert claims.session_id == session_id
    assert claims.issued_at == now
    assert claims.expires_at == expires_at
    assert claims.token_id

    with pytest.raises(TokenValidationError):
        decode_access_token(token, settings=settings(jwt_audience="another-audience"))


def test_expired_access_token_is_rejected() -> None:
    past = datetime.now(UTC) - timedelta(hours=2)
    token, _ = create_access_token(
        uuid.uuid4(),
        uuid.uuid4(),
        settings=settings(access_token_ttl_minutes=5),
        now=past,
    )

    with pytest.raises(TokenValidationError):
        decode_access_token(token, settings=settings(access_token_ttl_minutes=5))


def test_refresh_tokens_are_opaque_and_only_their_hash_is_stable() -> None:
    first = new_refresh_token()
    second = new_refresh_token()

    assert first != second
    assert len(first) >= 64
    assert hash_refresh_token(first) == hash_refresh_token(first)
    assert hash_refresh_token(first) != hash_refresh_token(second)
    assert first not in hash_refresh_token(first)


def test_identifier_hash_normalizes_email_without_storing_it() -> None:
    current_settings = settings()
    first = hash_login_identifier("  Owner@Example.COM ", current_settings)
    second = hash_login_identifier("owner@example.com", current_settings)

    assert normalize_email("  Owner@Example.COM ") == "owner@example.com"
    assert first == second
    assert "owner" not in first
    assert len(first) == 64
