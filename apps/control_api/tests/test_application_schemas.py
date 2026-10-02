import pytest
from pydantic import ValidationError

from app.db.models import ApplicationEnvironment
from app.domains.applications.schemas import ApplicationCreate


def valid_payload() -> dict[str, object]:
    return {
        "name": "Bill Easy",
        "slug": "bill-easy",
        "frontend_url": "https://example.com",
        "control_api_base_url": "https://control.example.com/control/v1",
        "health_path": "/control/v1/health",
        "environment": ApplicationEnvironment.PRODUCTION,
    }


def test_slug_is_normalized() -> None:
    payload = valid_payload()
    payload["slug"] = "  BILL-EASY  "

    application = ApplicationCreate.model_validate(payload)

    assert application.slug == "bill-easy"


@pytest.mark.parametrize(
    "url",
    [
        "http://control.example.com/control/v1",
        "https://127.0.0.1/control/v1",
        "https://169.254.169.254/control/v1",
        "https://user:password@control.example.com/control/v1",
        "https://control.example.com/control/v1?secret=value",
    ],
)
def test_production_integration_url_rejects_unsafe_targets(url: str) -> None:
    payload = valid_payload()
    payload["control_api_base_url"] = url

    with pytest.raises(ValidationError):
        ApplicationCreate.model_validate(payload)


def test_development_integration_url_allows_local_http() -> None:
    payload = valid_payload()
    payload.update(
        environment=ApplicationEnvironment.DEVELOPMENT,
        control_api_base_url="http://localhost:8001/control/v1",
    )

    application = ApplicationCreate.model_validate(payload)

    assert application.control_api_base_url.host == "localhost"


def test_integration_config_rejects_inline_secrets() -> None:
    payload = valid_payload()
    payload["integration_config"] = {"api_key": "must-not-be-stored-here"}

    with pytest.raises(ValidationError, match="must not contain credentials"):
        ApplicationCreate.model_validate(payload)


def test_health_path_must_stay_in_versioned_control_contract() -> None:
    payload = valid_payload()
    payload["health_path"] = "/health"

    with pytest.raises(ValidationError, match="/control/v1/"):
        ApplicationCreate.model_validate(payload)
