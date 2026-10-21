"""App-published feature catalogs and storefront presentation fields for plans."""

import sqlalchemy as sa

from alembic import op

revision = "20261021_0005"
down_revision = "20261020_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("app_features", sa.Column("group_name", sa.String(80)))
    op.add_column(
        "app_features",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "app_features",
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
    )
    op.add_column("app_features", sa.Column("synced_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        op.f("ck_app_features_app_feature_source"), "app_features", "source IN ('manual', 'app')"
    )
    op.add_column("subscription_plans", sa.Column("tagline", sa.String(200)))
    op.add_column("subscription_plans", sa.Column("badge", sa.String(40)))
    op.add_column("subscription_plans", sa.Column("compare_at_price", sa.Numeric(19, 4)))
    op.add_column("subscription_plans", sa.Column("pricing_group", sa.String(100)))
    op.create_check_constraint(
        op.f("ck_subscription_plans_plan_compare_at_above_price"),
        "subscription_plans",
        "compare_at_price IS NULL OR compare_at_price > price",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_subscription_plans_plan_compare_at_above_price"),
        "subscription_plans",
        type_="check",
    )
    for column in ("pricing_group", "compare_at_price", "badge", "tagline"):
        op.drop_column("subscription_plans", column)
    op.drop_constraint(op.f("ck_app_features_app_feature_source"), "app_features", type_="check")
    for column in ("synced_at", "source", "display_order", "group_name"):
        op.drop_column("app_features", column)
