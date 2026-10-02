from app.domains.entitlements.schemas import EntitlementSnapshot
from app.domains.entitlements.service import evaluate_entitlement


def test_missing_and_disabled_features_are_denied() -> None:
    snapshots = [
        EntitlementSnapshot(feature_code="exports", enabled=False),
    ]

    assert not evaluate_entitlement(snapshots, feature_code="unknown").allowed
    assert not evaluate_entitlement(snapshots, feature_code="exports").allowed


def test_unlimited_feature_is_allowed_without_fake_number() -> None:
    decision = evaluate_entitlement(
        [
            EntitlementSnapshot(
                feature_code="e_way_bills",
                enabled=True,
                limit_type="unlimited",  # type: ignore[arg-type]
            )
        ],
        feature_code="e-way-bills",
        used_value=50_000,
    )

    assert decision.allowed
    assert decision.remaining is None
    assert decision.reason == "unlimited"


def test_limited_feature_enforces_requested_usage() -> None:
    snapshots = [
        EntitlementSnapshot(
            feature_code="invoices",
            enabled=True,
            limit_type="limited",  # type: ignore[arg-type]
            limit_value=1_000,
            unit="invoices",
            reset_period="monthly",  # type: ignore[arg-type]
        )
    ]

    allowed = evaluate_entitlement(
        snapshots, feature_code="invoices", used_value=998, requested_value=2
    )
    denied = evaluate_entitlement(
        snapshots, feature_code="invoices", used_value=999, requested_value=2
    )

    assert allowed.allowed and allowed.remaining == 2
    assert not denied.allowed and denied.reason == "limit_exceeded"
