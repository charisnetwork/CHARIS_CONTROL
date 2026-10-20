from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.dependencies import integration_credential_statement
from app.domains.settings.router import _plan_ui_read
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


def test_storefront_response_projects_only_public_fields() -> None:
    app_id = uuid.uuid4()
    row = SimpleNamespace(
        id=uuid.uuid4(),
        application_id=app_id,
        version=1,
        recommended_plan_id=None,
        show_feature_comparison=True,
        show_billing_period_selector=True,
        display_labels={},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        _sa_instance_state=object(),
    )
    result = _plan_ui_read(app_id, row, [])
    assert result.application_id == app_id
    assert "_sa_instance_state" not in result.model_dump()
