import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.db.models import SubscriptionStatus
from app.domains.subscriptions.schemas import SubscriptionReplaceTerm
from app.domains.subscriptions.service import SubscriptionService


def fixture(action="renew", expired=True, status=SubscriptionStatus.ACTIVE):
    old = SimpleNamespace(
        id=uuid.uuid4(),
        subscriber_id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        version=2,
        ends_at=datetime.now(UTC) + timedelta(days=-1 if expired else 1),
        status=status,
        auto_renews=True,
        cancelled_at=None,
        commercial_snapshot={"price": "500"},
        entitlement_snapshot=[{"enabled": True}],
    )
    payload = SubscriptionReplaceTerm(
        action=action, plan_id=old.plan_id, expected_version=2, reason="Manual approved access"
    )
    db = MagicMock()
    db.scalar = AsyncMock(side_effect=[old, None, old, None])
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    service = SubscriptionService()
    service.create_subscription = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    service._commit_unique = AsyncMock()
    return old, payload, db, service


async def invoke(service, db, old, payload):
    return await service.replace_term(
        db,
        application_id=uuid.uuid4(),
        subscription_id=old.id,
        principal=SimpleNamespace(user=SimpleNamespace(id=uuid.uuid4())),
        payload=payload,
        correlation_id="qa-replacement",
    )


@pytest.mark.parametrize("action,expired", [("renew", True), ("replace", False)])
async def test_new_term_keeps_history_and_one_commit(action, expired):
    old, payload, db, service = fixture(action, expired)
    await invoke(service, db, old, payload)
    assert old.commercial_snapshot == {"price": "500"}
    assert old.entitlement_snapshot == [{"enabled": True}]
    assert old.version == 3
    assert old.auto_renews is False
    assert old.status == (
        SubscriptionStatus.EXPIRED if action == "renew" else SubscriptionStatus.CANCELLED
    )
    assert service.create_subscription.call_args.kwargs["commit"] is False
    service._commit_unique.assert_awaited_once()
    assert len(db.add_all.call_args.args[0]) == 3


@pytest.mark.parametrize("failure", ["stale", "early", "cancelled", "foreign-plan", "another-term"])
async def test_rejected_changes_never_commit(failure):
    old, payload, db, service = fixture()
    if failure == "stale":
        old.version = 3
    elif failure == "early":
        old.ends_at = datetime.now(UTC) + timedelta(days=1)
    elif failure == "cancelled":
        old.status = SubscriptionStatus.CANCELLED
    elif failure == "foreign-plan":
        payload.plan_id = uuid.uuid4()
    else:
        db.scalar = AsyncMock(side_effect=[old, None, old, uuid.uuid4()])
    with pytest.raises(HTTPException):
        await invoke(service, db, old, payload)
    service.create_subscription.assert_not_awaited()
    service._commit_unique.assert_not_awaited()


async def test_unknown_subscription_not_found():
    old, payload, db, service = fixture()
    db.scalar = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as error:
        await invoke(service, db, old, payload)
    assert error.value.status_code == 404
