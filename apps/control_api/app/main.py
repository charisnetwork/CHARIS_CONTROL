from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
from starlette.middleware.base import RequestResponseEndpoint
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import Settings, get_settings
from app.db.session import engine

CORRELATION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,100}$")


class HealthResponse(BaseModel):
    status: str


def _correlation_id(request: Request) -> str:
    supplied = request.headers.get("X-Correlation-ID", "")
    if CORRELATION_ID_PATTERN.fullmatch(supplied):
        return supplied
    return str(uuid.uuid4())


def create_app(
    *,
    settings: Settings | None = None,
    database_engine: AsyncEngine | None = None,
) -> FastAPI:
    current_settings = settings or get_settings()
    current_engine = database_engine or engine

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await current_engine.dispose()

    is_production = current_settings.environment.casefold() == "production"
    application = FastAPI(
        title=current_settings.app_name,
        version="1.0.0",
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
        lifespan=lifespan,
    )
    application.state.database_engine = current_engine

    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=current_settings.trusted_hosts,
    )
    if current_settings.cors_allowed_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=current_settings.cors_allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Correlation-ID"],
            expose_headers=["X-Correlation-ID"],
        )

    @application.middleware("http")
    async def correlation_id_middleware(
        request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        correlation_id = _correlation_id(request)
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @application.middleware("http")
    async def request_size_middleware(
        request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                too_large = int(content_length) > current_settings.max_request_body_bytes
            except ValueError:
                too_large = True
            if too_large:
                return Response(status_code=status.HTTP_413_CONTENT_TOO_LARGE)
        return await call_next(request)

    @application.get("/health/live", response_model=HealthResponse, tags=["health"])
    async def liveness() -> HealthResponse:
        return HealthResponse(status="ok")

    @application.get(
        "/health/ready",
        response_model=HealthResponse,
        tags=["health"],
        responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
    )
    async def readiness(response: Response) -> HealthResponse:
        try:
            async with current_engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except Exception:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return HealthResponse(status="unavailable")
        return HealthResponse(status="ok")

    application.include_router(api_v1_router, prefix=current_settings.api_v1_prefix)
    return application


app = create_app()


__all__ = ["app", "create_app"]
