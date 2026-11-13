"""Monitoring: security events reported by apps and the alerts the monitor raises."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261113_0009"
down_revision = "20261111_0008"
branch_labels = None
depends_on = None


def _app_id() -> sa.Column:
    return sa.Column(
        "application_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("applications.id", ondelete="RESTRICT"),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "security_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _app_id(),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("tenant_id", sa.String(255)),
        sa.Column("actor_ref", sa.String(255)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("path", sa.String(255)),
        sa.Column(
            "detail", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_security_events_app_occurred", "security_events", ["application_id", "occurred_at"]
    )
    op.create_index(
        "ix_security_events_app_type",
        "security_events",
        ["application_id", "event_type", "occurred_at"],
    )
    op.create_index(
        "ix_security_events_app_ip",
        "security_events",
        ["application_id", "ip_address", "occurred_at"],
    )
    op.create_table(
        "monitor_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _app_id(),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("dedupe_key", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column(
            "detail", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("occurrences", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "acknowledged_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("control_users.id", ondelete="SET NULL"),
        ),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('open', 'acknowledged', 'resolved')", name="monitor_alert_status"
        ),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')", name="monitor_alert_severity"
        ),
    )
    op.create_index(
        "uq_monitor_alerts_open_key",
        "monitor_alerts",
        ["application_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("status <> 'resolved'"),
    )
    op.create_index(
        "ix_monitor_alerts_app_seen", "monitor_alerts", ["application_id", "last_seen_at"]
    )


def downgrade() -> None:
    op.drop_table("monitor_alerts")
    op.drop_table("security_events")
