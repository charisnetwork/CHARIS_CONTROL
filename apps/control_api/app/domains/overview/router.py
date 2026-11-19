from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.overview.adapter import AppCustomers, AppSummary, fetch_report
from app.domains.overview.schemas import ApplicationOverviewResponse, LatestHealth, OverviewCounts
from app.domains.overview.service import overview_service

router = APIRouter(prefix="/apps/{app_id}/overview", tags=["application overview"])
ViewOverview = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_OVERVIEW)),
]
ViewCustomers = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_SUBSCRIBERS))
]


@router.get("/application-summary", response_model=AppSummary)
async def application_summary(authorization: ViewOverview, response: Response) -> AppSummary:
    response.headers["Cache-Control"] = "private, no-store"
    return await fetch_report(authorization.application_id, "summary", AppSummary)


@router.get("/application-customers", response_model=AppCustomers)
async def application_customers(
    authorization: ViewCustomers,
    response: Response,
    page: int = Query(default=1, ge=1, le=100000),
    page_size: int = Query(default=25, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    status: Literal["active", "disabled"] | None = None,
) -> AppCustomers:
    response.headers["Cache-Control"] = "private, no-store"
    params = {"page": str(page), "page_size": str(page_size), "search": search}
    if status is not None:
        params["status"] = status
    return await fetch_report(authorization.application_id, "customers", AppCustomers, params)


@router.get("", response_model=ApplicationOverviewResponse)
async def get_overview(
    authorization: ViewOverview,
    db: DatabaseSession,
) -> ApplicationOverviewResponse:
    counts = await overview_service.counts(db, application_id=authorization.application_id)
    health = await overview_service.latest_health(db, application_id=authorization.application_id)
    return ApplicationOverviewResponse(
        counts=OverviewCounts(
            subscribers=counts.subscribers,
            subscriptions=counts.subscriptions,
            active_subscriptions=counts.active_subscriptions,
            plans=counts.plans,
            active_coupons=counts.active_coupons,
        ),
        # Health rows name the overall status "overall_status"; map it explicitly.
        latest_health=LatestHealth(
            status=health.overall_status,
            frontend_status=health.frontend_status,
            backend_status=health.backend_status,
            database_status=health.database_status,
            latency_ms=health.latency_ms,
            checked_at=health.checked_at,
        )
        if health
        else None,
        data_sources={
            "control_centre": True,
            "application_adapter": False,
        },
    )


__all__ = ["router"]
