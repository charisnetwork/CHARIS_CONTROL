from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings


@pytest.mark.parametrize(
    "origins,hosts",
    [
        ("http://localhost:5173", "localhost,127.0.0.1"),
        ('["http://localhost:5173"]', '["localhost","127.0.0.1"]'),
    ],
)
def test_environment_lists_accept_documented_formats(
    monkeypatch: pytest.MonkeyPatch, origins: str, hosts: str
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", origins)
    monkeypatch.setenv("TRUSTED_HOSTS", hosts)
    settings = Settings(_env_file=None)
    assert settings.cors_allowed_origins == ["http://localhost:5173"]
    assert settings.trusted_hosts == ["localhost", "127.0.0.1"]


def test_railway_postgresql_url_uses_asyncpg_driver() -> None:
    settings = Settings(
        environment="test",
        database_url=SecretStr("postgresql://user:password@database:5432/control"),
    )

    assert settings.database_url.get_secret_value().startswith("postgresql+asyncpg://")


def test_production_requires_security_boundaries() -> None:
    with pytest.raises(ValidationError, match="JWT_SIGNING_SECRET"):
        Settings(environment="production")

    with pytest.raises(ValidationError, match="CORS_ALLOWED_ORIGINS"):
        Settings(
            environment="production",
            jwt_signing_secret=SecretStr("a-secure-production-signing-secret-value"),
        )
