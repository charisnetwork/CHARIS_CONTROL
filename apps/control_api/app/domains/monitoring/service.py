"""Application monitor: health probes, security events from apps, and the alerts raised from them.

Every cycle (MONITOR_INTERVAL_SECONDS) the monitor probes each active application's backend
health path and website, stores the result as a HealthCheck, then evaluates the rules below over
the latest checks and the security events the apps reported. A rule that fires opens (or
refreshes) one alert per dedupe key; health alerts resolve themselves when the app recovers.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import (
    Application,
    ApplicationStatus,
    HealthCheck,
    HealthStatus,
    MonitorAlert,
    SecurityEvent,
)

logger = logging.getLogger(__name__)

EVENT_RETENTION = timedelta(days=30)
HEALTH_RETENTION = timedelta(days=14)
WINDOW = timedelta(minutes=10)
PROBE_TIMEOUT = httpx.Timeout(10.0)
MONITOR_LOCK = 4_172_026_111  # pg advisory lock: one monitor cycle at a time across replicas


@dataclass(frozen=True)
class Rule:
    """Opens an alert when `threshold` events of `event_types` share `group_by` within WINDOW."""

    kind: str
    event_types: tuple[str, ...]
    group_by: str | None
    threshold: int
    severity: str
    title: str


RULES: tuple[Rule, ...] = (
    Rule(
        "brute_force_ip",
        ("login_failed",),
        "ip_address",
        20,
        "high",
        "Many failed logins from one address",
    ),
    Rule(
        "brute_force_account",
        ("login_failed",),
        "actor_ref",
        10,
        "high",
        "Many failed logins on one account",
    ),
    Rule(
        "cross_tenant_probe",
        ("tenant_access_denied",),
        "tenant_id",
        5,
        "high",
        "A business is trying to open another business's records",
    ),
    Rule(
        "token_reuse",
        ("token_reuse",),
        "actor_ref",
        1,
        "high",
        "A stolen or replayed sign-in token was used",
    ),
    Rule(
        "app_flagged",
        ("brute_force_detected", "suspicious_activity"),
        "ip_address",
        1,
        "high",
        "The app flagged suspicious activity",
    ),
    Rule(
        "rate_limit_flood",
        ("rate_limited",),
        "ip_address",
        100,
        "medium",
        "One address is hitting rate limits heavily",
    ),
    Rule(
        "integration_key_rejected",
        ("integration_auth_failed",),
        None,
        3,
        "high",
        "Control Centre is rejecting this app's key: plans and limits are not being checked",
    ),
    Rule(
        "enforcement_unverified",
        ("subscription_check_failed",),
        None,
        5,
        "high",
        "The app cannot verify plans with Control Centre: limits may not be enforced",
    ),
)


def _status_for(response: httpx.Response | None) -> HealthStatus:
    if response is None or response.status_code >= 500:
        return HealthStatus.CRITICAL
    if response.status_code >= 400:
        return HealthStatus.DEGRADED
    return HealthStatus.HEALTHY


async def _probe(
    client: httpx.AsyncClient, url: str | None
) -> tuple[HealthStatus, int | None, str]:
    if not url:
        return HealthStatus.UNKNOWN, None, "not configured"
    started = time.monotonic()
    try:
        response = await client.get(url, follow_redirects=True)
    except httpx.HTTPError as error:
        return HealthStatus.CRITICAL, None, type(error).__name__
    latency = int((time.monotonic() - started) * 1000)
    return _status_for(response), latency, f"HTTP {response.status_code}"


def _worst(*statuses: HealthStatus) -> HealthStatus:
    order = [HealthStatus.CRITICAL, HealthStatus.DEGRADED, HealthStatus.HEALTHY]
    known = [status for status in statuses if status != HealthStatus.UNKNOWN]
    return next((status for status in order if status in known), HealthStatus.UNKNOWN)


async def probe_application(
    client: httpx.AsyncClient, application: Application, now: datetime
) -> HealthCheck:
    backend_url = (
        f"{application.control_api_base_url.rstrip('/')}/{application.health_path.lstrip('/')}"
    )
    (backend, latency, backend_note), (frontend, _, frontend_note) = await asyncio.gather(
        _probe(client, backend_url), _probe(client, application.frontend_url)
    )
    overall = _worst(backend, frontend)
    problems = [
        f"{name} {note}"
        for name, status, note in (
            ("Backend", backend, backend_note),
            ("Website", frontend, frontend_note),
        )
        if status in (HealthStatus.CRITICAL, HealthStatus.DEGRADED)
    ]
    return HealthCheck(
        id=uuid.uuid4(),
        application_id=application.id,
        overall_status=overall,
        frontend_status=frontend,
        backend_status=backend,
        database_status=HealthStatus.UNKNOWN,
        latency_ms=latency,
        dependencies={"backend": backend_note, "website": frontend_note, "source": "monitor"},
        incident_summary="; ".join(problems) or None,
        checked_at=now,
    )


async def _open_alert(
    db: AsyncSession,
    application_id: uuid.UUID,
    *,
    kind: str,
    key: str,
    severity: str,
    title: str,
    detail: dict[str, Any],
    now: datetime,
) -> None:
    alert = await db.scalar(
        select(MonitorAlert).where(
            MonitorAlert.application_id == application_id,
            MonitorAlert.dedupe_key == key,
            MonitorAlert.status != "resolved",
        )
    )
    if alert is None:
        db.add(
            MonitorAlert(
                id=uuid.uuid4(),
                application_id=application_id,
                kind=kind,
                dedupe_key=key,
                severity=severity,
                status="open",
                title=title,
                detail=detail,
                occurrences=1,
                first_seen_at=now,
                last_seen_at=now,
            )
        )
        return
    alert.detail = detail
    alert.last_seen_at = now
    alert.occurrences += 1


async def _resolve(db: AsyncSession, application_id: uuid.UUID, key: str, now: datetime) -> None:
    alert = await db.scalar(
        select(MonitorAlert).where(
            MonitorAlert.application_id == application_id,
            MonitorAlert.dedupe_key == key,
            MonitorAlert.status != "resolved",
        )
    )
    if alert is not None:
        alert.status = "resolved"
        alert.resolved_at = now


async def evaluate_health(db: AsyncSession, application: Application, now: datetime) -> None:
    recent = list(
        (
            await db.scalars(
                select(HealthCheck)
                .where(HealthCheck.application_id == application.id)
                .order_by(HealthCheck.checked_at.desc())
                .limit(2)
            )
        ).all()
    )
    if not recent:
        return
    latest = recent[0]
    down = len(recent) == 2 and all(
        check.backend_status == HealthStatus.CRITICAL for check in recent
    )
    if down:
        await _open_alert(
            db,
            application.id,
            kind="app_down",
            key="app_down",
            severity="critical",
            title=f"{application.name} backend is not responding",
            detail={"summary": latest.incident_summary, "since": recent[1].checked_at.isoformat()},
            now=now,
        )
    elif latest.backend_status == HealthStatus.HEALTHY:
        await _resolve(db, application.id, "app_down", now)
    if latest.overall_status == HealthStatus.DEGRADED:
        await _open_alert(
            db,
            application.id,
            kind="app_degraded",
            key="app_degraded",
            severity="medium",
            title=f"{application.name} answers with errors",
            detail={"summary": latest.incident_summary},
            now=now,
        )
    elif latest.overall_status == HealthStatus.HEALTHY:
        await _resolve(db, application.id, "app_degraded", now)


async def evaluate_security(db: AsyncSession, application: Application, now: datetime) -> None:
    since = now - WINDOW
    for rule in RULES:
        column = getattr(SecurityEvent, rule.group_by) if rule.group_by else None
        selected = [column] if column is not None else []
        statement = (
            select(*selected, func.count(), func.array_agg(func.distinct(SecurityEvent.tenant_id)))
            .where(
                SecurityEvent.application_id == application.id,
                SecurityEvent.event_type.in_(rule.event_types),
                SecurityEvent.occurred_at >= since,
            )
            .having(func.count() >= rule.threshold)
        )
        if column is not None:
            statement = statement.where(column.is_not(None)).group_by(column)
        for row in (await db.execute(statement)).all():
            subject = row[0] if column is not None else None
            count, tenants = row[-2], [tenant for tenant in (row[-1] or []) if tenant][:20]
            detail = {"count": int(count), "window_minutes": 10, "tenants": tenants}
            if rule.group_by:
                detail[rule.group_by] = subject
            await _open_alert(
                db,
                application.id,
                kind=rule.kind,
                key=f"{rule.kind}:{subject}" if subject is not None else rule.kind,
                severity=rule.severity,
                title=rule.title,
                detail=detail,
                now=now,
            )


async def run_cycle(
    session_factory: async_sessionmaker[AsyncSession], now: datetime | None = None
) -> int:
    """One monitor pass over every active application. Returns how many apps were checked."""
    now = now or datetime.now(UTC)
    async with session_factory() as db:
        if not await db.scalar(text(f"SELECT pg_try_advisory_xact_lock({MONITOR_LOCK})")):
            return 0
        applications = list(
            (
                await db.scalars(
                    select(Application).where(Application.status == ApplicationStatus.ACTIVE)
                )
            ).all()
        )
        async with httpx.AsyncClient(
            timeout=PROBE_TIMEOUT, headers={"User-Agent": "CharisControl-Monitor"}
        ) as client:
            checks = await asyncio.gather(
                *(probe_application(client, application, now) for application in applications)
            )
        db.add_all(checks)
        await db.flush()
        for application in applications:
            await evaluate_health(db, application, now)
            await evaluate_security(db, application, now)
        await db.execute(
            delete(SecurityEvent).where(SecurityEvent.occurred_at < now - EVENT_RETENTION)
        )
        await db.execute(
            delete(HealthCheck).where(
                HealthCheck.checked_at < now - HEALTH_RETENTION,
                HealthCheck.dependencies["source"].astext == "monitor",
            )
        )
        await db.commit()
        return len(applications)


async def monitor_forever(session_factory: async_sessionmaker[AsyncSession], interval: int) -> None:
    """Background loop started with the API when MONITOR_ENABLED is true."""
    while True:
        try:
            checked = await run_cycle(session_factory)
            logger.info("monitor cycle checked %s application(s)", checked)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - the monitor must keep running
            logger.exception("monitor cycle failed")
        await asyncio.sleep(interval)


EVENT_TYPES = frozenset(
    {
        "login_failed",
        "token_reuse",
        "brute_force_detected",
        "tenant_access_denied",
        "permission_denied",
        "rate_limited",
        "plan_limit_reached",
        "subscription_check_failed",
        "suspicious_activity",
        "account_deleted",
    }
)
