from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.domains.notifications.schemas import NotificationCreate
from app.domains.notifications.service import locked_notification_statement


def test_notification_audience_shape_is_strict() -> None:
    with pytest.raises(ValidationError):
        NotificationCreate(
            title="Hello",
            message="Welcome",
            audience_type="plans",
            plan_ids=[],
        )
    plan_id = uuid.uuid4()
    payload = NotificationCreate(
        title="Hello",
        message="Welcome",
        audience_type="plans",
        plan_ids=[plan_id],
    )
    assert payload.plan_ids == [plan_id]


def test_notification_schedule_requires_timezone_and_deep_links_are_relative() -> None:
    with pytest.raises(ValidationError):
        NotificationCreate(
            title="Unsafe",
            message="Do not redirect",
            deep_link="https://attacker.example/phish",
            audience_type="all_subscribers",
        )
    scheduled = NotificationCreate(
        title="Renewal",
        message="Your renewal is due",
        deep_link="/settings/subscription",
        audience_type="all_subscribers",
        status="scheduled",
        scheduled_at=datetime.now(UTC) + timedelta(hours=1),
    )
    assert scheduled.scheduled_at is not None


def test_notification_dispatch_lock_is_application_scoped() -> None:
    application_id = uuid.uuid4()
    notification_id = uuid.uuid4()
    statement = locked_notification_statement(application_id, notification_id)
    sql = str(
        statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )
    assert "FOR UPDATE" in sql
    assert str(application_id) in sql
    assert str(notification_id) in sql
