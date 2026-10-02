from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission, ControlUser
from app.domains.governance.schemas import (
    AuditLogRead,
    TeamMemberCreate,
    TeamMemberRead,
    TeamPermissionUpdate,
)
from app.domains.governance.service import governance_service

router = APIRouter(prefix="/apps/{app_id}", tags=["team and audit"])
ViewSettings = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_SETTINGS))
]
ManageSettings = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_SETTINGS))
]
ViewAudit = Annotated[AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_AUDIT))]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


def _member(user: ControlUser, permissions: list[AppPermission]) -> TeamMemberRead:
    return TeamMemberRead.model_validate(
        {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "status": user.status,
            "permissions": permissions,
        }
    )


@router.get("/team", response_model=list[TeamMemberRead])
async def list_team(authorization: ViewSettings, db: DatabaseSession) -> list[TeamMemberRead]:
    rows = await governance_service.list_team(db, application_id=authorization.application_id)
    return [_member(user, permissions) for user, permissions in rows]


@router.post("/team", response_model=TeamMemberRead, status_code=status.HTTP_201_CREATED)
async def create_team_member(
    payload: TeamMemberCreate,
    request: Request,
    authorization: ManageSettings,
    db: DatabaseSession,
) -> TeamMemberRead:
    user, permissions = await governance_service.create_team_member(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return _member(user, permissions)


@router.put("/team/{user_id}/permissions", response_model=TeamMemberRead)
async def replace_team_permissions(
    user_id: uuid.UUID,
    payload: TeamPermissionUpdate,
    request: Request,
    authorization: ManageSettings,
    db: DatabaseSession,
) -> TeamMemberRead:
    user, permissions = await governance_service.replace_permissions(
        db,
        application_id=authorization.application_id,
        user_id=user_id,
        principal=authorization.principal,
        permissions=payload.permissions,
        correlation_id=_correlation_id(request),
    )
    return _member(user, permissions)


@router.get("/audit", response_model=list[AuditLogRead])
async def list_audit_logs(
    authorization: ViewAudit,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AuditLogRead]:
    rows = await governance_service.audit_logs(
        db, application_id=authorization.application_id, limit=limit, offset=offset
    )
    return [AuditLogRead.model_validate(row) for row in rows]


__all__ = ["router"]
