from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.dialects import postgresql

from app.domains.subscriptions.service import (
    locked_counter_statement,
    locked_subscription_statement,
)


def compile_postgres(statement) -> str:
    return str(
        statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )


def test_usage_locks_subscription_and_counter_inside_application_scope() -> None:
    application_id = uuid.uuid4()
    subscription_id = uuid.uuid4()
    feature_id = uuid.uuid4()
    period_start = datetime(2026, 9, 1, tzinfo=UTC)

    subscription_sql = compile_postgres(
        locked_subscription_statement(application_id, subscription_id)
    )
    counter_sql = compile_postgres(
        locked_counter_statement(application_id, subscription_id, feature_id, period_start)
    )

    assert "FOR UPDATE" in subscription_sql
    assert "FOR UPDATE" in counter_sql
    assert str(application_id) in subscription_sql
    assert str(application_id) in counter_sql
    assert str(subscription_id) in subscription_sql
    assert str(subscription_id) in counter_sql
