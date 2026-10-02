import json
from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Charis Control Centre API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: SecretStr = SecretStr(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/charis_control"
    )
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    trusted_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["localhost", "127.0.0.1"]
    )
    access_token_ttl_minutes: int = Field(default=15, ge=5, le=60)
    refresh_token_ttl_days: int = Field(default=14, ge=1, le=90)
    jwt_signing_secret: SecretStr = SecretStr("development-only-change-me")
    jwt_issuer: str = "charis-control-centre"
    jwt_audience: str = "charis-control-centre-api"
    login_throttle_window_minutes: int = Field(default=15, ge=1, le=60)
    login_throttle_max_attempts: int = Field(default=5, ge=2, le=20)
    login_throttle_lockout_minutes: int = Field(default=15, ge=1, le=1440)
    refresh_cookie_name: str = "charis_refresh"
    csrf_cookie_name: str = "charis_csrf"
    max_request_body_bytes: int = Field(default=2_097_152, ge=65_536, le=10_485_760)

    @field_validator("database_url")
    @classmethod
    def require_postgresql(cls, value: SecretStr) -> SecretStr:
        raw_url = value.get_secret_value()
        if raw_url.startswith("postgresql://"):
            return SecretStr(raw_url.replace("postgresql://", "postgresql+asyncpg://", 1))
        if not raw_url.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must point to PostgreSQL")
        return value

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("trusted_hosts", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, value: object) -> object:
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [host.strip() for host in value.split(",") if host.strip()]
        return value

    @model_validator(mode="after")
    def reject_insecure_production_secrets(self) -> "Settings":
        if (
            self.environment.lower() == "production"
            and self.jwt_signing_secret.get_secret_value() == "development-only-change-me"
        ):
            raise ValueError("JWT_SIGNING_SECRET must be configured in production")
        if self.environment.lower() == "production":
            signing_secret = self.jwt_signing_secret.get_secret_value()
            if len(signing_secret.encode("utf-8")) < 32:
                raise ValueError("JWT_SIGNING_SECRET must be at least 32 bytes in production")
            if not self.cors_allowed_origins:
                raise ValueError("CORS_ALLOWED_ORIGINS must be configured in production")
            if not self.trusted_hosts or set(self.trusted_hosts) <= {"localhost", "127.0.0.1"}:
                raise ValueError("TRUSTED_HOSTS must be configured in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
