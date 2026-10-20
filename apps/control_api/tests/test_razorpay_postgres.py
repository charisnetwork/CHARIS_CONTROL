"""Opt-in real transactions; provider transport is mocked, never charges money."""

import asyncio
import hashlib
import hmac
import os
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.dependencies import require_integration_credential
from app.core.config import Settings
from app.db.models import (
    Application,
    ApplicationEnvironment,
    ControlUser,
    DurationUnit,
    PaymentStatus,
    PaymentTransaction,
    PlanStatus,
    PlanUiConfig,
    PlanUiItem,
    RazorpayCheckout,
    Subscriber,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    UserRole,
)
from app.db.session import get_db_session
from app.domains.payments import gateway
from app.domains.payments.integration import router as customer_router
from app.domains.payments.schemas import CheckoutCreate, ProviderOrder, ProviderPayment
from app.domains.payments.service import settle_payment, start_checkout
from app.domains.reports.service import net_payment_amount
from app.domains.subscriptions.integration import router as subscription_router
from app.domains.subscriptions.schemas import SubscriptionCreate
from app.domains.subscriptions.service import subscription_service

URL = os.getenv("CHARIS_QA_PAYMENT_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="Isolated payment QA database not configured")


async def test_customer_purchase_activates_without_os_admin_and_is_tenant_scoped(
    environment, monkeypatch
):
    env = environment
    async with env.sessions() as db:
        config = PlanUiConfig(application_id=env.app.id)
        db.add(config)
        await db.flush()
        db.add(
            PlanUiItem(
                application_id=env.app.id,
                config_id=config.id,
                plan_id=env.plan.id,
                visible=True,
                display_order=0,
            )
        )
        other = Subscriber(
            application_id=env.app.id,
            external_id="another-" + uuid.uuid4().hex,
            name="Other company",
        )
        db.add(other)
        await db.commit()
    app = FastAPI()
    app.include_router(customer_router)
    app.include_router(subscription_router)

    async def session():
        async with env.sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=env.app.id
    )
    path = f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}"
    other_path = f"/integrations/apps/{env.app.id}/tenants/{other.external_id}"
    payload = {
        "plan_id": str(env.plan.id),
        "idempotency_key": str(uuid.uuid4()),
        "actor_id": "civil-owner-123",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (
            await client.post(path + "/checkout/orders", json={**payload, "amount": 1})
        ).status_code == 422
        assert (
            await client.post(
                path + "/checkout/orders", json={**payload, "plan_id": str(uuid.uuid4())}
            )
        ).status_code == 404
        responses = await asyncio.gather(
            *(client.post(path + "/checkout/orders", json=payload) for _ in range(5))
        )
        assert all(r.status_code == 201 for r in responses)
        checkout = responses[0].json()["checkout"]
        assert len({r.json()["checkout"]["id"] for r in responses}) == 1
        assert len(env.orders) == 1
        async with env.sessions() as db:
            saved = await db.get(RazorpayCheckout, uuid.UUID(checkout["id"]))
            assert saved.requested_by is None and saved.external_actor_id == "civil-owner-123"
            assert (
                await db.get(Subscription, saved.subscription_id)
            ).status == SubscriptionStatus.PENDING
        assert (await client.get(path + "/subscription")).json()["status"] == "unassigned"
        assert (
            await client.post(
                path + "/checkout/orders", json={**payload, "idempotency_key": str(uuid.uuid4())}
            )
        ).status_code == 409
        assert (await client.get(other_path + "/checkout")).json()["checkouts"] == []
        payment = capture(saved)
        signature = hmac.new(
            b"merchant-test-only", f"{checkout['order_id']}|{payment.id}".encode(), hashlib.sha256
        ).hexdigest()
        verify = {
            "razorpay_order_id": checkout["order_id"],
            "razorpay_payment_id": payment.id,
            "razorpay_signature": signature,
        }
        assert (await client.post(other_path + "/checkout/verify", json=verify)).status_code == 404
        assert (
            await client.post(
                path + "/checkout/verify", json={**verify, "razorpay_signature": "0" * 64}
            )
        ).status_code == 400

        async def fetched(_):
            return payment

        monkeypatch.setattr(gateway, "fetch_payment", fetched)
        confirmed = await client.post(path + "/checkout/verify", json=verify)
        assert confirmed.status_code == 200 and confirmed.json()["checkout"]["status"] == "paid"
        assert (await client.post(path + "/checkout/verify", json=verify)).json()["checkout"][
            "status"
        ] == "paid"
        assert (await client.get(path + "/subscription")).json()["status"] == "active"
        # A cancelled/refunded term is not a term the customer must replace.
        # They can make a new purchase without reviving that old subscription.
        async with env.sessions() as db:
            previous = await db.get(Subscription, saved.subscription_id)
            previous.status = SubscriptionStatus.CANCELLED
            await db.commit()
        assert (await client.get(path + "/checkout")).json()["current_term"] is None
        repurchase = await client.post(
            path + "/checkout/orders",
            json={
                **payload,
                "idempotency_key": str(uuid.uuid4()),
            },
        )
        assert repurchase.status_code == 201
        assert (await client.get(path + "/subscription")).json()["status"] != "active"
        async with env.sessions() as db:
            assert (
                await db.scalar(
                    select(func.count())
                    .select_from(PaymentTransaction)
                    .where(PaymentTransaction.application_id == env.app.id)
                )
                == 1
            )


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


async def test_customer_coupon_quote_order_commission_and_refund_reversal(environment, monkeypatch):
    env = environment
    from app.db.models import (
        Affiliate,
        AffiliateCommission,
        CommissionEntryType,
        Coupon,
        CouponKind,
        CouponStatus,
        ValueType,
    )

    async with env.sessions() as db:
        config = PlanUiConfig(application_id=env.app.id)
        db.add(config)
        await db.flush()
        db.add(
            PlanUiItem(
                application_id=env.app.id,
                config_id=config.id,
                plan_id=env.plan.id,
                visible=True,
                display_order=0,
            )
        )
        affiliate = Affiliate(
            application_id=env.app.id, contact_name="QA Partner", email="partner@example.com"
        )
        db.add(affiliate)
        await db.flush()
        coupon = Coupon(
            application_id=env.app.id,
            name="QA partner coupon",
            code="PARTNER5",
            kind=CouponKind.AFFILIATE,
            affiliate_id=affiliate.id,
            discount_type=ValueType.FIXED,
            discount_value=Decimal("5"),
            currency="INR",
            commission_type=ValueType.PERCENTAGE,
            commission_value=Decimal("20"),
            starts_at=datetime.now(UTC) - timedelta(minutes=1),
            ends_at=datetime.now(UTC) + timedelta(days=1),
            maximum_redemptions=10,
            per_subscriber_limit=1,
            redemption_count=0,
            status=CouponStatus.ACTIVE,
        )
        db.add(coupon)
        await db.commit()
    app = FastAPI()
    app.include_router(customer_router)

    async def session():
        async with env.sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=env.app.id
    )
    path = f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}/checkout"

    async def commissions():
        async with env.sessions() as db:
            rows = (
                await db.scalars(
                    select(AffiliateCommission).where(
                        AffiliateCommission.application_id == env.app.id
                    )
                )
            ).all()
            return sorted((r.entry_type, r.amount) for r in rows)

    async def redemptions():
        async with env.sessions() as db:
            return (await db.get(Coupon, coupon.id)).redemption_count

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        quote = await client.post(
            path + "/quote", json={"plan_id": str(env.plan.id), "coupon_code": " partner5 "}
        )
        assert quote.status_code == 200, quote.text
        assert Decimal(quote.json()["final_price"]) == Decimal("20.01")
        assert Decimal(quote.json()["discount_amount"]) == Decimal("5")
        bad = await client.post(
            path + "/quote", json={"plan_id": str(env.plan.id), "coupon_code": "NOPE99"}
        )
        assert bad.status_code == 422
        assert await redemptions() == 0  # Quotes never reserve a redemption.
        order = {
            "plan_id": str(env.plan.id),
            "idempotency_key": str(uuid.uuid4()),
            "actor_id": "billeasy-owner-1",
            "coupon_code": "PARTNER5",
        }
        created = await client.post(path + "/orders", json=order)
        assert created.status_code == 201, created.text
        assert (await client.post(path + "/orders", json=order)).status_code == 201
        assert (
            await client.post(path + "/orders", json={**order, "coupon_code": None})
        ).status_code == 409  # Same key cannot change the commercial terms.
        assert await redemptions() == 1 and await commissions() == []
    async with env.sessions() as db:
        saved = await db.get(RazorpayCheckout, uuid.UUID(created.json()["checkout"]["id"]))
    assert saved.amount_minor == 2001
    payment = capture(saved)
    results = await asyncio.gather(*[settle(env, payment) for _ in range(4)])
    assert all(result.status == "paid" for result in results)
    # 20% of the ₹20.01 actually paid, earned once despite concurrent callbacks.
    assert await commissions() == [(CommissionEntryType.EARNED, Decimal("4.0000"))]
    earned = Decimal("4.0000")
    full = payment.model_copy(update={"amount_refunded": payment.amount, "status": "refunded"})
    await settle(env, full)
    await settle(env, full)
    assert await commissions() == sorted(
        [(CommissionEntryType.EARNED, earned), (CommissionEntryType.ADJUSTMENT, -earned)]
    )


async def test_free_plan_activates_once_without_payment_and_never_over_a_current_term(
    environment, monkeypatch
):
    env = environment
    async with env.sessions() as db:
        free = SubscriptionPlan(
            application_id=env.app.id,
            name="QA Free",
            code="qa_free",
            price=Decimal("0"),
            currency="INR",
            duration_value=1,
            duration_unit=DurationUnit.YEAR,
            status=PlanStatus.ACTIVE,
            effective_at=datetime.now(UTC) - timedelta(days=1),
            user_limit_unlimited=True,
        )
        db.add(free)
        config = PlanUiConfig(application_id=env.app.id)
        db.add(config)
        await db.flush()
        for index, plan_id in enumerate([free.id, env.plan.id]):
            db.add(
                PlanUiItem(
                    application_id=env.app.id,
                    config_id=config.id,
                    plan_id=plan_id,
                    visible=True,
                    display_order=index,
                )
            )
        await db.commit()

    def disabled():
        raise HTTPException(status_code=503, detail="Payments disabled")

    monkeypatch.setattr(gateway, "payment_settings", disabled)
    app = FastAPI()
    app.include_router(customer_router)
    app.include_router(subscription_router)

    async def session():
        async with env.sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=env.app.id
    )
    path = f"/integrations/apps/{env.app.id}/tenants/{env.subscriber.external_id}"
    order = {"plan_id": str(free.id), "idempotency_key": str(uuid.uuid4()), "actor_id": "owner"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (
            await client.post(path + "/checkout/orders", json={**order, "coupon_code": "ANY10"})
        ).status_code == 422
        claims = await asyncio.gather(
            *(client.post(path + "/checkout/orders", json=order) for _ in range(4))
        )
        assert sorted(r.status_code for r in claims) == [201, 409, 409, 409]
        assert (await client.get(path + "/subscription")).json()["plan_name"] == "QA Free"
        # Paid plans still require the payment provider.
        paid = {**order, "plan_id": str(env.plan.id), "idempotency_key": str(uuid.uuid4())}
        assert (await client.post(path + "/checkout/orders", json=paid)).status_code == 503
        async with env.sessions() as db:
            term = await db.scalar(
                select(Subscription).where(
                    Subscription.application_id == env.app.id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                )
            )
            term.starts_at = datetime.now(UTC) - timedelta(days=366)  # Lapsed free year.
            term.ends_at = datetime.now(UTC) - timedelta(days=1)
            await db.commit()
        again = await client.post(
            path + "/checkout/orders", json={**order, "idempotency_key": str(uuid.uuid4())}
        )
        assert again.status_code == 201
        async with env.sessions() as db:
            statuses = sorted(
                s.value
                for s in (
                    await db.scalars(
                        select(Subscription.status).where(Subscription.application_id == env.app.id)
                    )
                ).all()
            )
        assert statuses == ["active", "expired"]


async def test_plans_coupons_and_affiliates_can_be_edited_and_safely_deleted(environment):
    env = environment
    from app.db.models import (
        Affiliate,
        Coupon,
        CouponKind,
        CouponPlan,
        CouponStatus,
        ValueType,
    )
    from app.domains.affiliates.service import affiliate_service
    from app.domains.catalog.schemas import PlanUpdate
    from app.domains.catalog.service import catalog_service
    from app.domains.coupons.schemas import CouponUpdate
    from app.domains.coupons.service import coupon_service

    principal = env.principal
    # A customer bought the plan at the old price before it was edited.
    async with env.sessions() as db:
        bought = await subscription_service.create_subscription(
            db,
            application_id=env.app.id,
            principal=principal,
            payload=SubscriptionCreate(
                subscriber_id=env.subscriber.id,
                plan_id=env.plan.id,
                starts_at=datetime.now(UTC),
            ),
            correlation_id="qa",
        )
    async with env.sessions() as db:
        with pytest.raises(HTTPException) as stale:
            await catalog_service.update_plan(
                db,
                application_id=env.app.id,
                plan_id=env.plan.id,
                principal=principal,
                payload=PlanUpdate(expected_version=99, price=Decimal("1")),
                correlation_id="qa",
            )
        assert stale.value.status_code == 409
    async with env.sessions() as db:
        plan, _ = await catalog_service.update_plan(
            db,
            application_id=env.app.id,
            plan_id=env.plan.id,
            principal=principal,
            payload=PlanUpdate(expected_version=env.plan.version, name="QA Plan v2", price=99),
            correlation_id="qa",
        )
    assert plan.name == "QA Plan v2" and plan.price == Decimal("99")
    async with env.sessions() as db:
        assert (await db.get(Subscription, bought.id)).commercial_snapshot["price"] == "25.0100"
        with pytest.raises(HTTPException) as used:
            await catalog_service.delete_plan(
                db,
                application_id=env.app.id,
                plan_id=env.plan.id,
                principal=principal,
                correlation_id="qa",
            )
        assert used.value.status_code == 409
    async with env.sessions() as db:
        archived, _ = await catalog_service.update_plan(
            db,
            application_id=env.app.id,
            plan_id=env.plan.id,
            principal=principal,
            payload=PlanUpdate(expected_version=plan.version, status=PlanStatus.ARCHIVED),
            correlation_id="qa",
        )
    assert archived.status == PlanStatus.ARCHIVED and archived.archived_at is not None
    async with env.sessions() as db:
        spare = SubscriptionPlan(
            application_id=env.app.id,
            name="QA Spare",
            code="qa_spare",
            price=Decimal("10"),
            currency="INR",
            duration_value=1,
            duration_unit=DurationUnit.MONTH,
            status=PlanStatus.DRAFT,
            user_limit_unlimited=True,
        )
        db.add(spare)
        affiliate = Affiliate(application_id=env.app.id, contact_name="Old", email="old@x.com")
        db.add(affiliate)
        await db.flush()
        coupon = Coupon(
            application_id=env.app.id,
            name="QA coupon",
            kind=CouponKind.PROMOTION,
            code="QAEDIT",
            discount_type=ValueType.PERCENTAGE,
            discount_value=Decimal("10"),
            starts_at=datetime.now(UTC) - timedelta(minutes=1),
            ends_at=datetime.now(UTC) + timedelta(days=1),
            maximum_redemptions=5,
            redemption_count=0,
            status=CouponStatus.ACTIVE,
        )
        db.add(coupon)
        await db.commit()
    async with env.sessions() as db:
        await catalog_service.delete_plan(
            db,
            application_id=env.app.id,
            plan_id=spare.id,
            principal=principal,
            correlation_id="qa",
        )
    async with env.sessions() as db:
        assert await db.get(SubscriptionPlan, spare.id) is None
        edited, plan_ids = await coupon_service.update_coupon(
            db,
            application_id=env.app.id,
            coupon_id=coupon.id,
            principal=principal,
            payload=CouponUpdate(
                expected_version=coupon.version,
                name="QA coupon 15",
                discount_value=Decimal("15"),
                maximum_redemptions=3,
                plan_ids=[env.plan.id],
            ),
            correlation_id="qa",
        )
    assert edited.discount_value == Decimal("15") and plan_ids == [env.plan.id]
    async with env.sessions() as db:
        refreshed = await db.get(Coupon, coupon.id)
        refreshed.redemption_count = 2  # As if used twice.
        await db.commit()
    async with env.sessions() as db:
        for bad, code in [
            (CouponUpdate(expected_version=edited.version, discount_value=Decimal("50")), 409),
            (CouponUpdate(expected_version=edited.version, maximum_redemptions=1), 422),
        ]:
            with pytest.raises(HTTPException) as rejected:
                await coupon_service.update_coupon(
                    db,
                    application_id=env.app.id,
                    coupon_id=coupon.id,
                    principal=principal,
                    payload=bad,
                    correlation_id="qa",
                )
            assert rejected.value.status_code == code
            await db.rollback()
        with pytest.raises(HTTPException) as in_use:
            await coupon_service.delete_coupon(
                db,
                application_id=env.app.id,
                coupon_id=coupon.id,
                principal=principal,
                correlation_id="qa",
            )
        assert in_use.value.status_code == 409
        await db.rollback()
        disabled, _ = await coupon_service.update_coupon(
            db,
            application_id=env.app.id,
            coupon_id=coupon.id,
            principal=principal,
            payload=CouponUpdate(expected_version=edited.version, status=CouponStatus.DISABLED),
            correlation_id="qa",
        )
        assert disabled.status == CouponStatus.DISABLED
        refreshed = await db.get(Coupon, coupon.id)
        refreshed.redemption_count = 0
        await db.commit()
    async with env.sessions() as db:
        await coupon_service.delete_coupon(
            db,
            application_id=env.app.id,
            coupon_id=coupon.id,
            principal=principal,
            correlation_id="qa",
        )
    async with env.sessions() as db:
        assert await db.get(Coupon, coupon.id) is None
        assert not (
            await db.scalars(select(CouponPlan).where(CouponPlan.coupon_id == coupon.id))
        ).all()
        partner = await affiliate_service.update_profile(
            db,
            application_id=env.app.id,
            affiliate_id=affiliate.id,
            changes={"contact_name": "New Name", "mobile_number": "+919800000000"},
            principal=principal,
            correlation_id="qa",
        )
    assert partner.contact_name == "New Name" and partner.version == 2


async def test_abandoned_checkout_expires_releases_coupon_and_late_payment_is_reviewed(
    environment,
):
    env = environment
    from app.db.models import Coupon, CouponKind, CouponStatus, ValueType
    from app.domains.payments.service import expire_stale_checkouts

    async with env.sessions() as db:
        coupon = Coupon(
            application_id=env.app.id,
            name="QA expiring",
            kind=CouponKind.PROMOTION,
            code="QAEXPIRE",
            discount_type=ValueType.FIXED,
            discount_value=Decimal("5"),
            currency="INR",
            starts_at=datetime.now(UTC) - timedelta(minutes=1),
            ends_at=datetime.now(UTC) + timedelta(days=1),
            maximum_redemptions=1,
            redemption_count=0,
            status=CouponStatus.ACTIVE,
        )
        db.add(coupon)
        await db.commit()
    checkout = await begin(env, env.payload.model_copy(update={"coupon_code": "QAEXPIRE"}))
    async with env.sessions() as db:
        assert (await db.get(Coupon, coupon.id)).redemption_count == 1
        assert await expire_stale_checkouts(db, application_id=env.app.id) == 0  # Too recent.
        saved = await db.get(RazorpayCheckout, checkout.id)
        saved.created_at = datetime.now(UTC) - timedelta(hours=25)
        await db.commit()
    async with env.sessions() as db:
        assert await expire_stale_checkouts(db, application_id=env.app.id) == 1
        await db.commit()
    async with env.sessions() as db:
        assert (await db.get(RazorpayCheckout, checkout.id)).status == "expired"
        assert (
            await db.get(Subscription, checkout.subscription_id)
        ).status == SubscriptionStatus.CANCELLED
        assert (await db.get(Coupon, coupon.id)).redemption_count == 0
    # The customer can start again: the expired order no longer blocks them.
    again = await begin(
        env,
        env.payload.model_copy(update={"idempotency_key": uuid.uuid4(), "coupon_code": "QAEXPIRE"}),
    )
    assert again.status == "ready"
    # Money that still arrives for the expired order is kept and flagged, never lost.
    late = await settle(env, capture(checkout))
    assert late.status == "review"
    async with env.sessions() as db:
        assert (
            await db.scalar(
                select(func.count())
                .select_from(PaymentTransaction)
                .where(PaymentTransaction.application_id == env.app.id)
            )
            == 1
        )
