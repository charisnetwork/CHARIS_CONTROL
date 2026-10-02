from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission
from app.domains.coupons.schemas import CouponCreate, CouponRead
from app.domains.coupons.service import coupon_service

router = APIRouter(prefix="/apps/{app_id}/coupons", tags=["coupons"])
ViewCoupons = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_COUPONS))
]
ManageCoupons = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_COUPONS))
]


def _read(coupon: object, plan_ids: list[uuid.UUID]) -> CouponRead:
    return CouponRead.model_validate({**coupon.__dict__, "plan_ids": plan_ids})


@router.get("", response_model=list[CouponRead])
async def list_coupons(authorization: ViewCoupons, db: DatabaseSession) -> list[CouponRead]:
    rows = await coupon_service.list_coupons(db, application_id=authorization.application_id)
    return [_read(coupon, plan_ids) for coupon, plan_ids in rows]


@router.post("", response_model=CouponRead, status_code=status.HTTP_201_CREATED)
async def create_coupon(
    payload: CouponCreate,
    request: Request,
    authorization: ManageCoupons,
    db: DatabaseSession,
) -> CouponRead:
    correlation_id = getattr(request.state, "correlation_id", str(uuid.uuid4()))
    coupon, plan_ids = await coupon_service.create_coupon(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=correlation_id,
    )
    return _read(coupon, plan_ids)


__all__ = ["router"]
