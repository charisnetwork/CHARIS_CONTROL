from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.dependencies import integration_credential_statement
from app.domains.settings.schemas import (
    ApplicationSettingsUpdate,
    HealthReportCreate,
    PlanUiSettingsUpdate,
)


def test_integration_credential_lookup_is_application_scoped() -> None:
    application_id = uuid.uuid4()
    sql = str(
        integration_credential_statement(application_id, "cc_prefix").compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert str(application_id) in sql
    assert "app_credentials.application_id = applications.id" in sql
    assert "app_credentials.key_prefix" in sql


def test_production_settings_reject_private_and_insecure_urls() -> None:
    with pytest.raises(ValidationError):
        ApplicationSettingsUpdate(
            name="Billing",
            frontend_url="http://127.0.0.1",
            control_api_base_url="http://10.0.0.1",
            health_path="/control/v1/health",
            environment="production",
        )


def test_health_payload_rejects_secret_fields() -> None:
    with pytest.raises(ValidationError):
        HealthReportCreate(
            overall_status="healthy",
            frontend_status="healthy",
            backend_status="healthy",
            database_status="healthy",
            dependencies={"api_key": "must-not-be-stored"},
            checked_at=datetime.now(UTC),
        )


def test_storefront_rejects_duplicate_plan_order() -> None:
    with pytest.raises(ValidationError):
        PlanUiSettingsUpdate(
            items=[
                {"plan_id": uuid.uuid4(), "display_order": 0},
                {"plan_id": uuid.uuid4(), "display_order": 0},
            ]
        )
