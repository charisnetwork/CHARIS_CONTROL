"""Monitor rules against a real database: security events, alerts and health checks."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from test_razorpay_postgres import URL, environment, pytestmark  # noqa: F401  (shared fixture)

from app.api.dependencies import require_integration_credential
from app.db.models import HealthCheck, HealthStatus, MonitorAlert, SecurityEvent
from app.db.session import get_db_session
from app.domains.monitoring import service
from app.domains.monitoring.router import integration_router


async def alerts(env, kind=None):
    async with env.sessions() as db:
        query = select(MonitorAlert).where(MonitorAlert.application_id == env.app.id)
        if kind:
            query = query.where(MonitorAlert.kind == kind)
        return list((await db.scalars(query)).all())


async def test_apps_report_events_and_rules_open_one_alert_per_subject(environment):  # noqa: F811 (pytest fixture)
    env = environment
    app = FastAPI()
    app.include_router(integration_router)

    async def session():
        async with env.sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=env.app.id
    )
    now = datetime.now(UTC)
    path = f"/integrations/apps/{env.app.id}/security-events"
    event = {"type": "login_failed", "occurred_at": now.isoformat(), "ip": "203.0.113.9"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bad = {"contract_version": 1, "events": [{**event, "type": "drop_tables"}]}
        assert (await client.post(path, json=bad)).status_code == 422
        too_many = {"contract_version": 1, "events": [event] * 101}
        assert (await client.post(path, json=too_many)).status_code == 422
        batch = {"contract_version": 1, "events": [event] * 20}
        accepted = await client.post(path, json=batch)
        assert accepted.status_code == 202 and accepted.json() == {"accepted": 20}
        quiet = {"contract_version": 1, "events": [{**event, "ip": "198.51.100.7"}] * 3}
        assert (await client.post(path, json=quiet)).status_code == 202

    async with env.sessions() as db:
        await service.evaluate_security(db, env.app, now)
        await db.commit()
    opened = await alerts(env, "brute_force_ip")
    assert len(opened) == 1 and opened[0].detail["ip_address"] == "203.0.113.9"
    assert opened[0].severity == "high" and opened[0].detail["count"] == 20

    async with env.sessions() as db:  # still happening: the same alert is refreshed
        await service.evaluate_security(db, env.app, now)
        await db.commit()
    again = await alerts(env, "brute_force_ip")
    assert len(again) == 1 and again[0].occurrences == 2

    async with env.sessions() as db:  # plan checks failing app-wide: no grouping
        db.add_all(
            SecurityEvent(
                application_id=env.app.id,
                event_type="subscription_check_failed",
                severity="high",
                occurred_at=now,
            )
            for _ in range(5)
        )
        await db.flush()
        await service.evaluate_security(db, env.app, now)
        await db.commit()
    assert len(await alerts(env, "enforcement_unverified")) == 1


async def test_health_alerts_open_when_down_and_resolve_on_recovery(environment):  # noqa: F811 (pytest fixture)
    env = environment
    now = datetime.now(UTC)

    def check(minutes, status):
        return HealthCheck(
            application_id=env.app.id,
            overall_status=status,
            frontend_status=HealthStatus.HEALTHY,
            backend_status=status,
            database_status=HealthStatus.UNKNOWN,
            dependencies={"source": "monitor"},
            checked_at=now - timedelta(minutes=minutes),
        )

    async with env.sessions() as db:
        db.add_all([check(10, HealthStatus.CRITICAL), check(5, HealthStatus.CRITICAL)])
        await db.flush()
        await service.evaluate_health(db, env.app, now)
        await db.commit()
    down = await alerts(env, "app_down")
    assert len(down) == 1 and down[0].severity == "critical" and down[0].status == "open"

    async with env.sessions() as db:
        db.add(check(0, HealthStatus.HEALTHY))
        await db.flush()
        await service.evaluate_health(db, env.app, now)
        await db.commit()
    assert (await alerts(env, "app_down"))[0].status == "resolved"


async def test_monitor_cycle_probes_backend_and_website(environment, monkeypatch):  # noqa: F811 (pytest fixture)
    env = environment
    seen = []

    def answer(request):
        seen.append(str(request.url))
        return httpx.Response(503 if "control" in str(request.url) else 200)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        service.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(answer), **kwargs),
    )
    async with env.sessions() as db:
        application = await db.get(type(env.app), env.app.id)
        application.frontend_url = "https://qa.example.com"
        await db.commit()
    assert await service.run_cycle(env.sessions) >= 1
    assert "https://example.com/control/control/v1/health" in seen
    async with env.sessions() as db:
        latest = await db.scalar(
            select(HealthCheck)
            .where(HealthCheck.application_id == env.app.id)
            .order_by(HealthCheck.checked_at.desc())
        )
    assert latest.backend_status == HealthStatus.CRITICAL
    assert latest.frontend_status == HealthStatus.HEALTHY
    assert "Backend HTTP 503" in latest.incident_summary
    assert uuid.UUID(str(latest.id))
