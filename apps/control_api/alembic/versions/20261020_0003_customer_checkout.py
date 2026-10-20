"""Attribute customer checkouts without manufacturing a Control OS administrator."""

import sqlalchemy as sa

from alembic import op

revision = "20261020_0003"
down_revision = "20261013_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("razorpay_checkouts", sa.Column("external_actor_id", sa.String(255)))
    op.alter_column("razorpay_checkouts", "requested_by", nullable=True)
    op.create_check_constraint(
        op.f("ck_razorpay_checkouts_checkout_has_actor"),
        "razorpay_checkouts",
        "requested_by IS NOT NULL OR external_actor_id IS NOT NULL",
    )


def downgrade() -> None:
    # Refuse destructive downgrade once customer-attributed orders exist.
    op.alter_column("razorpay_checkouts", "requested_by", nullable=False)
    op.drop_constraint(
        op.f("ck_razorpay_checkouts_checkout_has_actor"), "razorpay_checkouts", type_="check"
    )
    op.drop_column("razorpay_checkouts", "external_actor_id")
