from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.reports.schemas import ExportRequest, ReportRange, ReportSummary
from app.domains.reports.service import report_service

router = APIRouter(prefix="/apps/{app_id}/reports", tags=["reports"])
ViewReports = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_REPORTS))
]


@router.get("/summary", response_model=ReportSummary)
async def report_summary(
    authorization: ViewReports,
    db: DatabaseSession,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> ReportSummary:
    supplied: dict[str, datetime] = {}
    if starts_at is not None:
        supplied["starts_at"] = starts_at
    if ends_at is not None:
        supplied["ends_at"] = ends_at
    report_range = ReportRange.model_validate(supplied)
    result = await report_service.summary(
        db, application_id=authorization.application_id, report_range=report_range
    )
    return ReportSummary.model_validate(result)


@router.post("/exports", response_class=Response)
async def export_report(
    payload: ExportRequest,
    request: Request,
    authorization: ViewReports,
    db: DatabaseSession,
) -> Response:
    correlation_id = getattr(request.state, "correlation_id", str(uuid.uuid4()))
    content, filename, truncated = await report_service.export(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        request=payload,
        correlation_id=correlation_id,
    )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Report-Truncated": str(truncated).lower(),
        },
    )


__all__ = ["router"]
