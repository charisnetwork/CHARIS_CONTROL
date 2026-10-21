"""Opt-in real-database tests: read-only user directory, owner profile sync and restriction."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from test_feature_catalog_postgres import client_for
from test_razorpay_postgres import URL, environment, pytestmark  # noqa: F401  (shared fixture)

from app.db.models import (
    Affiliate,
    Coupon,
    CouponKind,
    CouponRedemption,
    CouponStatus,
    PaymentStatus,
    PaymentTransaction,
    Subscriber,
    Subscription,
    SubscriptionStatus,
    ValueType,
)
from app.domains.users.service import user_directory_service

PROFILE = {
    "name": "Kerala Builders",
    "email": "owner@example.com",
    "mobile_number": "+91-98470 12345",
    "owner": {
        "user_id": "user-1",
        "name": "Anu Thomas",
        "gender": "female",
        "date_of_birth": "1990-04-02",
    },
    "location": "Kochi, KL",
    "team_size": 7,
    "joined_at": "2026-01-05T10:00:00Z",
    "last_active_at": "2026-10-20T09:30:00Z",
}


async def seed_paid_term(env):
    """An active monthly term bought with an affiliate coupon, paid with one partial refund."""
    now = datetime.now(UTC)
    async with env.sessions() as db:
        affiliate = Affiliate(
            id=uuid.uuid4(),
            application_id=env.app.id,
            contact_name="Ravi",
            company_name="Ravi Partners",
            email=f"ravi-{uuid.uuid4().hex}@example.com",
        )
        db.add(affiliate)
        await db.flush()
        coupon = Coupon(
            id=uuid.uuid4(),
            application_id=env.app.id,
            name="Ravi launch",
            code=f"RAVI{uuid.uuid4().hex[:6].upper()}",
            kind=CouponKind.AFFILIATE,
            affiliate_id=affiliate.id,
            discount_type=ValueType.PERCENTAGE,
            discount_value=Decimal(10),
            commission_type=ValueType.PERCENTAGE,
            commission_value=Decimal(5),
            starts_at=now - timedelta(days=5),
            ends_at=now + timedelta(days=5),
            maximum_redemptions=10,
            status=CouponStatus.ACTIVE,
        )
        subscription = Subscription(
            id=uuid.uuid4(),
            application_id=env.app.id,
            subscriber_id=env.subscriber.id,
            plan_id=env.plan.id,
            status=SubscriptionStatus.ACTIVE,
            starts_at=now - timedelta(days=2),
            ends_at=now + timedelta(days=28),
            commercial_snapshot={
                "plan_name": "QA Plan",
                "price": "25.01",
                "final_price": "22.51",
                "currency": "INR",
                "duration_value": 1,
                "duration_unit": "month",
            },
            entitlement_snapshot=[],
        )
        db.add_all([coupon, subscription])
        await db.flush()
        payment = PaymentTransaction(
            id=uuid.uuid4(),
            application_id=env.app.id,
            subscription_id=subscription.id,
            provider="razorpay",
            provider_payment_id="pay_" + uuid.uuid4().hex,
            amount=Decimal("22.51"),
            currency="INR",
            status=PaymentStatus.PARTIALLY_REFUNDED,
            paid_at=now - timedelta(days=2),
            metadata_json={"amount_refunded_minor": 251},
        )
        db.add(payment)
        await db.flush()
        db.add(
            CouponRedemption(
                application_id=env.app.id,
                coupon_id=coupon.id,
                subscription_id=subscription.id,
                payment_id=payment.id,
                idempotency_key=uuid.uuid4().hex,
                discount_amount=Decimal("2.50"),
                currency="INR",
            )
        )
        await db.commit()
    return affiliate


async def listing(env, **filters):
    defaults = {"query": None, "access": None, "plan_id": None, "coupon": None}
    defaults |= {"affiliate_id": None, "limit": 50, "offset": 0}
    async with env.sessions() as db:
        return await user_directory_service.list_users(
            db, application_id=env.app.id, **(defaults | filters)
        )


async def test_owner_profile_sync_keeps_fields_older_apps_do_not_send(environment):  # noqa: F811
    env = environment
    path = f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}"
    async with client_for(env) as client:
        assert (await client.put(path, json=PROFILE)).status_code == 200
        # An app that predates the owner profile sends only the three original fields.
        legacy = {"name": "Kerala Builders Pvt", "email": None, "mobile_number": "+919847012345"}
        assert (await client.put(path, json=legacy)).status_code == 200
        assert (await client.put(path, json={**legacy, "owner": {"x": 1}})).status_code == 422
    async with env.sessions() as db:
        subscriber = await db.get(Subscriber, env.subscriber.id)
    assert subscriber.name == "Kerala Builders Pvt" and subscriber.email is None
    assert (subscriber.contact_name, subscriber.gender) == ("Anu Thomas", "female")
    assert str(subscriber.date_of_birth) == "1990-04-02" and subscriber.team_size == 7
    assert subscriber.location == "Kochi, KL" and subscriber.profile_synced_at is not None


async def test_directory_shows_plan_coupon_affiliate_and_net_paid(environment):  # noqa: F811
    env = environment
    async with client_for(env) as client:
        path = f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}"
        assert (await client.put(path, json=PROFILE)).status_code == 200
    affiliate = await seed_paid_term(env)

    page = await listing(env)
    assert page.total == 1
    row = page.items[0]
    assert row.access == "active" and row.inactive_since is None
    assert row.contact_name == "Anu Thomas" and row.business_name == "Kerala Builders"
    assert row.subscription.billing == "Monthly" and row.subscription.price == Decimal("22.51")
    assert row.subscription.coupon.affiliate_name == "Ravi Partners"
    assert row.total_paid == Decimal("20.0000")  # 22.51 paid, 2.51 refunded

    # Search by name, email, spaced mobile digits, app user id and OS id.
    for query in ("anu", "OWNER@example", "98470 12345", "user-1", str(row.id)):
        assert (await listing(env, query=query)).total == 1, query
    assert (await listing(env, query="nobody%")).total == 0
    assert (await listing(env, access="active", plan_id=env.plan.id)).total == 1
    assert (await listing(env, coupon="used", affiliate_id=affiliate.id)).total == 1
    assert (await listing(env, coupon="none")).total == 0
    assert (await listing(env, access="no_plan")).total == 0

    async with env.sessions() as db:
        detail = await user_directory_service.get_user(
            db, application_id=env.app.id, user_id=row.id
        )
    assert len(detail.subscriptions) == 1 and detail.payments[0].net_amount == Decimal("20.0000")


async def test_restriction_blocks_account_and_can_be_restored(environment):  # noqa: F811
    env = environment
    await seed_paid_term(env)
    snapshot_path = (
        f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}/subscription"
    )

    async def restrict(flag):
        async with env.sessions() as db:
            return await user_directory_service.set_restriction(
                db,
                application_id=env.app.id,
                user_id=env.subscriber.id,
                principal=env.principal,
                restrict=flag,
                reason="Repeated abuse of invoice API",
                correlation_id=str(uuid.uuid4()),
            )

    restricted = await restrict(True)
    assert restricted.access == "restricted" and restricted.inactive_since is not None
    with pytest.raises(HTTPException) as again:
        await restrict(True)
    assert again.value.status_code == 409
    async with client_for(env) as client:
        snapshot = (await client.get(snapshot_path)).json()
        assert snapshot["restricted"] is True and snapshot["status"] == "suspended"
    assert (await listing(env, access="restricted")).total == 1

    restored = await restrict(False)
    assert restored.access == "active" and restored.restriction_reason is None
    async with client_for(env) as client:
        snapshot = (await client.get(snapshot_path)).json()
        assert snapshot["restricted"] is False and snapshot["status"] == "active"
