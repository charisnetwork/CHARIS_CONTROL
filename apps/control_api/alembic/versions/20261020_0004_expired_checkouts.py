"""Allow abandoned customer checkouts to expire and release their coupon reservation."""

from alembic import op

revision = "20261020_0004"
down_revision = "20261020_0003"
branch_labels = None
depends_on = None

NAME = "ck_razorpay_checkouts_razorpay_checkout_status"


def upgrade() -> None:
    op.drop_constraint(op.f(NAME), "razorpay_checkouts", type_="check")
    op.create_check_constraint(
        op.f(NAME),
        "razorpay_checkouts",
        "status IN ('creating', 'ready', 'paid', 'review', 'refunded', 'expired')",
    )


def downgrade() -> None:
    # Refuses to run while expired checkouts exist, rather than rewriting their history.
    op.drop_constraint(op.f(NAME), "razorpay_checkouts", type_="check")
    op.create_check_constraint(
        op.f(NAME),
        "razorpay_checkouts",
        "status IN ('creating', 'ready', 'paid', 'review', 'refunded')",
    )
