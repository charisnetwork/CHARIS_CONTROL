"""Persist quoted Razorpay checkout intents independently of provider callbacks."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261013_0002"
down_revision: str | None = "20260910_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

metadata = sa.MetaData(
    naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)
checkout = sa.Table(
    "razorpay_checkouts",
    metadata,
    sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column(
        "application_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("applications.id", ondelete="RESTRICT"),
        nullable=False,
    ),
    sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column("previous_subscription_id", postgresql.UUID(as_uuid=True)),
    sa.Column("previous_version", sa.Integer()),
    sa.Column("idempotency_key", sa.String(100), nullable=False),
    sa.Column("provider_order_id", sa.String(100), unique=True),
    sa.Column("provider_payment_id", sa.String(100), unique=True),
    sa.Column("amount_minor", sa.BigInteger(), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("status", sa.String(20), nullable=False),
    sa.Column(
        "requested_by",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("control_users.id", ondelete="RESTRICT"),
        nullable=False,
    ),
    sa.Column("reason", sa.String(500), nullable=False),
    sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.Column(
        "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    ),
    sa.ForeignKeyConstraint(
        ["subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="RESTRICT",
    ),
    sa.ForeignKeyConstraint(
        ["previous_subscription_id", "application_id"],
        ["subscriptions.id", "subscriptions.application_id"],
        ondelete="RESTRICT",
    ),
    sa.UniqueConstraint("application_id", "idempotency_key", name="uq_razorpay_checkout_key"),
    sa.CheckConstraint("amount_minor >= 100", name="razorpay_checkout_minimum"),
    sa.CheckConstraint(
        "status IN ('creating', 'ready', 'paid', 'review', 'refunded')",
        name="razorpay_checkout_status",
    ),
    sa.Index("ix_razorpay_checkout_app_created", "application_id", "created_at"),
)


def upgrade() -> None:
    # Freeze this revision; never import evolving application models.
    for table_name in ("applications", "control_users", "subscriptions"):
        sa.Table(
            table_name,
            metadata,
            sa.Column("id", postgresql.UUID(as_uuid=True)),
            sa.Column("application_id", postgresql.UUID(as_uuid=True)),
            extend_existing=True,
        )
    checkout.create(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    op.drop_table("razorpay_checkouts")
