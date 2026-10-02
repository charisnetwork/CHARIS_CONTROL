"""Create the clean app-scoped Control Centre baseline.

Revision ID: 20260910_0001
Revises:
Create Date: 2026-09-10

The table metadata is deliberately frozen in this revision rather than imported
from application models. Later model changes therefore cannot alter this baseline.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260910_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

metadata = sa.MetaData()
uuid_type = postgresql.UUID(as_uuid=True)
json_type = postgresql.JSONB()


def enum_type(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name)


def id_column() -> sa.Column:
    return sa.Column("id", uuid_type, primary_key=True, nullable=False)


def app_column() -> sa.Column:
    return sa.Column(
        "application_id",
        uuid_type,
        sa.ForeignKey("applications.id", ondelete="RESTRICT"),
        nullable=False,
    )


def timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


def version_column() -> sa.Column:
    return sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1"))


control_users = sa.Table(
    "control_users",
    metadata,
    id_column(),
    sa.Column("email", sa.String(320), nullable=False, unique=True),
    sa.Column("password_hash", sa.String(255), nullable=False),
    sa.Column("display_name", sa.String(160), nullable=False),
    sa.Column("role", enum_type("user_role", "owner", "team_member"), nullable=False),
    sa.Column("status", enum_type("user_status", "active", "disabled"), nullable=False),
    sa.Column("last_login_at", sa.DateTime(timezone=True)),
    *timestamps(),
)

applications = sa.Table(
    "applications",
    metadata,
    id_column(),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("slug", sa.String(100), nullable=False, unique=True),
    sa.Column("logo_url", sa.String(2048)),
    sa.Column("frontend_url", sa.String(2048)),
    sa.Column("control_api_base_url", sa.String(2048), nullable=False),
    sa.Column("health_path", sa.String(255), nullable=False),
    sa.Column(
        "environment",
        enum_type("application_environment", "development", "staging", "production"),
        nullable=False,
    ),
    sa.Column(
        "status",
        enum_type("application_status", "active", "disabled", "archived"),
        nullable=False,
    ),
    sa.Column(
        "integration_config", json_type, nullable=False, server_default=sa.text("'{}'::jsonb")
    ),
    sa.Column("archived_at", sa.DateTime(timezone=True)),
    version_column(),
    *timestamps(),
)

auth_sessions = sa.Table(
    "auth_sessions",
    metadata,
    id_column(),
    sa.Column(
        "user_id",
        uuid_type,
        sa.ForeignKey("control_users.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("refresh_token_hash", sa.String(255), nullable=False, unique=True),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("revoked_at", sa.DateTime(timezone=True)),
    sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.Column("last_used_at", sa.DateTime(timezone=True)),
    sa.Column("ip_address", sa.String(64)),
    sa.Column("user_agent", sa.String(512)),
    sa.Index("ix_auth_sessions_user_active", "user_id", "revoked_at"),
)

login_attempts = sa.Table(
    "login_attempts",
    metadata,
    id_column(),
    sa.Column("identifier_hash", sa.String(64), nullable=False),
    sa.Column("ip_address", sa.String(64), nullable=False),
    sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
    sa.Column("attempt_count", sa.Integer(), nullable=False),
    sa.Column("blocked_until", sa.DateTime(timezone=True)),
    sa.Column(
        "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.UniqueConstraint(
        "identifier_hash", "ip_address", "window_start", name="uq_login_attempt_window"
    ),
    sa.CheckConstraint(
        "attempt_count >= 0", name="ck_login_attempts_login_attempt_count_nonnegative"
    ),
    sa.Index("ix_login_attempts_identifier_ip", "identifier_hash", "ip_address"),
    sa.Index("ix_login_attempts_blocked_until", "blocked_until"),
)

user_app_permissions = sa.Table(
    "user_app_permissions",
    metadata,
    sa.Column(
        "user_id",
        uuid_type,
        sa.ForeignKey("control_users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "application_id",
        uuid_type,
        sa.ForeignKey("applications.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column(
        "permission",
        enum_type(
            "app_permission",
            "view_overview",
            "view_subscribers",
            "manage_subscribers",
            "view_subscriptions",
            "manage_subscriptions",
            "view_plans",
            "manage_plans",
            "view_coupons",
            "manage_coupons",
            "view_affiliates",
            "manage_affiliates",
            "view_notifications",
            "manage_notifications",
            "view_reports",
            "view_settings",
            "manage_settings",
            "rotate_keys",
            "view_audit",
        ),
        primary_key=True,
    ),
    sa.Column(
        "granted_by_user_id",
        uuid_type,
        sa.ForeignKey("control_users.id", ondelete="RESTRICT"),
        nullable=False,
    ),
    sa.Column(
        "granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
)

app_features = sa.Table(
    "app_features",
    metadata,
    id_column(),
    app_column(),
    sa.Column("code", sa.String(100), nullable=False),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("description", sa.Text()),
    sa.Column("default_unit", sa.String(64)),
    sa.Column("allowed_reset_periods", json_type, nullable=False),
    sa.Column("supports_numeric_limit", sa.Boolean(), nullable=False),
    sa.Column("active", sa.Boolean(), nullable=False),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("application_id", "code", name="uq_app_features_app_code"),
    sa.UniqueConstraint("id", "application_id", name="uq_app_features_id_app"),
)

subscription_plans = sa.Table(
    "subscription_plans",
    metadata,
    id_column(),
    app_column(),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("code", sa.String(100), nullable=False),
    sa.Column("description", sa.Text()),
    sa.Column("price", sa.Numeric(19, 4), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("duration_value", sa.Integer(), nullable=False),
    sa.Column("duration_unit", enum_type("duration_unit", "day", "month", "year"), nullable=False),
    sa.Column("coupons_allowed", sa.Boolean(), nullable=False),
    sa.Column("user_limit", sa.Integer()),
    sa.Column("user_limit_unlimited", sa.Boolean(), nullable=False),
    sa.Column("status", enum_type("plan_status", "draft", "active", "archived"), nullable=False),
    sa.Column("effective_at", sa.DateTime(timezone=True)),
    sa.Column("archived_at", sa.DateTime(timezone=True)),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("application_id", "name", name="uq_subscription_plans_app_name"),
    sa.UniqueConstraint("application_id", "code", name="uq_subscription_plans_app_code"),
    sa.UniqueConstraint("id", "application_id", name="uq_subscription_plans_id_app"),
    sa.CheckConstraint("price >= 0", name="ck_subscription_plans_plan_price_nonnegative"),
    sa.CheckConstraint("duration_value > 0", name="ck_subscription_plans_plan_duration_positive"),
    sa.CheckConstraint(
        "user_limit_unlimited OR user_limit IS NULL OR user_limit > 0",
        name="ck_subscription_plans_plan_user_limit_positive",
    ),
)

plan_entitlements = sa.Table(
    "plan_entitlements",
    metadata,
    id_column(),
    app_column(),
    sa.Column("plan_id", uuid_type, nullable=False),
    sa.Column("feature_id", uuid_type, nullable=False),
    sa.Column("enabled", sa.Boolean(), nullable=False),
    sa.Column("limit_type", enum_type("limit_type", "limited", "unlimited")),
    sa.Column("limit_value", sa.BigInteger()),
    sa.Column("unit", sa.String(64)),
    sa.Column(
        "reset_period",
        enum_type("reset_period", "total", "daily", "monthly", "yearly", "billing_cycle"),
    ),
    version_column(),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="CASCADE",
        name="fk_plan_entitlements_plan_app",
    ),
    sa.ForeignKeyConstraint(
        ["feature_id", "application_id"],
        ["app_features.id", "app_features.application_id"],
        ondelete="RESTRICT",
        name="fk_plan_entitlements_feature_app",
    ),
    sa.UniqueConstraint(
        "application_id", "plan_id", "feature_id", name="uq_entitlement_plan_feature"
    ),
    sa.UniqueConstraint("id", "application_id", name="uq_plan_entitlements_id_app"),
    sa.CheckConstraint(
        "(NOT enabled AND limit_type IS NULL AND limit_value IS NULL) OR "
        "(enabled AND limit_type = 'unlimited' AND limit_value IS NULL) OR "
        "(enabled AND limit_type = 'limited' AND limit_value > 0)",
        name="ck_plan_entitlements_entitlement_limit_shape",
    ),
)

subscribers = sa.Table(
    "subscribers",
    metadata,
    id_column(),
    app_column(),
    sa.Column("external_id", sa.String(255), nullable=False),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("email", sa.String(320)),
    sa.Column("mobile_number", sa.String(32)),
    sa.Column(
        "status", enum_type("subscriber_status", "active", "suspended", "archived"), nullable=False
    ),
    sa.Column("metadata", json_type, nullable=False, server_default=sa.text("'{}'::jsonb")),
    sa.Column("archived_at", sa.DateTime(timezone=True)),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("application_id", "external_id", name="uq_subscribers_app_external"),
    sa.UniqueConstraint("id", "application_id", name="uq_subscribers_id_app"),
    sa.Index("ix_subscribers_app_email", "application_id", "email"),
)

subscriptions = sa.Table(
    "subscriptions",
    metadata,
    id_column(),
    app_column(),
    sa.Column("subscriber_id", uuid_type, nullable=False),
    sa.Column("plan_id", uuid_type, nullable=False),
    sa.Column("external_id", sa.String(255)),
    sa.Column(
        "status",
        enum_type("subscription_status", "pending", "active", "suspended", "cancelled", "expired"),
        nullable=False,
    ),
    sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("ends_at", sa.DateTime(timezone=True)),
    sa.Column("cancelled_at", sa.DateTime(timezone=True)),
    sa.Column("auto_renews", sa.Boolean(), nullable=False),
    sa.Column("commercial_snapshot", json_type, nullable=False),
    sa.Column("entitlement_snapshot", json_type, nullable=False),
    version_column(),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["subscriber_id", "application_id"],
        ["subscribers.id", "subscribers.application_id"],
        ondelete="RESTRICT",
        name="fk_subscriptions_subscriber_app",
    ),
    sa.ForeignKeyConstraint(
        ["plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="RESTRICT",
        name="fk_subscriptions_plan_app",
    ),
    sa.UniqueConstraint("id", "application_id", name="uq_subscriptions_id_app"),
    sa.UniqueConstraint("application_id", "external_id", name="uq_subscriptions_app_external"),
    sa.CheckConstraint(
        "ends_at IS NULL OR ends_at > starts_at", name="ck_subscriptions_subscription_dates_ordered"
    ),
    sa.Index("ix_subscriptions_app_status", "application_id", "status"),
    sa.Index(
        "uq_subscriptions_one_active_per_subscriber",
        "application_id",
        "subscriber_id",
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    ),
)

subscription_events = sa.Table(
    "subscription_events",
    metadata,
    id_column(),
    app_column(),
    sa.Column("subscription_id", uuid_type, nullable=False),
    sa.Column("event_type", sa.String(100), nullable=False),
    sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("details", json_type, nullable=False),
    sa.Column("actor_user_id", uuid_type, sa.ForeignKey("control_users.id", ondelete="SET NULL")),
    sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.ForeignKeyConstraint(
        ["subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="CASCADE",
        name="fk_subscription_events_subscription_app",
    ),
    sa.Index("ix_subscription_events_app_subscription", "application_id", "subscription_id"),
)

usage_counters = sa.Table(
    "usage_counters",
    metadata,
    id_column(),
    app_column(),
    sa.Column("subscription_id", uuid_type, nullable=False),
    sa.Column("feature_id", uuid_type, nullable=False),
    sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
    sa.Column("period_end", sa.DateTime(timezone=True)),
    sa.Column("used_value", sa.BigInteger(), nullable=False),
    version_column(),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="CASCADE",
        name="fk_usage_counters_subscription_app",
    ),
    sa.ForeignKeyConstraint(
        ["feature_id", "application_id"],
        ["app_features.id", "app_features.application_id"],
        ondelete="RESTRICT",
        name="fk_usage_counters_feature_app",
    ),
    sa.UniqueConstraint(
        "application_id",
        "subscription_id",
        "feature_id",
        "period_start",
        name="uq_usage_counter_period",
    ),
    sa.UniqueConstraint("id", "application_id", name="uq_usage_counters_id_app"),
    sa.CheckConstraint("used_value >= 0", name="ck_usage_counters_usage_counter_nonnegative"),
    sa.CheckConstraint(
        "period_end IS NULL OR period_end > period_start",
        name="ck_usage_counters_usage_period_ordered",
    ),
)

usage_events = sa.Table(
    "usage_events",
    metadata,
    id_column(),
    app_column(),
    sa.Column("counter_id", uuid_type, nullable=False),
    sa.Column("idempotency_key", sa.String(255), nullable=False),
    sa.Column("delta", sa.BigInteger(), nullable=False),
    sa.Column("operation", sa.String(100), nullable=False),
    sa.Column("metadata", json_type, nullable=False, server_default=sa.text("'{}'::jsonb")),
    sa.Column(
        "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.ForeignKeyConstraint(
        ["counter_id", "application_id"],
        ["usage_counters.id", "usage_counters.application_id"],
        ondelete="CASCADE",
        name="fk_usage_events_counter_app",
    ),
    sa.UniqueConstraint(
        "application_id", "idempotency_key", name="uq_usage_events_app_idempotency"
    ),
    sa.CheckConstraint("delta <> 0", name="ck_usage_events_usage_event_delta_nonzero"),
)

affiliates = sa.Table(
    "affiliates",
    metadata,
    id_column(),
    app_column(),
    sa.Column("company_name", sa.String(200)),
    sa.Column("contact_name", sa.String(160), nullable=False),
    sa.Column("mobile_number", sa.String(32)),
    sa.Column("email", sa.String(320), nullable=False),
    sa.Column("tax_registration_number", sa.String(64)),
    sa.Column("address", json_type, nullable=False),
    sa.Column("notes", sa.Text()),
    sa.Column(
        "status", enum_type("affiliate_status", "active", "disabled", "archived"), nullable=False
    ),
    sa.Column("archived_at", sa.DateTime(timezone=True)),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("application_id", "email", name="uq_affiliates_app_email"),
    sa.UniqueConstraint("id", "application_id", name="uq_affiliates_id_app"),
)

coupons = sa.Table(
    "coupons",
    metadata,
    id_column(),
    app_column(),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("code", sa.String(100), nullable=False),
    sa.Column("kind", enum_type("coupon_kind", "promotion", "affiliate"), nullable=False),
    sa.Column("affiliate_id", uuid_type),
    sa.Column(
        "discount_type", enum_type("discount_value_type", "percentage", "fixed"), nullable=False
    ),
    sa.Column("discount_value", sa.Numeric(19, 4), nullable=False),
    sa.Column("commission_type", enum_type("commission_value_type", "percentage", "fixed")),
    sa.Column("commission_value", sa.Numeric(19, 4)),
    sa.Column("commission_currency", sa.String(3)),
    sa.Column("currency", sa.String(3)),
    sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("maximum_redemptions", sa.Integer(), nullable=False),
    sa.Column("per_subscriber_limit", sa.Integer()),
    sa.Column("first_subscription_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("minimum_duration_value", sa.Integer()),
    sa.Column(
        "minimum_duration_unit",
        enum_type("coupon_minimum_duration_unit", "day", "month", "year"),
    ),
    sa.Column("redemption_count", sa.Integer(), nullable=False),
    sa.Column(
        "status",
        enum_type("coupon_status", "active", "scheduled", "expired", "disabled"),
        nullable=False,
    ),
    version_column(),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["affiliate_id", "application_id"],
        ["affiliates.id", "affiliates.application_id"],
        ondelete="RESTRICT",
        name="fk_coupons_affiliate_app",
    ),
    sa.UniqueConstraint("application_id", "code", name="uq_coupons_app_code"),
    sa.UniqueConstraint("id", "application_id", name="uq_coupons_id_app"),
    sa.CheckConstraint("code = upper(code)", name="ck_coupons_coupon_code_uppercase"),
    sa.CheckConstraint("discount_value > 0", name="ck_coupons_coupon_discount_positive"),
    sa.CheckConstraint("ends_at > starts_at", name="ck_coupons_coupon_dates_ordered"),
    sa.CheckConstraint(
        "maximum_redemptions > 0", name="ck_coupons_coupon_max_redemptions_positive"
    ),
    sa.CheckConstraint(
        "per_subscriber_limit IS NULL OR per_subscriber_limit > 0",
        name="ck_coupons_coupon_per_subscriber_limit_positive",
    ),
    sa.CheckConstraint(
        "(minimum_duration_value IS NULL AND minimum_duration_unit IS NULL) OR "
        "(minimum_duration_value > 0 AND minimum_duration_unit IS NOT NULL)",
        name="ck_coupons_coupon_minimum_duration_shape",
    ),
    sa.CheckConstraint(
        "redemption_count >= 0 AND redemption_count <= maximum_redemptions",
        name="ck_coupons_coupon_redemption_count_valid",
    ),
    sa.CheckConstraint(
        "(kind = 'promotion' AND affiliate_id IS NULL AND commission_type IS NULL "
        "AND commission_value IS NULL AND commission_currency IS NULL) OR "
        "(kind = 'affiliate' AND affiliate_id IS NOT NULL AND commission_type IS NOT NULL "
        "AND commission_value > 0)",
        name="ck_coupons_coupon_affiliate_shape",
    ),
    sa.CheckConstraint(
        "discount_type <> 'percentage' OR discount_value <= 100",
        name="ck_coupons_coupon_discount_percentage_max",
    ),
    sa.CheckConstraint(
        "(discount_type = 'percentage' AND currency IS NULL) OR "
        "(discount_type = 'fixed' AND currency IS NOT NULL)",
        name="ck_coupons_coupon_discount_currency_shape",
    ),
    sa.CheckConstraint(
        "(commission_type IS NULL AND commission_currency IS NULL) OR "
        "(commission_type = 'percentage' AND commission_currency IS NULL) OR "
        "(commission_type = 'fixed' AND commission_currency IS NOT NULL)",
        name="ck_coupons_coupon_commission_currency_shape",
    ),
    sa.CheckConstraint(
        "commission_type <> 'percentage' OR commission_value <= 100",
        name="ck_coupons_coupon_commission_percentage_max",
    ),
)

coupon_plans = sa.Table(
    "coupon_plans",
    metadata,
    app_column(),
    sa.Column("coupon_id", uuid_type, nullable=False),
    sa.Column("plan_id", uuid_type, nullable=False),
    sa.ForeignKeyConstraint(
        ["coupon_id", "application_id"],
        ["coupons.id", "coupons.application_id"],
        ondelete="CASCADE",
        name="fk_coupon_plans_coupon_app",
    ),
    sa.ForeignKeyConstraint(
        ["plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="CASCADE",
        name="fk_coupon_plans_plan_app",
    ),
    sa.PrimaryKeyConstraint("application_id", "coupon_id", "plan_id"),
)

payment_transactions = sa.Table(
    "payment_transactions",
    metadata,
    id_column(),
    app_column(),
    sa.Column("subscription_id", uuid_type, nullable=False),
    sa.Column("provider", sa.String(100), nullable=False),
    sa.Column("provider_payment_id", sa.String(255), nullable=False),
    sa.Column("provider_order_id", sa.String(255)),
    sa.Column("amount", sa.Numeric(19, 4), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column(
        "status",
        enum_type(
            "payment_status", "pending", "succeeded", "failed", "refunded", "partially_refunded"
        ),
        nullable=False,
    ),
    sa.Column("paid_at", sa.DateTime(timezone=True)),
    sa.Column("metadata", json_type, nullable=False, server_default=sa.text("'{}'::jsonb")),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="RESTRICT",
        name="fk_payments_subscription_app",
    ),
    sa.UniqueConstraint(
        "application_id", "provider", "provider_payment_id", name="uq_payments_provider_reference"
    ),
    sa.UniqueConstraint("id", "application_id", name="uq_payment_transactions_id_app"),
    sa.CheckConstraint("amount >= 0", name="ck_payment_transactions_payment_amount_nonnegative"),
)

coupon_redemptions = sa.Table(
    "coupon_redemptions",
    metadata,
    id_column(),
    app_column(),
    sa.Column("coupon_id", uuid_type, nullable=False),
    sa.Column("subscription_id", uuid_type, nullable=False),
    sa.Column("payment_id", uuid_type),
    sa.Column("idempotency_key", sa.String(255), nullable=False),
    sa.Column("discount_amount", sa.Numeric(19, 4), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column(
        "redeemed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.ForeignKeyConstraint(
        ["coupon_id", "application_id"],
        ["coupons.id", "coupons.application_id"],
        ondelete="RESTRICT",
        name="fk_coupon_redemptions_coupon_app",
    ),
    sa.ForeignKeyConstraint(
        ["subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="RESTRICT",
        name="fk_coupon_redemptions_subscription_app",
    ),
    sa.ForeignKeyConstraint(
        ["payment_id", "application_id"],
        ["payment_transactions.id", "payment_transactions.application_id"],
        ondelete="RESTRICT",
        name="fk_coupon_redemptions_payment_app",
    ),
    sa.UniqueConstraint(
        "application_id", "idempotency_key", name="uq_coupon_redemptions_app_idempotency"
    ),
    sa.UniqueConstraint("id", "application_id", name="uq_coupon_redemptions_id_app"),
    sa.CheckConstraint(
        "discount_amount >= 0", name="ck_coupon_redemptions_redemption_discount_nonnegative"
    ),
)

affiliate_commissions = sa.Table(
    "affiliate_commissions",
    metadata,
    id_column(),
    app_column(),
    sa.Column("affiliate_id", uuid_type, nullable=False),
    sa.Column("redemption_id", uuid_type),
    sa.Column(
        "entry_type",
        enum_type("commission_entry_type", "earned", "paid", "adjustment"),
        nullable=False,
    ),
    sa.Column("amount", sa.Numeric(19, 4), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("reference", sa.String(255), nullable=False),
    sa.Column("notes", sa.Text()),
    sa.Column(
        "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.ForeignKeyConstraint(
        ["affiliate_id", "application_id"],
        ["affiliates.id", "affiliates.application_id"],
        ondelete="RESTRICT",
        name="fk_affiliate_commissions_affiliate_app",
    ),
    sa.ForeignKeyConstraint(
        ["redemption_id", "application_id"],
        ["coupon_redemptions.id", "coupon_redemptions.application_id"],
        ondelete="RESTRICT",
        name="fk_affiliate_commissions_redemption_app",
    ),
    sa.UniqueConstraint(
        "application_id", "reference", "entry_type", name="uq_commission_reference_type"
    ),
    sa.CheckConstraint("amount <> 0", name="ck_affiliate_commissions_commission_amount_nonzero"),
)

notifications = sa.Table(
    "notifications",
    metadata,
    id_column(),
    app_column(),
    sa.Column("title", sa.String(200), nullable=False),
    sa.Column("message", sa.Text(), nullable=False),
    sa.Column("deep_link", sa.String(2048)),
    sa.Column("action_metadata", json_type, nullable=False),
    sa.Column(
        "audience_type",
        enum_type("notification_audience_type", "all_subscribers", "plans"),
        nullable=False,
    ),
    sa.Column(
        "status",
        enum_type(
            "notification_status", "draft", "scheduled", "processing", "sent", "failed", "cancelled"
        ),
        nullable=False,
    ),
    sa.Column("scheduled_at", sa.DateTime(timezone=True)),
    sa.Column("sent_at", sa.DateTime(timezone=True)),
    sa.Column(
        "created_by_user_id",
        uuid_type,
        sa.ForeignKey("control_users.id", ondelete="RESTRICT"),
        nullable=False,
    ),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("id", "application_id", name="uq_notifications_id_app"),
    sa.CheckConstraint(
        "status <> 'scheduled' OR scheduled_at IS NOT NULL",
        name="ck_notifications_notification_scheduled_at_required",
    ),
    sa.Index("ix_notifications_app_status", "application_id", "status"),
)

notification_plan_audiences = sa.Table(
    "notification_plan_audiences",
    metadata,
    app_column(),
    sa.Column("notification_id", uuid_type, nullable=False),
    sa.Column("plan_id", uuid_type, nullable=False),
    sa.ForeignKeyConstraint(
        ["notification_id", "application_id"],
        ["notifications.id", "notifications.application_id"],
        ondelete="CASCADE",
        name="fk_notification_audience_notification_app",
    ),
    sa.ForeignKeyConstraint(
        ["plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="CASCADE",
        name="fk_notification_audience_plan_app",
    ),
    sa.PrimaryKeyConstraint("application_id", "notification_id", "plan_id"),
)

notification_deliveries = sa.Table(
    "notification_deliveries",
    metadata,
    id_column(),
    app_column(),
    sa.Column("notification_id", uuid_type, nullable=False),
    sa.Column("subscriber_id", uuid_type, nullable=False),
    sa.Column("idempotency_key", sa.String(255), nullable=False),
    sa.Column("provider", sa.String(100), nullable=False),
    sa.Column("provider_reference", sa.String(255)),
    sa.Column(
        "status",
        enum_type("delivery_status", "pending", "sent", "failed", "retrying"),
        nullable=False,
    ),
    sa.Column("attempt_count", sa.Integer(), nullable=False),
    sa.Column("last_error_code", sa.String(100)),
    sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
    sa.Column("delivered_at", sa.DateTime(timezone=True)),
    sa.ForeignKeyConstraint(
        ["notification_id", "application_id"],
        ["notifications.id", "notifications.application_id"],
        ondelete="CASCADE",
        name="fk_notification_deliveries_notification_app",
    ),
    sa.ForeignKeyConstraint(
        ["subscriber_id", "application_id"],
        ["subscribers.id", "subscribers.application_id"],
        ondelete="RESTRICT",
        name="fk_notification_deliveries_subscriber_app",
    ),
    sa.UniqueConstraint(
        "application_id", "idempotency_key", name="uq_notification_delivery_idempotency"
    ),
    sa.UniqueConstraint(
        "application_id",
        "notification_id",
        "subscriber_id",
        name="uq_notification_delivery_recipient",
    ),
    sa.CheckConstraint(
        "attempt_count >= 0", name="ck_notification_deliveries_delivery_attempt_count_nonnegative"
    ),
)

health_checks = sa.Table(
    "health_checks",
    metadata,
    id_column(),
    app_column(),
    sa.Column(
        "overall_status",
        enum_type("health_status", "healthy", "degraded", "critical", "unknown"),
        nullable=False,
    ),
    sa.Column(
        "frontend_status",
        enum_type("frontend_health_status", "healthy", "degraded", "critical", "unknown"),
        nullable=False,
    ),
    sa.Column(
        "backend_status",
        enum_type("backend_health_status", "healthy", "degraded", "critical", "unknown"),
        nullable=False,
    ),
    sa.Column(
        "database_status",
        enum_type("database_health_status", "healthy", "degraded", "critical", "unknown"),
        nullable=False,
    ),
    sa.Column("latency_ms", sa.Integer()),
    sa.Column("dependencies", json_type, nullable=False),
    sa.Column("incident_summary", sa.Text()),
    sa.Column(
        "checked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.CheckConstraint(
        "latency_ms IS NULL OR latency_ms >= 0", name="ck_health_checks_health_latency_nonnegative"
    ),
    sa.Index("ix_health_checks_app_checked", "application_id", "checked_at"),
)

app_credentials = sa.Table(
    "app_credentials",
    metadata,
    id_column(),
    app_column(),
    sa.Column("credential_type", sa.String(100), nullable=False),
    sa.Column("key_prefix", sa.String(32), nullable=False),
    sa.Column("secret_hash", sa.String(255)),
    sa.Column("encrypted_secret_reference", sa.String(1024)),
    sa.Column("credential_version", sa.Integer(), nullable=False),
    sa.Column(
        "status", enum_type("credential_status", "active", "grace", "revoked"), nullable=False
    ),
    sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
    sa.Column("grace_ends_at", sa.DateTime(timezone=True)),
    sa.Column("revoked_at", sa.DateTime(timezone=True)),
    *timestamps(),
    sa.UniqueConstraint(
        "application_id", "credential_type", "credential_version", name="uq_app_credential_version"
    ),
    sa.CheckConstraint(
        "(secret_hash IS NOT NULL) <> (encrypted_secret_reference IS NOT NULL)",
        name="ck_app_credentials_credential_one_secret_storage_mode",
    ),
    sa.CheckConstraint(
        "credential_version > 0", name="ck_app_credentials_credential_version_positive"
    ),
)

plan_ui_configs = sa.Table(
    "plan_ui_configs",
    metadata,
    id_column(),
    app_column(),
    sa.Column("recommended_plan_id", uuid_type),
    sa.Column("show_feature_comparison", sa.Boolean(), nullable=False),
    sa.Column("show_billing_period_selector", sa.Boolean(), nullable=False),
    sa.Column("display_labels", json_type, nullable=False),
    version_column(),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["recommended_plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="RESTRICT",
        name="fk_plan_ui_configs_recommended_plan_app",
    ),
    sa.UniqueConstraint("application_id", name="uq_plan_ui_configs_app"),
    sa.UniqueConstraint("id", "application_id", name="uq_plan_ui_configs_id_app"),
)

plan_ui_items = sa.Table(
    "plan_ui_items",
    metadata,
    id_column(),
    app_column(),
    sa.Column("config_id", uuid_type, nullable=False),
    sa.Column("plan_id", uuid_type, nullable=False),
    sa.Column("visible", sa.Boolean(), nullable=False),
    sa.Column("display_order", sa.Integer(), nullable=False),
    sa.Column("display_label", sa.String(160)),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["config_id", "application_id"],
        ["plan_ui_configs.id", "plan_ui_configs.application_id"],
        ondelete="CASCADE",
        name="fk_plan_ui_items_config_app",
    ),
    sa.ForeignKeyConstraint(
        ["plan_id", "application_id"],
        ["subscription_plans.id", "subscription_plans.application_id"],
        ondelete="RESTRICT",
        name="fk_plan_ui_items_plan_app",
    ),
    sa.UniqueConstraint("application_id", "config_id", "plan_id", name="uq_plan_ui_item_plan"),
    sa.UniqueConstraint(
        "application_id", "config_id", "display_order", name="uq_plan_ui_item_order"
    ),
    sa.CheckConstraint(
        "display_order >= 0", name="ck_plan_ui_items_plan_ui_item_order_nonnegative"
    ),
)

report_jobs = sa.Table(
    "report_jobs",
    metadata,
    id_column(),
    app_column(),
    sa.Column("report_type", sa.String(100), nullable=False),
    sa.Column("output_format", sa.String(16), nullable=False),
    sa.Column("parameters", json_type, nullable=False),
    sa.Column(
        "status",
        enum_type("report_status", "pending", "running", "completed", "failed", "expired"),
        nullable=False,
    ),
    sa.Column(
        "requested_by_user_id",
        uuid_type,
        sa.ForeignKey("control_users.id", ondelete="RESTRICT"),
        nullable=False,
    ),
    sa.Column("result_reference", sa.String(2048)),
    sa.Column("error_code", sa.String(100)),
    sa.Column(
        "requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.Column("completed_at", sa.DateTime(timezone=True)),
    sa.Column("expires_at", sa.DateTime(timezone=True)),
    sa.Index("ix_report_jobs_app_status", "application_id", "status"),
)

webhook_endpoints = sa.Table(
    "webhook_endpoints",
    metadata,
    id_column(),
    app_column(),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("url", sa.String(2048), nullable=False),
    sa.Column("signing_secret_reference", sa.String(1024), nullable=False),
    sa.Column("subscribed_events", json_type, nullable=False),
    sa.Column("enabled", sa.Boolean(), nullable=False),
    version_column(),
    *timestamps(),
    sa.UniqueConstraint("application_id", "name", name="uq_webhook_endpoints_app_name"),
    sa.UniqueConstraint("id", "application_id", name="uq_webhook_endpoints_id_app"),
)

webhook_events = sa.Table(
    "webhook_events",
    metadata,
    id_column(),
    app_column(),
    sa.Column("event_type", sa.String(160), nullable=False),
    sa.Column("aggregate_type", sa.String(100), nullable=False),
    sa.Column("aggregate_id", sa.String(255), nullable=False),
    sa.Column("payload", json_type, nullable=False),
    sa.Column("idempotency_key", sa.String(255), nullable=False),
    sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.UniqueConstraint("application_id", "idempotency_key", name="uq_webhook_event_idempotency"),
    sa.UniqueConstraint("id", "application_id", name="uq_webhook_events_id_app"),
    sa.Index("ix_webhook_events_app_occurred", "application_id", "occurred_at"),
)

webhook_deliveries = sa.Table(
    "webhook_deliveries",
    metadata,
    id_column(),
    app_column(),
    sa.Column("event_id", uuid_type, nullable=False),
    sa.Column("endpoint_id", uuid_type, nullable=False),
    sa.Column(
        "status",
        enum_type(
            "webhook_delivery_status", "pending", "processing", "delivered", "retrying", "failed"
        ),
        nullable=False,
    ),
    sa.Column("attempt_count", sa.Integer(), nullable=False),
    sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
    sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
    sa.Column("delivered_at", sa.DateTime(timezone=True)),
    sa.Column("response_status", sa.Integer()),
    sa.Column("last_error_code", sa.String(100)),
    sa.Column("lease_token", uuid_type),
    sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
    *timestamps(),
    sa.ForeignKeyConstraint(
        ["event_id", "application_id"],
        ["webhook_events.id", "webhook_events.application_id"],
        ondelete="CASCADE",
        name="fk_webhook_deliveries_event_app",
    ),
    sa.ForeignKeyConstraint(
        ["endpoint_id", "application_id"],
        ["webhook_endpoints.id", "webhook_endpoints.application_id"],
        ondelete="RESTRICT",
        name="fk_webhook_deliveries_endpoint_app",
    ),
    sa.UniqueConstraint(
        "application_id", "event_id", "endpoint_id", name="uq_webhook_delivery_target"
    ),
    sa.CheckConstraint(
        "attempt_count >= 0",
        name="ck_webhook_deliveries_webhook_attempt_count_nonnegative",
    ),
    sa.CheckConstraint(
        "response_status IS NULL OR (response_status >= 100 AND response_status <= 599)",
        name="ck_webhook_deliveries_webhook_response_status_valid",
    ),
    sa.Index("ix_webhook_deliveries_claim", "status", "next_attempt_at", "lease_expires_at"),
)

audit_logs = sa.Table(
    "audit_logs",
    metadata,
    id_column(),
    app_column(),
    sa.Column("actor_user_id", uuid_type, sa.ForeignKey("control_users.id", ondelete="SET NULL")),
    sa.Column("action", sa.String(160), nullable=False),
    sa.Column("entity_type", sa.String(100), nullable=False),
    sa.Column("entity_id", sa.String(255)),
    sa.Column("correlation_id", sa.String(100), nullable=False),
    sa.Column("before_summary", json_type),
    sa.Column("after_summary", json_type),
    sa.Column("ip_address", sa.String(64)),
    sa.Column(
        "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.Index("ix_audit_logs_app_occurred", "application_id", "occurred_at"),
    sa.Index("ix_audit_logs_app_entity", "application_id", "entity_type", "entity_id"),
)


def upgrade() -> None:
    metadata.create_all(bind=op.get_bind(), checkfirst=False)


def downgrade() -> None:
    metadata.drop_all(bind=op.get_bind(), checkfirst=False)
