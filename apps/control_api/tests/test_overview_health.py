import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.db.models import HealthCheck, HealthStatus
from app.domains.overview import router as overview


async def test_overview_includes_a_monitor_health_check(monkeypatch):
    """A health row written by the monitor (overall_status) must not break the overview."""
    check = HealthCheck(
        id=uuid.uuid4(),
        application_id=uuid.uuid4(),
        overall_status=HealthStatus.DEGRADED,
        frontend_status=HealthStatus.HEALTHY,
        backend_status=HealthStatus.DEGRADED,
        database_status=HealthStatus.UNKNOWN,
        latency_ms=120,
        dependencies={"source": "monitor"},
        checked_at=datetime.now(UTC),
    )
    counts = SimpleNamespace(
        subscribers=1, subscriptions=1, active_subscriptions=1, plans=2, active_coupons=0
    )

    async def fake_counts(db, *, application_id):
        return counts

    async def fake_health(db, *, application_id):
        return check

    monkeypatch.setattr(overview.overview_service, "counts", fake_counts)
    monkeypatch.setattr(overview.overview_service, "latest_health", fake_health)
    result = await overview.get_overview(
        SimpleNamespace(application_id=check.application_id), db=None
    )
    assert result.latest_health is not None
    assert result.latest_health.status == HealthStatus.DEGRADED
    assert result.latest_health.latency_ms == 120
