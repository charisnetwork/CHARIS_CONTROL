"""Read-only owner profile and operator restriction fields for app users."""

import sqlalchemy as sa

from alembic import op

revision = "20261021_0006"
down_revision = "20261021_0005"
branch_labels = None
depends_on = None

COLUMNS = (
    ("contact_name", sa.String(160)),
    ("contact_user_id", sa.String(255)),
    ("gender", sa.String(32)),
    ("date_of_birth", sa.Date()),
    ("location", sa.String(200)),
    ("team_size", sa.Integer()),
    ("joined_at", sa.DateTime(timezone=True)),
    ("last_active_at", sa.DateTime(timezone=True)),
    ("profile_synced_at", sa.DateTime(timezone=True)),
    ("restricted_at", sa.DateTime(timezone=True)),
    ("restriction_reason", sa.Text()),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("subscribers", sa.Column(name, type_))
    op.create_index(
        "ix_subscribers_app_mobile", "subscribers", ["application_id", "mobile_number"]
    )


def downgrade() -> None:
    op.drop_index("ix_subscribers_app_mobile", table_name="subscribers")
    for name, _ in reversed(COLUMNS):
        op.drop_column("subscribers", name)
