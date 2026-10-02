from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.domains.affiliates.router import router as affiliates_router
from app.domains.applications.router import router as applications_router
from app.domains.catalog.router import router as catalog_router
from app.domains.coupons.router import router as coupons_router
from app.domains.governance.router import router as governance_router
from app.domains.notifications.router import router as notifications_router
from app.domains.overview.router import router as overview_router
from app.domains.reports.router import router as reports_router
from app.domains.settings.router import integration_router
from app.domains.settings.router import router as settings_router
from app.domains.subscriptions.router import router as subscriptions_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(affiliates_router)
api_v1_router.include_router(applications_router)
api_v1_router.include_router(catalog_router)
api_v1_router.include_router(coupons_router)
api_v1_router.include_router(overview_router)
api_v1_router.include_router(reports_router)
api_v1_router.include_router(notifications_router)
api_v1_router.include_router(governance_router)
api_v1_router.include_router(subscriptions_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(integration_router)

__all__ = ["api_v1_router"]
