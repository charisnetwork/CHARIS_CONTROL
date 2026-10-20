from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import postgresql

from app.api.dependencies import require_integration_credential
from app.db.models import SubscriberStatus, SubscriptionStatus
from app.db.session import get_db_session
from app.domains.subscriptions.integration import router, subscription_statement


async def test_tenant_sync_requires_app_key_and_rejects_billing_fields() -> None:
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    db = AsyncMock()
    application.dependency_overrides[get_db_session] = lambda: db
    path = f"/api/v1/integrations/apps/{uuid.uuid4()}/tenants/company-a"
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.put(path, json={"name": "Company"})
        assert response.status_code == 401
        application.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
            application_id=uuid.uuid4()
        )
        response = await client.put(path, json={"name": "Company", "status": "active"})
        assert response.status_code == 422
        db.commit.assert_not_awaited()


async def test_tenant_sync_preserves_suspended_subscriber_and_idempotent_version() -> None:
    app_id = uuid.uuid4()
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    application.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=app_id
    )
    subscriber = SimpleNamespace(
        id=uuid.uuid4(),
        name="Company",
        email=None,
        mobile_number=None,
        status=SubscriberStatus.SUSPENDED,
        version=4,
    )
    db = AsyncMock()
    db.scalar.return_value = None
    db.execute.return_value = SimpleNamespace(scalar_one=lambda: subscriber)
    application.dependency_overrides[get_db_session] = lambda: db
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.put(
            f"/api/v1/integrations/apps/{app_id}/tenants/company-a", json={"name": "Company"}
        )
    assert response.status_code == 200
    assert response.json()["tenant_id"] == "company-a"
    assert subscriber.status == SubscriberStatus.SUSPENDED
    assert subscriber.version == 4
    db.commit.assert_awaited_once()


def test_adapter_query_scopes_both_sides_and_external_tenant() -> None:
    app_id = uuid.uuid4()
    sql = str(
        subscription_statement(app_id, "civil-company").compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert str(app_id) in sql
    assert "subscribers.external_id = 'civil-company'" in sql
    assert "subscribers.application_id = subscriptions.application_id" in sql


async def test_adapter_requires_application_credentials() -> None:
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    application.dependency_overrides[get_db_session] = lambda: AsyncMock()
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/integrations/apps/{uuid.uuid4()}/tenants/company/subscription"
        )
    assert response.status_code == 401


async def test_active_expired_suspended_and_missing_snapshot() -> None:
    app_id = uuid.uuid4()
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    application.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=app_id
    )
    db = AsyncMock()
    application.dependency_overrides[get_db_session] = lambda: db
    now = datetime.now(UTC)
    subscription = SimpleNamespace(
        id=uuid.uuid4(),
        starts_at=now - timedelta(days=1),
        ends_at=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
        commercial_snapshot={"plan_name": "Civil Base"},
        entitlement_snapshot=[
            {"feature_code": "site_photos", "enabled": True, "limit_type": "unlimited"}
        ],
    )
    subscriber = SimpleNamespace(status=SubscriberStatus.ACTIVE)
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        for expected in ["active", "expired", "suspended", "unassigned"]:
            if expected == "expired":
                subscription.ends_at = now - timedelta(seconds=1)
            if expected == "suspended":
                subscriber.status = SubscriberStatus.SUSPENDED
            result = SimpleNamespace(
                all=lambda state=expected: (
                    [] if state == "unassigned" else [(subscription, subscriber)]
                )
            )
            db.execute.return_value = result
            response = await client.get(
                f"/api/v1/integrations/apps/{app_id}/tenants/company-a/subscription"
            )
            assert response.status_code == 200
            assert response.json()["status"] == expected
            assert response.json()["tenant_id"] == "company-a"
            assert response.json()["application_id"] == str(app_id)
            assert response.headers["cache-control"] == "no-store"
