"""Giving a plan's newer features to existing customers: only ever adds, chosen customers only."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from test_razorpay_postgres import URL, environment, pytestmark as _db  # noqa: F401

from app.db.models import (
    AppFeature,
    AuditLog,
    LimitType,
    PlanEntitlement,
    Subscriber,
    Subscription,
    SubscriptionEvent,
    SubscriptionStatus,
)
from app.domains.entitlements.schemas import EntitlementSnapshot
from app.domains.subscriptions.feature_rollout import feature_rollout_service, upgrade


def grant(code="staff", **fields):
    return EntitlementSnapshot(feature_code=code, **{"enabled": True, **fields})


def test_upgrade_only_ever_adds():
    unlimited = grant(limit_type="unlimited")
    five = grant(limit_type="limited", limit_value=5, unit="staff", reset_period="monthly")
    ten = grant(limit_type="limited", limit_value=10, unit="staff", reset_period="monthly")
    held = lambda g: g.model_dump(mode="json")  # noqa: E731
    assert upgrade(None, unlimited) == "add"
    assert upgrade({"feature_code": "staff", "enabled": False}, five) == "add"
    assert upgrade(held(five), ten) == "raise"
    assert upgrade(held(five), unlimited) == "raise"
    assert upgrade(held(ten), five) is None, "never lowers a limit"
    assert upgrade(held(unlimited), ten) is None
    assert upgrade(held(five), grant(enabled=False)) is None, "switching off never removes"
    other_period = grant(limit_type="limited", limit_value=50, unit="staff", reset_period="yearly")
    assert upgrade(held(five), other_period) is None, "different counting is not compared"


@pytest.mark.skipif(not URL, reason="Isolated payment QA database not configured")
async def test_chosen_customers_get_chosen_features_and_nothing_is_taken(environment):  # noqa: F811
    env = environment
    now = datetime.now(UTC)
    async with env.sessions() as db:
        features = {
            code: AppFeature(
                id=uuid.uuid4(), application_id=env.app.id, code=code, name=code.title()
            )
            for code in ("invoices", "staff", "old_extra")
        }
        db.add_all(features.values())
        await db.flush()
        # The plan today: invoices raised to 500, staff newly added, old_extra switched off.
        db.add_all(
            [
                PlanEntitlement(
                    id=uuid.uuid4(), application_id=env.app.id, plan_id=env.plan.id,
                    feature_id=features["invoices"].id, enabled=True,
                    limit_type=LimitType.LIMITED, limit_value=500, unit="invoices",
                    reset_period="monthly",
                ),
                PlanEntitlement(
                    id=uuid.uuid4(), application_id=env.app.id, plan_id=env.plan.id,
                    feature_id=features["staff"].id, enabled=True, limit_type=LimitType.UNLIMITED,
                ),
                PlanEntitlement(
                    id=uuid.uuid4(), application_id=env.app.id, plan_id=env.plan.id,
                    feature_id=features["old_extra"].id, enabled=False,
                ),
            ]
        )
        sold_with = [
            {"feature_code": "invoices", "enabled": True, "limit_type": "limited",
             "limit_value": 100, "unit": "invoices", "reset_period": "monthly"},
            {"feature_code": "old_extra", "enabled": True, "limit_type": "unlimited"},
        ]
        customers = []
        for index in range(3):
            subscriber = Subscriber(
                id=uuid.uuid4(), application_id=env.app.id,
                external_id=f"rollout-{uuid.uuid4().hex}", name=f"QA Shop {index}",
            )
            db.add(subscriber)
            await db.flush()
            subscription = Subscription(
                id=uuid.uuid4(), application_id=env.app.id, subscriber_id=subscriber.id,
                plan_id=env.plan.id, status=SubscriptionStatus.ACTIVE,
                starts_at=now - timedelta(days=3), ends_at=now + timedelta(days=27),
                commercial_snapshot={}, entitlement_snapshot=list(sold_with),
            )
            db.add(subscription)
            customers.append(subscription)
        await db.commit()

    async with env.sessions() as db:
        preview = await feature_rollout_service.preview(
            db, application_id=env.app.id, plan_id=env.plan.id
        )
    rows = {row["subscription_id"]: row for row in preview["subscribers"]}
    assert set(rows) >= {c.id for c in customers}
    changes = {c["feature_code"]: c["change"] for c in rows[customers[0].id]["changes"]}
    assert changes == {"invoices": "raise", "staff": "add"}, "old_extra is off: not offered"

    async with env.sessions() as db:
        result = await feature_rollout_service.apply(
            db, application_id=env.app.id, plan_id=env.plan.id, principal=env.principal,
            subscription_ids=[customers[0].id, customers[1].id], feature_codes=["staff"],
            correlation_id="qa-rollout",
        )
    assert result == {"updated_subscriptions": 2, "features_added": 2}

    async with env.sessions() as db:
        got = {s.id: s for s in (await db.scalars(
            select(Subscription).where(Subscription.id.in_([c.id for c in customers]))
        )).all()}
        held = {
            sid: {item["feature_code"]: item for item in s.entitlement_snapshot}
            for sid, s in got.items()
        }
        assert held[customers[0].id]["staff"]["limit_type"] == "unlimited"
        assert held[customers[0].id]["invoices"]["limit_value"] == 100, "only chosen features"
        assert held[customers[0].id]["old_extra"]["enabled"] is True, "nothing taken away"
        assert "staff" not in held[customers[2].id], "customers not chosen are untouched"
        events = (await db.scalars(select(SubscriptionEvent).where(
            SubscriptionEvent.subscription_id == customers[0].id,
            SubscriptionEvent.event_type == "subscription.features_added",
        ))).all()
        assert len(events) == 1
        assert (await db.scalars(select(AuditLog).where(
            AuditLog.correlation_id == "qa-rollout"
        ))).all()

    async with env.sessions() as db:
        again = await feature_rollout_service.apply(
            db, application_id=env.app.id, plan_id=env.plan.id, principal=env.principal,
            subscription_ids=[customers[0].id], feature_codes=["staff", "invoices"],
            correlation_id="qa-rollout-2",
        )
    assert again == {"updated_subscriptions": 1, "features_added": 1}, "staff already there"

    async with env.sessions() as db:
        with pytest.raises(HTTPException) as switched_off:
            await feature_rollout_service.apply(
                db, application_id=env.app.id, plan_id=env.plan.id, principal=env.principal,
                subscription_ids=[customers[2].id], feature_codes=["old_extra"],
                correlation_id="qa-rollout-3",
            )
        assert switched_off.value.status_code == 422
    async with env.sessions() as db:
        with pytest.raises(HTTPException) as stranger:
            await feature_rollout_service.apply(
                db, application_id=env.app.id, plan_id=env.plan.id, principal=env.principal,
                subscription_ids=[uuid.uuid4()], feature_codes=["staff"],
                correlation_id="qa-rollout-4",
            )
        assert stranger.value.status_code == 409
