"""Opt-in real transactions; provider transport is mocked, never charges money."""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.db.models import (
    Application,
    ApplicationEnvironment,
    ControlUser,
    DurationUnit,
    PaymentStatus,
    PaymentTransaction,
    PlanStatus,
    Subscriber,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    UserRole,
)
from app.domains.payments import gateway
from app.domains.payments.schemas import CheckoutCreate, ProviderOrder, ProviderPayment
from app.domains.payments.service import settle_payment, start_checkout
from app.domains.reports.service import net_payment_amount
from app.domains.subscriptions.service import subscription_service

URL = os.getenv("CHARIS_QA_PAYMENT_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="Isolated payment QA database not configured")


@pytest_asyncio.fixture
async def environment(monkeypatch):
    parsed = urlparse(URL)
    assert parsed.hostname == "127.0.0.1" and parsed.path.startswith("/qa_")
    engine = create_async_engine(URL)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    identifier = uuid.uuid4().hex
    async with sessions() as db:
        user = ControlUser(
            id=uuid.uuid4(),
            email=f"qa-{identifier}@example.com",
            password_hash="qa-unusable-hash",
            display_name="QA only",
            role=UserRole.OWNER,
        )
        application = Application(
            id=uuid.uuid4(),
            name="QA Payments",
            slug=f"qa-{identifier}",
            control_api_base_url="https://example.com/control",
            environment=ApplicationEnvironment.STAGING,
        )
        db.add_all([user, application])
        await db.flush()
        subscriber = Subscriber(
            id=uuid.uuid4(),
            application_id=application.id,
            external_id=f"qa-{identifier}",
            name="QA Tenant",
        )
        plan = SubscriptionPlan(
            id=uuid.uuid4(),
            application_id=application.id,
            name="QA Plan",
            code="qa_plan",
            price=Decimal("25.01"),
            currency="INR",
            duration_value=1,
            duration_unit=DurationUnit.MONTH,
            status=PlanStatus.ACTIVE,
            effective_at=datetime.now(UTC) - timedelta(days=1),
            user_limit_unlimited=True,
        )
        db.add_all([subscriber, plan])
        await db.commit()
    settings = Settings(
        _env_file=None,
        razorpay_enabled=True,
        razorpay_key_id="rzp_test_QA",
        razorpay_key_secret="merchant-test-only",
        razorpay_webhook_secret="qa-webhook-secret-long",
    )
    monkeypatch.setattr(gateway, "payment_settings", lambda: settings)
    orders = {}

    async def create(checkout_id, amount, currency):
        order = ProviderOrder(
            id="order_" + uuid.uuid4().hex,
            amount=amount,
            currency=currency,
            receipt=checkout_id,
            notes={"charis_checkout_id": checkout_id},
        )
        orders[order.id] = order
        return order

    async def fetch(order_id):
        return orders[order_id]

    monkeypatch.setattr(gateway, "create_provider_order", create)
    monkeypatch.setattr(gateway, "fetch_order", fetch)
    principal = SimpleNamespace(user=user)
    payload = CheckoutCreate(
        subscriber_id=subscriber.id,
        plan_id=plan.id,
        idempotency_key=uuid.uuid4(),
        reason="QA captured plan test",
    )
    yield SimpleNamespace(
        sessions=sessions,
        app=application,
        user=user,
        subscriber=subscriber,
        plan=plan,
        principal=principal,
        payload=payload,
        orders=orders,
    )
    await engine.dispose()


async def begin(env, payload=None):
    async with env.sessions() as db:
        return await start_checkout(
            db,
            application_id=env.app.id,
            principal=env.principal,
            payload=payload or env.payload,
            correlation_id="qa-razorpay",
        )


def capture(order):
    return ProviderPayment(
        id="pay_" + uuid.uuid4().hex,
        order_id=order.provider_order_id,
        amount=order.amount_minor,
        currency=order.currency,
        status="captured",
        captured=True,
    )


async def settle(env, payment, **kwargs):
    async with env.sessions() as db:
        return await settle_payment(db, payment=payment, **kwargs)


async def test_concurrent_callback_replay_and_refunds(environment):
    env = environment
    checkout = await begin(env)
    repeated = await begin(env)
    assert repeated.id == checkout.id and len(env.orders) == 1
    async with env.sessions() as db:
        pending = await db.get(Subscription, checkout.subscription_id)
        assert pending.status == SubscriptionStatus.PENDING
    payment = capture(checkout)
    with pytest.raises(HTTPException):
        await settle(env, payment.model_copy(update={"captured": False, "status": "authorized"}))
    with pytest.raises(HTTPException):
        await settle(env, payment.model_copy(update={"amount": 100}))
    assert await settle(env, payment, application_id=uuid.uuid4()) is None
    results = await asyncio.gather(*[settle(env, payment) for _ in range(8)])
    assert all(result.status == "paid" for result in results)
    async with env.sessions() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(PaymentTransaction)
            .where(PaymentTransaction.application_id == env.app.id)
        )
        assert count == 1
        subscription = await db.get(Subscription, checkout.subscription_id)
        assert subscription.status == SubscriptionStatus.ACTIVE
        assert subscription.commercial_snapshot["final_price"] == "25.0100"
    partial = await settle(env, payment.model_copy(update={"amount_refunded": 100}))
    assert partial.status == "review"
    async with env.sessions() as db:
        net = await db.scalar(
            select(net_payment_amount()).where(PaymentTransaction.application_id == env.app.id)
        )
        assert net == Decimal("24.01")
    refunded = await settle(
        env, payment.model_copy(update={"amount_refunded": payment.amount, "status": "refunded"})
    )
    assert refunded.status == "refunded"
    await settle(env, payment)  # Out-of-order stale captured notification cannot undo refund.
    async with env.sessions() as db:
        subscription = await db.get(Subscription, checkout.subscription_id)
        ledger = await db.scalar(
            select(PaymentTransaction).where(PaymentTransaction.application_id == env.app.id)
        )
        assert subscription.status == SubscriptionStatus.CANCELLED
        assert ledger.status == PaymentStatus.REFUNDED


async def test_changed_term_is_recorded_for_review_not_overwritten(environment):
    env = environment
    first = await begin(env)
    await settle(env, capture(first))
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        version = previous.version
    payload = env.payload.model_copy(
        update={
            "idempotency_key": uuid.uuid4(),
            "previous_subscription_id": first.subscription_id,
            "previous_version": version,
        }
    )
    replacing = await begin(env, payload)
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        previous.version += 1  # Simulate administrator change during checkout.
        await db.commit()
    result = await settle(env, capture(replacing))
    assert result.status == "review"
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        pending = await db.get(Subscription, replacing.subscription_id)
        assert previous.status == SubscriptionStatus.ACTIVE
        assert pending.status == SubscriptionStatus.PENDING
        version = previous.version
    success_payload = payload.model_copy(
        update={"idempotency_key": uuid.uuid4(), "previous_version": version}
    )
    success = await begin(env, success_payload)
    await settle(env, capture(success))
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        assert previous.status == SubscriptionStatus.CANCELLED
        assert previous.commercial_snapshot["final_price"] == "25.0100"
        assert (
            await db.get(Subscription, success.subscription_id)
        ).status == SubscriptionStatus.ACTIVE


async def test_ambiguous_provider_timeout_recovers_from_signed_order_metadata(
    environment, monkeypatch
):
    env = environment
    original = gateway.create_provider_order

    async def timeout_after_create(*args):
        await original(*args)
        raise HTTPException(status_code=502, detail="QA simulated timeout")

    monkeypatch.setattr(gateway, "create_provider_order", timeout_after_create)
    with pytest.raises(HTTPException):
        await begin(env)
    retry = await begin(env)
    assert retry.status == "creating" and retry.provider_order_id is None and len(env.orders) == 1
    provider_order = next(iter(env.orders.values()))
    payment = ProviderPayment(
        id="pay_" + uuid.uuid4().hex,
        order_id=provider_order.id,
        amount=provider_order.amount,
        currency=provider_order.currency,
        status="captured",
        captured=True,
    )
    result = await settle(env, payment)
    assert result.status == "paid" and result.provider_order_id == provider_order.id


async def test_failure_before_commit_restores_previous_term(environment, monkeypatch):
    env = environment
    first = await begin(env)
    await settle(env, capture(first))
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        version = previous.version
    from app.domains.subscriptions.schemas import SubscriptionReplaceTerm

    async def failed_snapshot(*args, **kwargs):
        raise HTTPException(status_code=422, detail="QA invalid replacement plan")

    monkeypatch.setattr(subscription_service, "create_subscription", failed_snapshot)
    with pytest.raises(HTTPException):
        async with env.sessions() as db:
            await subscription_service.replace_term(
                db,
                application_id=env.app.id,
                subscription_id=first.subscription_id,
                principal=env.principal,
                payload=SubscriptionReplaceTerm(
                    action="replace",
                    plan_id=uuid.uuid4(),
                    expected_version=version,
                    reason="QA rollback test",
                ),
                correlation_id="qa",
            )
    async with env.sessions() as db:
        previous = await db.get(Subscription, first.subscription_id)
        assert previous.status == SubscriptionStatus.ACTIVE and previous.version == version


async def test_test_keys_cannot_grant_production_app_access(environment):
    env = environment
    async with env.sessions() as db:
        application = await db.get(Application, env.app.id)
        application.environment = ApplicationEnvironment.PRODUCTION
        await db.commit()
    with pytest.raises(HTTPException) as error:
        await begin(env)
    assert error.value.status_code == 409
    assert len(env.orders) == 0


async def test_idempotency_key_cannot_change_plan_or_reason(environment):
    env = environment
    first = await begin(env)
    with pytest.raises(HTTPException) as error:
        await begin(env, env.payload.model_copy(update={"reason": "Different billing request"}))
    assert error.value.status_code == 409 and len(env.orders) == 1
    async with env.sessions() as db:
        pending = await db.get(Subscription, first.subscription_id)
        assert pending.status == SubscriptionStatus.PENDING
