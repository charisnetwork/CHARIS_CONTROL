"""Limit periods: per 3 months (calendar quarter) and per 6 months (calendar half-year)."""

from alembic import op

revision = "20261111_0008"
down_revision = "20261027_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New enum values cannot be used in the transaction that adds them, so add them on their own.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE reset_period ADD VALUE IF NOT EXISTS 'quarterly' AFTER 'monthly'")
        op.execute(
            "ALTER TYPE reset_period ADD VALUE IF NOT EXISTS 'half_yearly' AFTER 'quarterly'"
        )


def downgrade() -> None:
    # PostgreSQL cannot drop enum values; rows using them would have to be rewritten first.
    pass
