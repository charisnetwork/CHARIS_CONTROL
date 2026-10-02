from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    text as sql_text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(enum.StrEnum):
    OWNER = "owner"
    TEAM_MEMBER = "team_member"


class UserStatus(enum.StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ApplicationEnvironment(enum.StrEnum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class ApplicationStatus(enum.StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class AppPermission(enum.StrEnum):
    VIEW_OVERVIEW = "view_overview"
    VIEW_SUBSCRIBERS = "view_subscribers"
    MANAGE_SUBSCRIBERS = "manage_subscribers"
    VIEW_SUBSCRIPTIONS = "view_subscriptions"
    MANAGE_SUBSCRIPTIONS = "manage_subscriptions"
    VIEW_PLANS = "view_plans"
    MANAGE_PLANS = "manage_plans"
    VIEW_COUPONS = "view_coupons"
    MANAGE_COUPONS = "manage_coupons"
    VIEW_AFFILIATES = "view_affiliates"
    MANAGE_AFFILIATES = "manage_affiliates"
    VIEW_NOTIFICATIONS = "view_notifications"
    MANAGE_NOTIFICATIONS = "manage_notifications"
    VIEW_REPORTS = "view_reports"
    VIEW_SETTINGS = "view_settings"
    MANAGE_SETTINGS = "manage_settings"
    ROTATE_KEYS = "rotate_keys"
    VIEW_AUDIT = "view_audit"


class LimitType(enum.StrEnum):
    LIMITED = "limited"
    UNLIMITED = "unlimited"


class ResetPeriod(enum.StrEnum):
    TOTAL = "total"
    DAILY = "daily"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    BILLING_CYCLE = "billing_cycle"


class PlanStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class DurationUnit(enum.StrEnum):
    DAY = "day"
    MONTH = "month"
    YEAR = "year"


class SubscriberStatus(enum.StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class SubscriptionStatus(enum.StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class CouponKind(enum.StrEnum):
    PROMOTION = "promotion"
    AFFILIATE = "affiliate"


class ValueType(enum.StrEnum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class CouponStatus(enum.StrEnum):
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    EXPIRED = "expired"
    DISABLED = "disabled"


class AffiliateStatus(enum.StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class CommissionEntryType(enum.StrEnum):
    EARNED = "earned"
    PAID = "paid"
    ADJUSTMENT = "adjustment"


class NotificationAudienceType(enum.StrEnum):
    ALL_SUBSCRIBERS = "all_subscribers"
    PLANS = "plans"


class NotificationStatus(enum.StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PROCESSING = "processing"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DeliveryStatus(enum.StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRYING = "retrying"


class HealthStatus(enum.StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class CredentialStatus(enum.StrEnum):
    ACTIVE = "active"
    GRACE = "grace"
    REVOKED = "revoked"


class ReportStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class PaymentStatus(enum.StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class WebhookDeliveryStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    RETRYING = "retrying"
    FAILED = "failed"


def enum_column(enum_type: type[enum.Enum], name: str) -> Enum:
    return Enum(
        enum_type,
        name=name,
        native_enum=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class VersionMixin:
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class ApplicationScopedMixin:
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="RESTRICT"), nullable=False
    )


class ControlUser(IdMixin, TimestampMixin, Base):
    __tablename__ = "control_users"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole, "user_role"), nullable=False, default=UserRole.TEAM_MEMBER
    )
    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus, "user_status"), nullable=False, default=UserStatus.ACTIVE
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(IdMixin, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="CASCADE"), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))

    __table_args__ = (Index("ix_auth_sessions_user_active", "user_id", "revoked_at"),)


class LoginAttempt(IdMixin, Base):
    __tablename__ = "login_attempts"

    identifier_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "identifier_hash", "ip_address", "window_start", name="uq_login_attempt_window"
        ),
        CheckConstraint("attempt_count >= 0", name="login_attempt_count_nonnegative"),
        Index("ix_login_attempts_identifier_ip", "identifier_hash", "ip_address"),
        Index("ix_login_attempts_blocked_until", "blocked_until"),
    )


class Application(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "applications"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(2048))
    frontend_url: Mapped[str | None] = mapped_column(String(2048))
    control_api_base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    health_path: Mapped[str] = mapped_column(
        String(255), nullable=False, default="/control/v1/health"
    )
    environment: Mapped[ApplicationEnvironment] = mapped_column(
        enum_column(ApplicationEnvironment, "application_environment"), nullable=False
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        enum_column(ApplicationStatus, "application_status"),
        nullable=False,
        default=ApplicationStatus.ACTIVE,
    )
    integration_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserAppPermission(Base):
    __tablename__ = "user_app_permissions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="CASCADE"), primary_key=True
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True
    )
    permission: Mapped[AppPermission] = mapped_column(
        enum_column(AppPermission, "app_permission"), primary_key=True
    )
    granted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="RESTRICT"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AppFeature(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "app_features"

    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    default_unit: Mapped[str | None] = mapped_column(String(64))
    allowed_reset_periods: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    supports_numeric_limit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("application_id", "code", name="uq_app_features_app_code"),
        UniqueConstraint("id", "application_id", name="uq_app_features_id_app"),
    )


class SubscriptionPlan(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "subscription_plans"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    duration_value: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_unit: Mapped[DurationUnit] = mapped_column(
        enum_column(DurationUnit, "duration_unit"), nullable=False
    )
    coupons_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_limit: Mapped[int | None] = mapped_column(Integer)
    user_limit_unlimited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[PlanStatus] = mapped_column(
        enum_column(PlanStatus, "plan_status"), nullable=False, default=PlanStatus.DRAFT
    )
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("application_id", "name", name="uq_subscription_plans_app_name"),
        UniqueConstraint("application_id", "code", name="uq_subscription_plans_app_code"),
        UniqueConstraint("id", "application_id", name="uq_subscription_plans_id_app"),
        CheckConstraint("price >= 0", name="plan_price_nonnegative"),
        CheckConstraint("duration_value > 0", name="plan_duration_positive"),
        CheckConstraint(
            "user_limit_unlimited OR user_limit IS NULL OR user_limit > 0",
            name="plan_user_limit_positive",
        ),
    )


class PlanEntitlement(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "plan_entitlements"

    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    limit_type: Mapped[LimitType | None] = mapped_column(
        enum_column(LimitType, "limit_type"), nullable=True
    )
    limit_value: Mapped[int | None] = mapped_column(BigInteger)
    unit: Mapped[str | None] = mapped_column(String(64))
    reset_period: Mapped[ResetPeriod | None] = mapped_column(
        enum_column(ResetPeriod, "reset_period"), nullable=True
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="CASCADE",
            name="fk_plan_entitlements_plan_app",
        ),
        ForeignKeyConstraint(
            ["feature_id", "application_id"],
            ["app_features.id", "app_features.application_id"],
            ondelete="RESTRICT",
            name="fk_plan_entitlements_feature_app",
        ),
        UniqueConstraint(
            "application_id", "plan_id", "feature_id", name="uq_entitlement_plan_feature"
        ),
        UniqueConstraint("id", "application_id", name="uq_plan_entitlements_id_app"),
        CheckConstraint(
            "(NOT enabled AND limit_type IS NULL AND limit_value IS NULL) OR "
            "(enabled AND limit_type = 'unlimited' AND limit_value IS NULL) OR "
            "(enabled AND limit_type = 'limited' AND limit_value > 0)",
            name="entitlement_limit_shape",
        ),
    )


class Subscriber(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "subscribers"

    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    mobile_number: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[SubscriberStatus] = mapped_column(
        enum_column(SubscriberStatus, "subscriber_status"),
        nullable=False,
        default=SubscriberStatus.ACTIVE,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("application_id", "external_id", name="uq_subscribers_app_external"),
        UniqueConstraint("id", "application_id", name="uq_subscribers_id_app"),
        Index("ix_subscribers_app_email", "application_id", "email"),
    )


class Subscription(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "subscriptions"

    subscriber_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[SubscriptionStatus] = mapped_column(
        enum_column(SubscriptionStatus, "subscription_status"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_renews: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    commercial_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    entitlement_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["subscriber_id", "application_id"],
            ["subscribers.id", "subscribers.application_id"],
            ondelete="RESTRICT",
            name="fk_subscriptions_subscriber_app",
        ),
        ForeignKeyConstraint(
            ["plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="RESTRICT",
            name="fk_subscriptions_plan_app",
        ),
        UniqueConstraint("id", "application_id", name="uq_subscriptions_id_app"),
        UniqueConstraint("application_id", "external_id", name="uq_subscriptions_app_external"),
        CheckConstraint(
            "ends_at IS NULL OR ends_at > starts_at", name="subscription_dates_ordered"
        ),
        Index("ix_subscriptions_app_status", "application_id", "status"),
        Index(
            "uq_subscriptions_one_active_per_subscriber",
            "application_id",
            "subscriber_id",
            unique=True,
            postgresql_where=sql_text("status = 'active'"),
        ),
    )


class SubscriptionEvent(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "subscription_events"

    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["subscription_id", "application_id"],
            ["subscriptions.id", "subscriptions.application_id"],
            ondelete="CASCADE",
            name="fk_subscription_events_subscription_app",
        ),
        Index("ix_subscription_events_app_subscription", "application_id", "subscription_id"),
    )


class UsageCounter(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "usage_counters"

    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_value: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    __table_args__ = (
        ForeignKeyConstraint(
            ["subscription_id", "application_id"],
            ["subscriptions.id", "subscriptions.application_id"],
            ondelete="CASCADE",
            name="fk_usage_counters_subscription_app",
        ),
        ForeignKeyConstraint(
            ["feature_id", "application_id"],
            ["app_features.id", "app_features.application_id"],
            ondelete="RESTRICT",
            name="fk_usage_counters_feature_app",
        ),
        UniqueConstraint(
            "application_id",
            "subscription_id",
            "feature_id",
            "period_start",
            name="uq_usage_counter_period",
        ),
        UniqueConstraint("id", "application_id", name="uq_usage_counters_id_app"),
        CheckConstraint("used_value >= 0", name="usage_counter_nonnegative"),
        CheckConstraint(
            "period_end IS NULL OR period_end > period_start", name="usage_period_ordered"
        ),
    )


class UsageEvent(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "usage_events"

    counter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    delta: Mapped[int] = mapped_column(BigInteger, nullable=False)
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["counter_id", "application_id"],
            ["usage_counters.id", "usage_counters.application_id"],
            ondelete="CASCADE",
            name="fk_usage_events_counter_app",
        ),
        UniqueConstraint(
            "application_id", "idempotency_key", name="uq_usage_events_app_idempotency"
        ),
        CheckConstraint("delta <> 0", name="usage_event_delta_nonzero"),
    )


class Affiliate(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "affiliates"

    company_name: Mapped[str | None] = mapped_column(String(200))
    contact_name: Mapped[str] = mapped_column(String(160), nullable=False)
    mobile_number: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    tax_registration_number: Mapped[str | None] = mapped_column(String(64))
    address: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AffiliateStatus] = mapped_column(
        enum_column(AffiliateStatus, "affiliate_status"),
        nullable=False,
        default=AffiliateStatus.ACTIVE,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("application_id", "email", name="uq_affiliates_app_email"),
        UniqueConstraint("id", "application_id", name="uq_affiliates_id_app"),
    )


class Coupon(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "coupons"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[CouponKind] = mapped_column(enum_column(CouponKind, "coupon_kind"), nullable=False)
    affiliate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    discount_type: Mapped[ValueType] = mapped_column(
        enum_column(ValueType, "discount_value_type"), nullable=False
    )
    discount_value: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    commission_type: Mapped[ValueType | None] = mapped_column(
        enum_column(ValueType, "commission_value_type"), nullable=True
    )
    commission_value: Mapped[Decimal | None] = mapped_column(Numeric(19, 4))
    commission_currency: Mapped[str | None] = mapped_column(String(3))
    currency: Mapped[str | None] = mapped_column(String(3))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    maximum_redemptions: Mapped[int] = mapped_column(Integer, nullable=False)
    per_subscriber_limit: Mapped[int | None] = mapped_column(Integer)
    first_subscription_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    minimum_duration_value: Mapped[int | None] = mapped_column(Integer)
    minimum_duration_unit: Mapped[DurationUnit | None] = mapped_column(
        enum_column(DurationUnit, "coupon_minimum_duration_unit"), nullable=True
    )
    redemption_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[CouponStatus] = mapped_column(
        enum_column(CouponStatus, "coupon_status"), nullable=False
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["affiliate_id", "application_id"],
            ["affiliates.id", "affiliates.application_id"],
            ondelete="RESTRICT",
            name="fk_coupons_affiliate_app",
        ),
        UniqueConstraint("application_id", "code", name="uq_coupons_app_code"),
        UniqueConstraint("id", "application_id", name="uq_coupons_id_app"),
        CheckConstraint("code = upper(code)", name="coupon_code_uppercase"),
        CheckConstraint("discount_value > 0", name="coupon_discount_positive"),
        CheckConstraint("ends_at > starts_at", name="coupon_dates_ordered"),
        CheckConstraint("maximum_redemptions > 0", name="coupon_max_redemptions_positive"),
        CheckConstraint(
            "per_subscriber_limit IS NULL OR per_subscriber_limit > 0",
            name="coupon_per_subscriber_limit_positive",
        ),
        CheckConstraint(
            "(minimum_duration_value IS NULL AND minimum_duration_unit IS NULL) OR "
            "(minimum_duration_value > 0 AND minimum_duration_unit IS NOT NULL)",
            name="coupon_minimum_duration_shape",
        ),
        CheckConstraint(
            "redemption_count >= 0 AND redemption_count <= maximum_redemptions",
            name="coupon_redemption_count_valid",
        ),
        CheckConstraint(
            "(kind = 'promotion' AND affiliate_id IS NULL AND commission_type IS NULL "
            "AND commission_value IS NULL AND commission_currency IS NULL) OR "
            "(kind = 'affiliate' AND affiliate_id IS NOT NULL AND commission_type IS NOT NULL "
            "AND commission_value > 0)",
            name="coupon_affiliate_shape",
        ),
        CheckConstraint(
            "discount_type <> 'percentage' OR discount_value <= 100",
            name="coupon_discount_percentage_max",
        ),
        CheckConstraint(
            "(discount_type = 'percentage' AND currency IS NULL) OR "
            "(discount_type = 'fixed' AND currency IS NOT NULL)",
            name="coupon_discount_currency_shape",
        ),
        CheckConstraint(
            "(commission_type IS NULL AND commission_currency IS NULL) OR "
            "(commission_type = 'percentage' AND commission_currency IS NULL) OR "
            "(commission_type = 'fixed' AND commission_currency IS NOT NULL)",
            name="coupon_commission_currency_shape",
        ),
        CheckConstraint(
            "commission_type <> 'percentage' OR commission_value <= 100",
            name="coupon_commission_percentage_max",
        ),
    )


class CouponPlan(Base):
    __tablename__ = "coupon_plans"

    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="RESTRICT"), primary_key=True
    )
    coupon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["coupon_id", "application_id"],
            ["coupons.id", "coupons.application_id"],
            ondelete="CASCADE",
            name="fk_coupon_plans_coupon_app",
        ),
        ForeignKeyConstraint(
            ["plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="CASCADE",
            name="fk_coupon_plans_plan_app",
        ),
    )


class PaymentTransaction(IdMixin, ApplicationScopedMixin, TimestampMixin, Base):
    __tablename__ = "payment_transactions"

    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_payment_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_order_id: Mapped[str | None] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        enum_column(PaymentStatus, "payment_status"), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["subscription_id", "application_id"],
            ["subscriptions.id", "subscriptions.application_id"],
            ondelete="RESTRICT",
            name="fk_payments_subscription_app",
        ),
        UniqueConstraint(
            "application_id",
            "provider",
            "provider_payment_id",
            name="uq_payments_provider_reference",
        ),
        UniqueConstraint("id", "application_id", name="uq_payment_transactions_id_app"),
        CheckConstraint("amount >= 0", name="payment_amount_nonnegative"),
    )


class CouponRedemption(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "coupon_redemptions"

    coupon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["coupon_id", "application_id"],
            ["coupons.id", "coupons.application_id"],
            ondelete="RESTRICT",
            name="fk_coupon_redemptions_coupon_app",
        ),
        ForeignKeyConstraint(
            ["subscription_id", "application_id"],
            ["subscriptions.id", "subscriptions.application_id"],
            ondelete="RESTRICT",
            name="fk_coupon_redemptions_subscription_app",
        ),
        ForeignKeyConstraint(
            ["payment_id", "application_id"],
            ["payment_transactions.id", "payment_transactions.application_id"],
            ondelete="RESTRICT",
            name="fk_coupon_redemptions_payment_app",
        ),
        UniqueConstraint(
            "application_id", "idempotency_key", name="uq_coupon_redemptions_app_idempotency"
        ),
        UniqueConstraint("id", "application_id", name="uq_coupon_redemptions_id_app"),
        CheckConstraint("discount_amount >= 0", name="redemption_discount_nonnegative"),
    )


class AffiliateCommission(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "affiliate_commissions"

    affiliate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    redemption_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    entry_type: Mapped[CommissionEntryType] = mapped_column(
        enum_column(CommissionEntryType, "commission_entry_type"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reference: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["affiliate_id", "application_id"],
            ["affiliates.id", "affiliates.application_id"],
            ondelete="RESTRICT",
            name="fk_affiliate_commissions_affiliate_app",
        ),
        ForeignKeyConstraint(
            ["redemption_id", "application_id"],
            ["coupon_redemptions.id", "coupon_redemptions.application_id"],
            ondelete="RESTRICT",
            name="fk_affiliate_commissions_redemption_app",
        ),
        UniqueConstraint(
            "application_id", "reference", "entry_type", name="uq_commission_reference_type"
        ),
        CheckConstraint("amount <> 0", name="commission_amount_nonzero"),
    )


class Notification(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "notifications"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    deep_link: Mapped[str | None] = mapped_column(String(2048))
    action_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    audience_type: Mapped[NotificationAudienceType] = mapped_column(
        enum_column(NotificationAudienceType, "notification_audience_type"), nullable=False
    )
    status: Mapped[NotificationStatus] = mapped_column(
        enum_column(NotificationStatus, "notification_status"), nullable=False
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="RESTRICT"), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("id", "application_id", name="uq_notifications_id_app"),
        CheckConstraint(
            "status <> 'scheduled' OR scheduled_at IS NOT NULL",
            name="notification_scheduled_at_required",
        ),
        Index("ix_notifications_app_status", "application_id", "status"),
    )


class NotificationPlanAudience(Base):
    __tablename__ = "notification_plan_audiences"

    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="RESTRICT"), primary_key=True
    )
    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["notification_id", "application_id"],
            ["notifications.id", "notifications.application_id"],
            ondelete="CASCADE",
            name="fk_notification_audience_notification_app",
        ),
        ForeignKeyConstraint(
            ["plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="CASCADE",
            name="fk_notification_audience_plan_app",
        ),
    )


class NotificationDelivery(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "notification_deliveries"

    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    subscriber_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[DeliveryStatus] = mapped_column(
        enum_column(DeliveryStatus, "delivery_status"), nullable=False
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        ForeignKeyConstraint(
            ["notification_id", "application_id"],
            ["notifications.id", "notifications.application_id"],
            ondelete="CASCADE",
            name="fk_notification_deliveries_notification_app",
        ),
        ForeignKeyConstraint(
            ["subscriber_id", "application_id"],
            ["subscribers.id", "subscribers.application_id"],
            ondelete="RESTRICT",
            name="fk_notification_deliveries_subscriber_app",
        ),
        UniqueConstraint(
            "application_id", "idempotency_key", name="uq_notification_delivery_idempotency"
        ),
        UniqueConstraint(
            "application_id",
            "notification_id",
            "subscriber_id",
            name="uq_notification_delivery_recipient",
        ),
        CheckConstraint("attempt_count >= 0", name="delivery_attempt_count_nonnegative"),
    )


class HealthCheck(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "health_checks"

    overall_status: Mapped[HealthStatus] = mapped_column(
        enum_column(HealthStatus, "health_status"), nullable=False
    )
    frontend_status: Mapped[HealthStatus] = mapped_column(
        enum_column(HealthStatus, "frontend_health_status"), nullable=False
    )
    backend_status: Mapped[HealthStatus] = mapped_column(
        enum_column(HealthStatus, "backend_health_status"), nullable=False
    )
    database_status: Mapped[HealthStatus] = mapped_column(
        enum_column(HealthStatus, "database_health_status"), nullable=False
    )
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    dependencies: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    incident_summary: Mapped[str | None] = mapped_column(Text)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("latency_ms IS NULL OR latency_ms >= 0", name="health_latency_nonnegative"),
        Index("ix_health_checks_app_checked", "application_id", "checked_at"),
    )


class AppCredential(IdMixin, ApplicationScopedMixin, TimestampMixin, Base):
    __tablename__ = "app_credentials"

    credential_type: Mapped[str] = mapped_column(String(100), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False)
    secret_hash: Mapped[str | None] = mapped_column(String(255))
    encrypted_secret_reference: Mapped[str | None] = mapped_column(String(1024))
    credential_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[CredentialStatus] = mapped_column(
        enum_column(CredentialStatus, "credential_status"), nullable=False
    )
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    grace_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "application_id",
            "credential_type",
            "credential_version",
            name="uq_app_credential_version",
        ),
        CheckConstraint(
            "(secret_hash IS NOT NULL) <> (encrypted_secret_reference IS NOT NULL)",
            name="credential_one_secret_storage_mode",
        ),
        CheckConstraint("credential_version > 0", name="credential_version_positive"),
    )


class PlanUiConfig(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "plan_ui_configs"

    recommended_plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    show_feature_comparison: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_billing_period_selector: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    display_labels: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        ForeignKeyConstraint(
            ["recommended_plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="RESTRICT",
            name="fk_plan_ui_configs_recommended_plan_app",
        ),
        UniqueConstraint("application_id", name="uq_plan_ui_configs_app"),
        UniqueConstraint("id", "application_id", name="uq_plan_ui_configs_id_app"),
    )


class PlanUiItem(IdMixin, ApplicationScopedMixin, TimestampMixin, Base):
    __tablename__ = "plan_ui_items"

    config_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    display_label: Mapped[str | None] = mapped_column(String(160))

    __table_args__ = (
        ForeignKeyConstraint(
            ["config_id", "application_id"],
            ["plan_ui_configs.id", "plan_ui_configs.application_id"],
            ondelete="CASCADE",
            name="fk_plan_ui_items_config_app",
        ),
        ForeignKeyConstraint(
            ["plan_id", "application_id"],
            ["subscription_plans.id", "subscription_plans.application_id"],
            ondelete="RESTRICT",
            name="fk_plan_ui_items_plan_app",
        ),
        UniqueConstraint("application_id", "config_id", "plan_id", name="uq_plan_ui_item_plan"),
        UniqueConstraint(
            "application_id", "config_id", "display_order", name="uq_plan_ui_item_order"
        ),
        CheckConstraint("display_order >= 0", name="plan_ui_item_order_nonnegative"),
    )


class ReportJob(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "report_jobs"

    report_type: Mapped[str] = mapped_column(String(100), nullable=False)
    output_format: Mapped[str] = mapped_column(String(16), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[ReportStatus] = mapped_column(
        enum_column(ReportStatus, "report_status"), nullable=False, default=ReportStatus.PENDING
    )
    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="RESTRICT"), nullable=False
    )
    result_reference: Mapped[str | None] = mapped_column(String(2048))
    error_code: Mapped[str | None] = mapped_column(String(100))
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_report_jobs_app_status", "application_id", "status"),)


class WebhookEndpoint(IdMixin, ApplicationScopedMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "webhook_endpoints"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    signing_secret_reference: Mapped[str] = mapped_column(String(1024), nullable=False)
    subscribed_events: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("application_id", "name", name="uq_webhook_endpoints_app_name"),
        UniqueConstraint("id", "application_id", name="uq_webhook_endpoints_id_app"),
    )


class WebhookEvent(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "webhook_events"

    event_type: Mapped[str] = mapped_column(String(160), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("application_id", "idempotency_key", name="uq_webhook_event_idempotency"),
        UniqueConstraint("id", "application_id", name="uq_webhook_events_id_app"),
        Index("ix_webhook_events_app_occurred", "application_id", "occurred_at"),
    )


class WebhookDelivery(IdMixin, ApplicationScopedMixin, TimestampMixin, Base):
    __tablename__ = "webhook_deliveries"

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    endpoint_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[WebhookDeliveryStatus] = mapped_column(
        enum_column(WebhookDeliveryStatus, "webhook_delivery_status"),
        nullable=False,
        default=WebhookDeliveryStatus.PENDING,
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response_status: Mapped[int | None] = mapped_column(Integer)
    last_error_code: Mapped[str | None] = mapped_column(String(100))
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        ForeignKeyConstraint(
            ["event_id", "application_id"],
            ["webhook_events.id", "webhook_events.application_id"],
            ondelete="CASCADE",
            name="fk_webhook_deliveries_event_app",
        ),
        ForeignKeyConstraint(
            ["endpoint_id", "application_id"],
            ["webhook_endpoints.id", "webhook_endpoints.application_id"],
            ondelete="RESTRICT",
            name="fk_webhook_deliveries_endpoint_app",
        ),
        UniqueConstraint(
            "application_id", "event_id", "endpoint_id", name="uq_webhook_delivery_target"
        ),
        CheckConstraint("attempt_count >= 0", name="webhook_attempt_count_nonnegative"),
        CheckConstraint(
            "response_status IS NULL OR (response_status >= 100 AND response_status <= 599)",
            name="webhook_response_status_valid",
        ),
        Index("ix_webhook_deliveries_claim", "status", "next_attempt_at", "lease_expires_at"),
    )


class AuditLog(IdMixin, ApplicationScopedMixin, Base):
    __tablename__ = "audit_logs"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("control_users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(160), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(255))
    correlation_id: Mapped[str] = mapped_column(String(100), nullable=False)
    before_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_audit_logs_app_occurred", "application_id", "occurred_at"),
        Index("ix_audit_logs_app_entity", "application_id", "entity_type", "entity_id"),
    )


__all__ = [
    "Affiliate",
    "AffiliateCommission",
    "AppCredential",
    "AppFeature",
    "Application",
    "AuditLog",
    "AuthSession",
    "Base",
    "ControlUser",
    "Coupon",
    "CouponPlan",
    "CouponRedemption",
    "HealthCheck",
    "LoginAttempt",
    "Notification",
    "NotificationDelivery",
    "NotificationPlanAudience",
    "PaymentTransaction",
    "PlanEntitlement",
    "PlanUiConfig",
    "PlanUiItem",
    "ReportJob",
    "Subscriber",
    "Subscription",
    "SubscriptionEvent",
    "SubscriptionPlan",
    "UsageCounter",
    "UsageEvent",
    "UserAppPermission",
    "WebhookDelivery",
    "WebhookEndpoint",
    "WebhookEvent",
]
