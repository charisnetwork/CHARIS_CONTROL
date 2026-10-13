import hashlib
import hmac
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.core.config import Settings
from app.db.session import get_db_session
from app.domains.payments import gateway
from app.domains.payments.router import router
from app.domains.payments.schemas import CheckoutCreate, ProviderOrder, ProviderPayment
from app.domains.payments.service import minor_amount, order_matches, payment_matches


def test_checkout_and_webhook_signatures_use_distinct_secrets():
    raw = b'{"event":"payment.captured"}'
    signature = hmac.new(b"webhook-only", raw, hashlib.sha256).hexdigest()
    assert gateway.valid_signature(raw, signature, "webhook-only")
    assert not gateway.valid_signature(raw + b" ", signature, "webhook-only")
    assert not gateway.valid_signature(raw, signature, "merchant-key")
    assert not gateway.valid_signature(raw, signature, "")
    assert not gateway.valid_signature(raw, "é" * 64, "webhook-only")


@pytest.mark.parametrize("price", ["0", "-10", "1.001", "1000000.01", "NaN", "Infinity"])
def test_invalid_plan_amounts_rejected(price):
    with pytest.raises(HTTPException):
        minor_amount(price, "INR")


def test_minor_units_no_rounding_or_client_price():
    assert minor_amount("25.01", "INR") == 2501
    with pytest.raises(HTTPException):
        minor_amount("25", "USD")
    with pytest.raises(ValidationError):
        CheckoutCreate(
            subscriber_id=uuid.uuid4(),
            plan_id=uuid.uuid4(),
            idempotency_key=uuid.uuid4(),
            reason="QA checkout",
            amount=1,
        )


def test_order_and_payment_require_saved_quote_and_capture():
    identifier = uuid.uuid4()
    record = SimpleNamespace(
        id=identifier, provider_order_id="order_QA1", amount_minor=2500, currency="INR"
    )
    order = ProviderOrder(
        id="order_QA1",
        amount=2500,
        currency="INR",
        receipt=str(identifier),
        notes={"charis_checkout_id": str(identifier)},
    )
    payment = ProviderPayment(
        id="pay_QA1",
        order_id=order.id,
        amount=2500,
        currency="INR",
        status="captured",
        captured=True,
    )
    assert order_matches(order, record)
    assert payment_matches(payment, record)
    for patch in [
        {"amount": 1},
        {"currency": "USD"},
        {"order_id": "order_Other"},
        {"captured": False},
        {"status": "authorized"},
        {"status": "refunded", "amount_refunded": 0},
        {"amount_refunded": 2600},
    ]:
        assert not payment_matches(payment.model_copy(update=patch), record)
    assert not order_matches(order.model_copy(update={"receipt": "another"}), record)


def test_razorpay_disabled_by_default_and_configuration_requires_all_keys():
    assert Settings(_env_file=None).razorpay_enabled is False
    with pytest.raises(ValidationError):
        Settings(_env_file=None, razorpay_enabled=True, razorpay_key_id="rzp_test_dummy")
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            razorpay_enabled=True,
            razorpay_mode="live",
            razorpay_key_id="rzp_test_dummy",
            razorpay_key_secret="testsecret",
            razorpay_webhook_secret="qa-webhook-secret-long",
        )


async def test_webhook_invalid_signature_and_duplicate_delivery(monkeypatch):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    settings = Settings(
        _env_file=None,
        razorpay_enabled=True,
        razorpay_key_id="rzp_test_QA",
        razorpay_key_secret="merchant-test-only",
        razorpay_webhook_secret="qa-webhook-secret-long",
    )
    monkeypatch.setattr(gateway, "payment_settings", lambda: settings)
    fetch = AsyncMock(return_value=SimpleNamespace(id="pay_QA"))
    settle = AsyncMock()
    monkeypatch.setattr(gateway, "fetch_payment", fetch)
    monkeypatch.setattr("app.domains.payments.router.settle_payment", settle)
    raw = b'{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_QA"}}}}'
    signature = hmac.new(b"qa-webhook-secret-long", raw, hashlib.sha256).hexdigest()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        invalid = await client.post(
            "/api/v1/payments/razorpay/webhook",
            content=raw,
            headers={"X-Razorpay-Signature": "f" * 64},
        )
        assert invalid.status_code == 400
        fetch.assert_not_awaited()
        for _ in range(2):
            response = await client.post(
                "/api/v1/payments/razorpay/webhook",
                content=raw,
                headers={"X-Razorpay-Signature": signature},
            )
            assert response.status_code == 200
        oversized = await client.post("/api/v1/payments/razorpay/webhook", content=b"x" * 65537)
        assert oversized.status_code == 413
    assert settle.await_count == 2  # Transactional service handles replay, not event arrival order.


async def test_checkout_requires_authentication():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        response = await client.get(f"/api/v1/apps/{uuid.uuid4()}/payments/razorpay")
    assert response.status_code == 401
