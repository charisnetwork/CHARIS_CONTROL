from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.domains.catalog.schemas import EntitlementInput, FeatureCreate, PlanCreate


def test_disabled_entitlement_cannot_smuggle_limit_values() -> None:
    with pytest.raises(ValidationError, match="disabled entitlements"):
        EntitlementInput(
            feature_id=uuid.uuid4(),
            enabled=False,
            limit_type="limited",  # type: ignore[arg-type]
            limit_value=100,
            unit="invoices",
            reset_period="monthly",  # type: ignore[arg-type]
        )


def test_limited_entitlement_requires_complete_typed_limit() -> None:
    with pytest.raises(ValidationError, match="limit_value, unit, and reset_period"):
        EntitlementInput(
            feature_id=uuid.uuid4(),
            enabled=True,
            limit_type="limited",  # type: ignore[arg-type]
        )

    entitlement = EntitlementInput(
        feature_id=uuid.uuid4(),
        enabled=True,
        limit_type="limited",  # type: ignore[arg-type]
        limit_value=1_000,
        unit="invoices",
        reset_period="monthly",  # type: ignore[arg-type]
    )
    assert entitlement.limit_value == 1_000


def test_unlimited_entitlement_has_no_numerical_limit() -> None:
    entitlement = EntitlementInput(
        feature_id=uuid.uuid4(),
        enabled=True,
        limit_type="unlimited",  # type: ignore[arg-type]
    )
    assert entitlement.limit_value is None


def test_feature_catalog_is_dynamic_and_validates_capabilities() -> None:
    feature = FeatureCreate(
        code="E-Way-Bills",
        name="E-Way Bills",
        default_unit="documents",
        allowed_reset_periods=["monthly", "billing_cycle"],  # type: ignore[list-item]
    )
    assert feature.code == "e_way_bills"

    with pytest.raises(ValidationError, match="non-numeric"):
        FeatureCreate(
            code="custom_branding",
            name="Custom branding",
            supports_numeric_limit=False,
            default_unit="themes",
        )


def test_active_plan_requires_effective_date_and_unique_features() -> None:
    feature_id = uuid.uuid4()
    base = {
        "name": "Growth",
        "code": "GROWTH",
        "price": "1499.00",
        "currency": "inr",
        "duration_value": 1,
        "duration_unit": "month",
        "user_limit_unlimited": True,
        "status": "active",
        "entitlements": [{"feature_id": feature_id, "enabled": True, "limit_type": "unlimited"}],
    }
    with pytest.raises(ValidationError, match="effective_at"):
        PlanCreate.model_validate(base)

    plan = PlanCreate.model_validate({**base, "effective_at": datetime.now(UTC)})
    assert plan.code == "growth"
    assert plan.currency == "INR"

    with pytest.raises(ValidationError, match="only once"):
        PlanCreate.model_validate(
            {
                **base,
                "effective_at": datetime.now(UTC),
                "entitlements": base["entitlements"] * 2,
            }
        )
