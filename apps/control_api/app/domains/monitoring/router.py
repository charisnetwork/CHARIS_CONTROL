"""Monitoring API: apps report security events; administrators read health and handle alerts."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select

from app.api.dependencies import (
    AppAuthorization,
    DatabaseSession,
    IntegrationCredential,
    require_app_permission,
)
from app.db.models import (
    AppPermission,
    AuditLog,
    HealthCheck,
    HealthStatus,
    MonitorAlert,
    SecurityEvent,
)
from app.domains.monitoring.service import EVENT_TYPES, run_cycle

integration_router = APIRouter(
    prefix="/integrations/apps/{app_id}", tags=["monitoring integration"]
)
router = APIRouter(prefix="/apps/{app_id}/monitoring", tags=["monitoring"])

ViewMonitoring = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_OVERVIEW))
]
ManageMonitoring = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_SETTINGS))
]


class SecurityEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    type: str = Field(min_length=3, max_length=64)
    severity: Literal["info", "low", "medium", "high"] = "low"
    occurred_at: datetime
    tenant_id: str | None = Field(default=None, max_length=255)
    actor_ref: str | None = Field(default=None, max_length=255)
    ip: str | None = Field(default=None, max_length=64)
    path: str | None = Field(default=None, max_length=255)
    detail: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def known_type(cls, value: str) -> str:
        if value not in EVENT_TYPES:
            raise ValueError("unknown security event type")
        return value

    @field_validator("detail")
    @classmethod
    def small_detail(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(str(value)) > 2000:
            raise ValueError("detail is too large")
        return value


class SecurityEventBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_version: Literal[1]
    events: list[SecurityEventIn] = Field(min_length=1, max_length=100)


@integration_router.post("/security-events", status_code=status.HTTP_202_ACCEPTED)
async def report_security_events(
    payload: SecurityEventBatch, authorization: IntegrationCredential, db: DatabaseSession
) -> dict[str, int]:
    now = datetime.now(UTC)
    for event in payload.events:
        occurred = (
            event.occurred_at if event.occurred_at.tzinfo else event.occurred_at.replace(tzinfo=UTC)
        )
        db.add(
            SecurityEvent(
                id=uuid.uuid4(),
                application_id=authorization.application_id,
                event_type=event.type,
                severity=event.severity,
                tenant_id=event.tenant_id,
                actor_ref=event.actor_ref,
                ip_address=event.ip,
                path=event.path,
                detail=event.detail,
                # A clock far off cannot hide an event outside the detection window.
                occurred_at=occurred if abs(occurred - now) < timedelta(hours=1) else now,
            )
        )
    await db.commit()
    return {"accepted": len(payload.events)}


def _alert(alert: MonitorAlert) -> dict[str, Any]:
    return {
        "id": str(alert.id),
        "kind": alert.kind,
        "severity": alert.severity,
        "status": alert.status,
        "title": alert.title,
        "detail": alert.detail,
        "occurrences": alert.occurrences,
        "first_seen_at": alert.first_seen_at,
        "last_seen_at": alert.last_seen_at,
        "acknowledged_at": alert.acknowledged_at,
        "resolved_at": alert.resolved_at,
    }


@router.get("")
async def monitoring_overview(authorization: ViewMonitoring, db: DatabaseSession) -> dict[str, Any]:
    app_id = authorization.application.id
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    checks = list(
        (
            await db.scalars(
                select(HealthCheck)
                .where(HealthCheck.application_id == app_id, HealthCheck.checked_at >= day_ago)
                .order_by(HealthCheck.checked_at.desc())
                .limit(300)
            )
        ).all()
    )
    known = [check for check in checks if check.backend_status != HealthStatus.UNKNOWN]
    up = [check for check in known if check.backend_status != HealthStatus.CRITICAL]
    alerts = list(
        (
            await db.scalars(
                select(MonitorAlert)
                .where(MonitorAlert.application_id == app_id)
                .order_by(
                    (MonitorAlert.status == "resolved").asc(), MonitorAlert.last_seen_at.desc()
                )
                .limit(50)
            )
        ).all()
    )
    counts = (
        await db.execute(
            select(SecurityEvent.event_type, func.count())
            .where(SecurityEvent.application_id == app_id, SecurityEvent.occurred_at >= day_ago)
            .group_by(SecurityEvent.event_type)
        )
    ).all()
    events = list(
        (
            await db.scalars(
                select(SecurityEvent)
                .where(SecurityEvent.application_id == app_id)
                .order_by(SecurityEvent.occurred_at.desc())
                .limit(50)
            )
        ).all()
    )
    latest = checks[0] if checks else None
    return {
        "latest": None
        if latest is None
        else {
            "status": latest.overall_status,
            "backend": latest.backend_status,
            "website": latest.frontend_status,
            "latency_ms": latest.latency_ms,
            "summary": latest.incident_summary,
            "checked_at": latest.checked_at,
        },
        "uptime_24h": round(100 * len(up) / len(known), 1) if known else None,
        "checks_24h": len(checks),
        "timeline": [
            {"at": check.checked_at, "status": check.overall_status, "latency_ms": check.latency_ms}
            for check in reversed(checks[:96])
        ],
        "alerts": [_alert(alert) for alert in alerts],
        "event_counts_24h": {event_type: count for event_type, count in counts},
        "recent_events": [
            {
                "type": event.event_type,
                "severity": event.severity,
                "tenant_id": event.tenant_id,
                "actor_ref": event.actor_ref,
                "ip": event.ip_address,
                "path": event.path,
                "occurred_at": event.occurred_at,
            }
            for event in events
        ],
    }


@router.post("/alerts/{alert_id}/{action}")
async def handle_alert(
    alert_id: uuid.UUID,
    action: Literal["acknowledge", "resolve"],
    request: Request,
    authorization: ManageMonitoring,
    db: DatabaseSession,
) -> dict[str, Any]:
    alert = await db.scalar(
        select(MonitorAlert).where(
            MonitorAlert.id == alert_id, MonitorAlert.application_id == authorization.application.id
        )
    )
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.status == "resolved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Alert is already resolved")
    now = datetime.now(UTC)
    before = alert.status
    if action == "acknowledge":
        alert.status = "acknowledged"
        alert.acknowledged_at = now
        alert.acknowledged_by = authorization.principal.user.id
    else:
        alert.status = "resolved"
        alert.resolved_at = now
    db.add(
        AuditLog(
            id=uuid.uuid4(),
            application_id=alert.application_id,
            actor_user_id=authorization.principal.user.id,
            action=f"monitor_alert.{action}d",
            entity_type="monitor_alert",
            entity_id=str(alert.id),
            correlation_id=request.headers.get("X-Correlation-ID") or str(uuid.uuid4()),
            before_summary={"status": before},
            after_summary={"status": alert.status},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    return _alert(alert)


@router.post("/check-now")
async def check_now(request: Request, authorization: ManageMonitoring) -> dict[str, int]:
    """Runs one monitor pass now (all apps), e.g. right after a deploy."""
    from app.db.session import SessionFactory

    return {"checked": await run_cycle(SessionFactory)}
