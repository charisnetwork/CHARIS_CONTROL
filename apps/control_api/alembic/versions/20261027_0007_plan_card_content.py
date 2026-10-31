"""Plan card content: highlight lines, preset artwork/accent and an advertised offer coupon."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "20261027_0007"
down_revision = "20261021_0006"
branch_labels = None
depends_on = None

ARTWORK = (
    "'auto', 'none', 'rocket', 'crown', 'gem', 'leaf', 'shield', 'building', 'sparkles', 'gift'"
)
ACCENT = "'auto', 'blue', 'violet', 'emerald', 'amber', 'rose', 'slate'"


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column(
            "highlights", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
    )
    op.add_column(
        "subscription_plans",
        sa.Column("artwork", sa.String(32), nullable=False, server_default="auto"),
    )
    op.add_column(
        "subscription_plans",
        sa.Column("accent", sa.String(16), nullable=False, server_default="auto"),
    )
    op.add_column("subscription_plans", sa.Column("offer_coupon_id", postgresql.UUID(as_uuid=True)))
    op.create_check_constraint(
        op.f("ck_subscription_plans_plan_highlights_array"),
        "subscription_plans",
        "jsonb_typeof(highlights) = 'array' AND jsonb_array_length(highlights) <= 12",
    )
    op.create_check_constraint(
        op.f("ck_subscription_plans_plan_artwork_preset"),
        "subscription_plans",
        f"artwork IN ({ARTWORK})",
    )
    op.create_check_constraint(
        op.f("ck_subscription_plans_plan_accent_preset"),
        "subscription_plans",
        f"accent IN ({ACCENT})",
    )
    op.create_foreign_key(
        "fk_subscription_plans_offer_coupon_app",
        "subscription_plans",
        "coupons",
        ["offer_coupon_id", "application_id"],
        ["id", "application_id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_subscription_plans_offer_coupon",
        "subscription_plans",
        ["offer_coupon_id"],
        postgresql_where=sa.text("offer_coupon_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_plans_offer_coupon", table_name="subscription_plans")
    op.drop_constraint(
        "fk_subscription_plans_offer_coupon_app", "subscription_plans", type_="foreignkey"
    )
    for name in ("plan_accent_preset", "plan_artwork_preset", "plan_highlights_array"):
        op.drop_constraint(
            op.f(f"ck_subscription_plans_{name}"), "subscription_plans", type_="check"
        )
    for column in ("offer_coupon_id", "accent", "artwork", "highlights"):
        op.drop_column("subscription_plans", column)
