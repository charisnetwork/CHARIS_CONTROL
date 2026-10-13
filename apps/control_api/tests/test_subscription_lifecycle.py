from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.db.models import SubscriptionStatus
from app.domains.subscriptions.schemas import SubscriptionTransition
from app.domains.subscriptions.service import transition_target


@pytest.mark.parametrize(
    "current,action,target",
    [
        ("active", "suspend", "suspended"),
        ("suspended", "resume", "active"),
        ("active", "cancel", "cancelled"),
        ("suspended", "cancel", "cancelled"),
    ],
)
def test_valid_transitions(current: str, action: str, target: str) -> None:
    now = datetime.now(UTC)
    assert (
        transition_target(SubscriptionStatus(current), action, now + timedelta(days=1), now).value
        == target
    )


@pytest.mark.parametrize(
    "current,action",
    [
        ("cancelled", "resume"),
        ("expired", "resume"),
        ("pending", "suspend"),
        ("active", "resume"),
        ("suspended", "suspend"),
        ("active", "upgrade"),
    ],
)
def test_invalid_transitions(current: str, action: str) -> None:
    with pytest.raises(HTTPException) as error:
        transition_target(SubscriptionStatus(current), action, None, datetime.now(UTC))
    assert error.value.status_code == 409


def test_expiry_cannot_be_bypassed() -> None:
    now = datetime.now(UTC)
    with pytest.raises(HTTPException):
        transition_target(SubscriptionStatus.SUSPENDED, "resume", now, now)
    assert (
        transition_target(SubscriptionStatus.ACTIVE, "cancel", now, now)
        == SubscriptionStatus.CANCELLED
    )


def test_payload_validation() -> None:
    with pytest.raises(ValidationError):
        SubscriptionTransition(action="resume", expected_version=0, reason="     ")
