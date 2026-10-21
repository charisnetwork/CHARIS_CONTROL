from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.users.schemas import (
    AccessState,
    RestoreRequest,
    RestrictRequest,
    UserDetail,
    UserPage,
)
from app.domains.users.service import user_directory_service

router = APIRouter(prefix="/apps/{app_id}/users", tags=["app users"])
ViewUsers = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_SUBSCRIBERS)),
]
ManageUsers = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.MANAGE_SUBSCRIBERS)),
]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


@router.get("", response_model=UserPage)
async def list_users(
    authorization: ViewUsers,
    db: DatabaseSession,
    q: Annotated[str | None, Query(max_length=120)] = None,
    access: AccessState | None = None,
    plan_id: uuid.UUID | None = None,
    coupon: Literal["used", "none"] | None = None,
    affiliate_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> UserPage:
    return await user_directory_service.list_users(
        db,
        application_id=authorization.application_id,
        query=q.strip() if q and q.strip() else None,
        access=access,
        plan_id=plan_id,
        coupon=coupon,
        affiliate_id=affiliate_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{user_id}", response_model=UserDetail)
async def get_user(user_id: uuid.UUID, authorization: ViewUsers, db: DatabaseSession) -> UserDetail:
    return await user_directory_service.get_user(
        db, application_id=authorization.application_id, user_id=user_id
    )


@router.post("/{user_id}/restrict", response_model=UserDetail)
async def restrict_user(
    user_id: uuid.UUID,
    payload: RestrictRequest,
    request: Request,
    authorization: ManageUsers,
    db: DatabaseSession,
) -> UserDetail:
    """Blocks the whole account in the app (sign-in, API and checkout) until restored."""
    return await user_directory_service.set_restriction(
        db,
        application_id=authorization.application_id,
        user_id=user_id,
        principal=authorization.principal,
        restrict=True,
        reason=payload.reason,
        correlation_id=_correlation_id(request),
    )


@router.post("/{user_id}/restore", response_model=UserDetail)
async def restore_user(
    user_id: uuid.UUID,
    payload: RestoreRequest,
    request: Request,
    authorization: ManageUsers,
    db: DatabaseSession,
) -> UserDetail:
    return await user_directory_service.set_restriction(
        db,
        application_id=authorization.application_id,
        user_id=user_id,
        principal=authorization.principal,
        restrict=False,
        reason=payload.note,
        correlation_id=_correlation_id(request),
    )


__all__ = ["router"]
