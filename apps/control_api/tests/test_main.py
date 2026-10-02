from __future__ import annotations

from unittest.mock import AsyncMock

from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app


class ConnectionContext:
    def __init__(self, connection: AsyncMock, *, error: Exception | None = None) -> None:
        self.connection = connection
        self.error = error

    async def __aenter__(self) -> AsyncMock:
        if self.error is not None:
            raise self.error
        return self.connection

    async def __aexit__(self, *_args: object) -> None:
        return None


class FakeEngine:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.connection = AsyncMock()
        self.error = error

    def connect(self) -> ConnectionContext:
        return ConnectionContext(self.connection, error=self.error)

    async def dispose(self) -> None:
        return None


def make_settings() -> Settings:
    return Settings(
        environment="test",
        jwt_signing_secret=SecretStr("test-secret-that-is-long-enough-for-hmac-signing"),
        trusted_hosts=["testserver"],
        cors_allowed_origins=["https://control.example.com"],
    )


async def test_health_and_correlation_headers() -> None:
    database_engine = FakeEngine()
    application = create_app(
        settings=make_settings(),
        database_engine=database_engine,  # type: ignore[arg-type]
    )

    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://testserver"
    ) as client:
        live = await client.get("/health/live", headers={"X-Correlation-ID": "test-request-1"})
        ready = await client.get("/health/ready")

    assert live.status_code == 200
    assert live.headers["X-Correlation-ID"] == "test-request-1"
    assert live.headers["X-Content-Type-Options"] == "nosniff"
    assert live.headers["X-Frame-Options"] == "DENY"
    assert live.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok"}


async def test_readiness_fails_closed_without_database() -> None:
    database_engine = FakeEngine(error=OSError("database unavailable"))
    application = create_app(
        settings=make_settings(),
        database_engine=database_engine,  # type: ignore[arg-type]
    )

    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://testserver"
    ) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


async def test_oversized_request_is_rejected_before_route_processing() -> None:
    application = create_app(
        settings=make_settings(),
        database_engine=FakeEngine(),  # type: ignore[arg-type]
    )
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/v1/auth/login",
            headers={"Content-Length": str(make_settings().max_request_body_bytes + 1)},
        )
    assert response.status_code == 413
