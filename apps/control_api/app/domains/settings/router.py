from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import (
    AppAuthorization,
    DatabaseSession,
    IntegrationCredential,
    require_app_permission,
)
from app.db.models import AppPermission
from app.domains.applications.schemas import ApplicationRead, IssuedCredential
from app.domains.settings.schemas import (
    ApplicationSettingsUpdate,
    CredentialRead,
    CredentialRotationRequest,
    HealthReportCreate,
    HealthReportRead,
    PlanUiItemInput,
    PlanUiSettingsRead,
    PlanUiSettingsUpdate,
)
from app.domains.settings.service import settings_service

router = APIRouter(prefix="/apps/{app_id}/settings", tags=["application settings"])
integration_router = APIRouter(
    prefix="/integrations/apps/{app_id}", tags=["application integration"]
)
ViewSettings = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_SETTINGS))
]
ManageSettings = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_SETTINGS))
]
RotateKeys = Annotated[AppAuthorization, Depends(require_app_permission(AppPermission.ROTATE_KEYS))]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


def _plan_ui_read(
    application_id: uuid.UUID, config: object | None, items: list[object]
) -> PlanUiSettingsRead:
    if config is None:
        return PlanUiSettingsRead(application_id=application_id)
    return PlanUiSettingsRead.model_validate(
        {
            **config.__dict__,
            "items": [PlanUiItemInput.model_validate(item, from_attributes=True) for item in items],
        }
    )


@router.patch("/application", response_model=ApplicationRead)
async def update_application_settings(
    payload: ApplicationSettingsUpdate,
    request: Request,
    authorization: ManageSettings,
    db: DatabaseSession,
) -> ApplicationRead:
    application = await settings_service.update_application(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return ApplicationRead.model_validate(application)


@router.get("/credentials", response_model=list[CredentialRead])
async def list_credentials(authorization: RotateKeys, db: DatabaseSession) -> list[CredentialRead]:
    rows = await settings_service.list_credentials(db, application_id=authorization.application_id)
    return [CredentialRead.model_validate(row) for row in rows]


@router.post("/credentials/rotate", response_model=IssuedCredential)
async def rotate_credential(
    payload: CredentialRotationRequest,
    request: Request,
    authorization: RotateKeys,
    db: DatabaseSession,
) -> IssuedCredential:
    return await settings_service.rotate_credential(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        grace_hours=payload.grace_hours,
        correlation_id=_correlation_id(request),
    )


@router.get("/health", response_model=list[HealthReportRead])
async def list_health(
    authorization: ViewSettings,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[HealthReportRead]:
    rows = await settings_service.list_health(
        db, application_id=authorization.application_id, limit=limit
    )
    return [HealthReportRead.model_validate(row) for row in rows]


@router.get("/subscription-storefront", response_model=PlanUiSettingsRead)
async def get_subscription_storefront(
    authorization: ViewSettings, db: DatabaseSession
) -> PlanUiSettingsRead:
    config, items = await settings_service.get_plan_ui(
        db, application_id=authorization.application_id
    )
    return _plan_ui_read(authorization.application_id, config, list(items))


@router.put("/subscription-storefront", response_model=PlanUiSettingsRead)
async def update_subscription_storefront(
    payload: PlanUiSettingsUpdate,
    request: Request,
    authorization: ManageSettings,
    db: DatabaseSession,
) -> PlanUiSettingsRead:
    config, items = await settings_service.update_plan_ui(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return _plan_ui_read(authorization.application_id, config, list(items))


@integration_router.post("/health", response_model=HealthReportRead)
async def record_application_health(
    payload: HealthReportCreate,
    authorization: IntegrationCredential,
    db: DatabaseSession,
) -> HealthReportRead:
    health = await settings_service.record_health(
        db, application_id=authorization.application_id, payload=payload
    )
    return HealthReportRead.model_validate(health)


__all__ = ["integration_router", "router"]
