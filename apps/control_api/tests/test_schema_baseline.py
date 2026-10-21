from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from sqlalchemy import Column, Enum, ForeignKeyConstraint, String, UniqueConstraint

from app.db import models  # noqa: F401
from app.db.base import Base


def load_baseline() -> ModuleType:
    path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260910_0001_clean_control_centre_baseline.py"
    )
    specification = importlib.util.spec_from_file_location("clean_baseline", path)
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def test_baseline_table_and_column_shape_matches_models() -> None:
    baseline = load_baseline()
    path = Path(__file__).parents[1] / "alembic/versions/20261013_0002_razorpay_checkout.py"
    specification = importlib.util.spec_from_file_location("razorpay_migration", path)
    assert specification is not None and specification.loader is not None
    migration = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(migration)
    migration.checkout.to_metadata(baseline.metadata)
    # The incremental customer checkout revision adds this nullable actor column.
    assert (
        Path(__file__).parents[1] / "alembic/versions/20261020_0003_customer_checkout.py"
    ).exists()
    baseline.metadata.tables["razorpay_checkouts"].append_column(
        Column("external_actor_id", String(255))
    )
    # 20261021_0005 adds app-published feature details and storefront plan fields.
    assert (
        Path(__file__).parents[1]
        / "alembic/versions/20261021_0005_feature_catalog_and_storefront.py"
    ).exists()
    for name in ("group_name", "display_order", "source", "synced_at"):
        baseline.metadata.tables["app_features"].append_column(Column(name, String()))
    for name in ("tagline", "badge", "compare_at_price", "pricing_group"):
        baseline.metadata.tables["subscription_plans"].append_column(Column(name, String()))
    migration_tables = baseline.metadata.tables
    model_tables = Base.metadata.tables

    assert set(model_tables) == set(migration_tables)
    for table_name, model_table in model_tables.items():
        assert set(model_table.columns.keys()) == set(migration_tables[table_name].columns.keys())
        for column in model_table.columns:
            if isinstance(column.type, Enum):
                assert (
                    column.type.enums
                    == migration_tables[table_name].columns[column.name].type.enums
                )


def test_webhook_delivery_foreign_keys_are_application_scoped() -> None:
    table = Base.metadata.tables["webhook_deliveries"]
    foreign_keys = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
    ]
    constrained_columns = {
        tuple(column.name for column in constraint.columns) for constraint in foreign_keys
    }

    assert ("event_id", "application_id") in constrained_columns
    assert ("endpoint_id", "application_id") in constrained_columns
    assert any(
        isinstance(constraint, UniqueConstraint)
        and tuple(column.name for column in constraint.columns)
        == ("application_id", "event_id", "endpoint_id")
        for constraint in table.constraints
    )


def test_usage_and_active_subscription_uniqueness_are_database_enforced() -> None:
    subscriptions = Base.metadata.tables["subscriptions"]
    counters = Base.metadata.tables["usage_counters"]
    usage_events = Base.metadata.tables["usage_events"]

    assert any(
        index.name == "uq_subscriptions_one_active_per_subscriber" and index.unique
        for index in subscriptions.indexes
    )
    assert any(
        isinstance(constraint, UniqueConstraint) and constraint.name == "uq_usage_counter_period"
        for constraint in counters.constraints
    )
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_usage_events_app_idempotency"
        for constraint in usage_events.constraints
    )


def test_coupon_redemption_idempotency_is_database_enforced() -> None:
    redemptions = Base.metadata.tables["coupon_redemptions"]
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_coupon_redemptions_app_idempotency"
        for constraint in redemptions.constraints
    )
    commissions = Base.metadata.tables["affiliate_commissions"]
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_commission_reference_type"
        for constraint in commissions.constraints
    )


def test_notification_recipient_and_idempotency_are_database_enforced() -> None:
    deliveries = Base.metadata.tables["notification_deliveries"]
    unique_names = {
        constraint.name
        for constraint in deliveries.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert "uq_notification_delivery_idempotency" in unique_names
    assert "uq_notification_delivery_recipient" in unique_names
