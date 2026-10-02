from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.affiliates.schemas import (
    AffiliateCreate,
    AffiliateRead,
    AffiliateStatusUpdate,
    CommissionCurrencySummary,
    CommissionEntryCreate,
    CommissionEntryRead,
)
from app.domains.affiliates.service import affiliate_service

router = APIRouter(prefix="/apps/{app_id}/affiliates", tags=["affiliates"])
ViewAffiliates = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_AFFILIATES))
]
ManageAffiliates = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_AFFILIATES))
]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


@router.get("", response_model=list[AffiliateRead])
async def list_affiliates(
    authorization: ViewAffiliates, db: DatabaseSession
) -> list[AffiliateRead]:
    rows = await affiliate_service.list_affiliates(db, application_id=authorization.application_id)
    return [AffiliateRead.model_validate(row) for row in rows]


@router.post("", response_model=AffiliateRead, status_code=status.HTTP_201_CREATED)
async def create_affiliate(
    payload: AffiliateCreate,
    request: Request,
    authorization: ManageAffiliates,
    db: DatabaseSession,
) -> AffiliateRead:
    row = await affiliate_service.create_affiliate(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return AffiliateRead.model_validate(row)


@router.patch("/{affiliate_id}/status", response_model=AffiliateRead)
async def update_affiliate_status(
    affiliate_id: uuid.UUID,
    payload: AffiliateStatusUpdate,
    request: Request,
    authorization: ManageAffiliates,
    db: DatabaseSession,
) -> AffiliateRead:
    row = await affiliate_service.update_status(
        db,
        application_id=authorization.application_id,
        affiliate_id=affiliate_id,
        new_status=payload.status,
        principal=authorization.principal,
        correlation_id=_correlation_id(request),
    )
    return AffiliateRead.model_validate(row)


@router.get("/{affiliate_id}/commissions", response_model=list[CommissionEntryRead])
async def list_commissions(
    affiliate_id: uuid.UUID,
    authorization: ViewAffiliates,
    db: DatabaseSession,
) -> list[CommissionEntryRead]:
    rows = await affiliate_service.list_commissions(
        db, application_id=authorization.application_id, affiliate_id=affiliate_id
    )
    return [CommissionEntryRead.model_validate(row) for row in rows]


@router.get("/{affiliate_id}/commission-summary", response_model=list[CommissionCurrencySummary])
async def commission_summary(
    affiliate_id: uuid.UUID,
    authorization: ViewAffiliates,
    db: DatabaseSession,
) -> list[CommissionCurrencySummary]:
    rows = await affiliate_service.commission_summary(
        db, application_id=authorization.application_id, affiliate_id=affiliate_id
    )
    return [
        CommissionCurrencySummary(
            currency=currency,
            earned=earned,
            paid=paid,
            adjustments=adjustments,
            balance=earned + adjustments - paid,
        )
        for currency, earned, paid, adjustments in rows
    ]


@router.post(
    "/{affiliate_id}/commissions",
    response_model=CommissionEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_commission_entry(
    affiliate_id: uuid.UUID,
    payload: CommissionEntryCreate,
    request: Request,
    authorization: ManageAffiliates,
    db: DatabaseSession,
) -> CommissionEntryRead:
    row = await affiliate_service.create_commission_entry(
        db,
        application_id=authorization.application_id,
        affiliate_id=affiliate_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return CommissionEntryRead.model_validate(row)


__all__ = ["router"]
