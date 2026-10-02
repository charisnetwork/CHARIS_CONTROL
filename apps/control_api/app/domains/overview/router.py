from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.overview.schemas import ApplicationOverviewResponse, LatestHealth, OverviewCounts
from app.domains.overview.service import overview_service

router = APIRouter(prefix="/apps/{app_id}/overview", tags=["application overview"])
ViewOverview = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_OVERVIEW)),
]


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
        latest_health=LatestHealth.model_validate(health, from_attributes=True) if health else None,
        data_sources={
            "control_centre": True,
            "application_adapter": False,
        },
    )


__all__ = ["router"]
