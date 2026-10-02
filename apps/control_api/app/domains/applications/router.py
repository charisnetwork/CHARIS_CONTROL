from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.dependencies import (
    AppAuthorization,
    CurrentUser,
    DatabaseSession,
    require_app_permission,
)
from app.db.models import AppPermission
from app.domains.applications.schemas import (
    ApplicationArchived,
    ApplicationCreate,
    ApplicationCreated,
    ApplicationRead,
)
from app.domains.applications.service import application_registry_service

router = APIRouter(prefix="/apps", tags=["applications"])

ViewApplication = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_OVERVIEW)),
]
ManageApplication = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.MANAGE_SETTINGS)),
]


def _request_ip(request: Request) -> str | None:
    return request.client.host if request.client is not None else None


@router.get("", response_model=list[ApplicationRead])
async def list_applications(
    principal: CurrentUser,
    db: DatabaseSession,
    include_archived: Annotated[bool, Query()] = False,
) -> list[ApplicationRead]:
    applications = await application_registry_service.list_for_user(
        db,
        principal,
        include_archived=include_archived,
    )
    return [ApplicationRead.model_validate(application) for application in applications]


@router.post("", response_model=ApplicationCreated, status_code=status.HTTP_201_CREATED)
async def create_application(
    payload: ApplicationCreate,
    request: Request,
    principal: CurrentUser,
    db: DatabaseSession,
) -> ApplicationCreated:
    application, credential = await application_registry_service.create(
        db,
        principal,
        payload,
        correlation_id=request.headers.get("X-Correlation-ID"),
        ip_address=_request_ip(request),
    )
    return ApplicationCreated(
        application=ApplicationRead.model_validate(application),
        credential=credential,
    )


@router.get("/{app_id}", response_model=ApplicationRead)
async def get_application(authorization: ViewApplication) -> ApplicationRead:
    return ApplicationRead.model_validate(authorization.application)


@router.post("/{app_id}/archive", response_model=ApplicationArchived)
async def archive_application(
    request: Request,
    authorization: ManageApplication,
    db: DatabaseSession,
) -> ApplicationArchived:
    application = await application_registry_service.archive(
        db,
        authorization.principal,
        authorization.application,
        correlation_id=request.headers.get("X-Correlation-ID"),
        ip_address=_request_ip(request),
    )
    return ApplicationArchived(application=ApplicationRead.model_validate(application))


__all__ = ["router"]
