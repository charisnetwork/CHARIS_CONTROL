"""Payment provider and billing country on subscriptions; office country on subscribers."""

import sqlalchemy as sa

from alembic import op

revision = "20261119_0010"
down_revision = "20261113_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscribers", sa.Column("billing_country", sa.String(length=2), nullable=True))
    op.add_column(
        "subscriptions",
        sa.Column(
            "payment_provider", sa.String(length=32), nullable=False, server_default="razorpay"
        ),
    )
    op.add_column("subscriptions", sa.Column("billing_country", sa.String(length=2), nullable=True))


def downgrade() -> None:
    op.drop_column("subscriptions", "billing_country")
    op.drop_column("subscriptions", "payment_provider")
    op.drop_column("subscribers", "billing_country")
