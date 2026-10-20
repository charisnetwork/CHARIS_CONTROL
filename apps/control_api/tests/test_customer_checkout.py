import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.domains.payments.integration import CustomerOrder, order_statement, router


def test_customer_cannot_supply_amount_grants_or_missing_expected_version():
    payload = {"plan_id": uuid.uuid4(), "idempotency_key": uuid.uuid4(), "actor_id": "civil-user"}
    for extra in [
        {"amount": 1},
        {"entitlements": []},
        {"subscriber_id": uuid.uuid4()},
        {"previous_subscription_id": uuid.uuid4()},
    ]:
        with pytest.raises(ValidationError):
            CustomerOrder(**payload, **extra)


def test_customer_order_lookup_scopes_app_and_subscriber():
    app_id, subscriber_id = uuid.uuid4(), uuid.uuid4()
    sql = str(
        order_statement(app_id, subscriber_id).compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert str(app_id) in sql and str(subscriber_id) in sql
    assert "subscriptions.application_id = razorpay_checkouts.application_id" in sql


async def test_customer_adapter_does_not_accept_anonymous_requests():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/integrations/apps/{uuid.uuid4()}/tenants/company/checkout"
        )
    assert response.status_code == 401
