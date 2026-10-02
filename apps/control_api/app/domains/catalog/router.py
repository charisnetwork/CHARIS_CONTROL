from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.db.models import AppPermission, PlanEntitlement, SubscriptionPlan
from app.domains.catalog.schemas import (
    EntitlementRead,
    EntitlementSet,
    FeatureCreate,
    FeatureRead,
    PlanCreate,
    PlanRead,
)
from app.domains.catalog.service import catalog_service

router = APIRouter(prefix="/apps/{app_id}", tags=["feature catalog and plans"])
ViewPlans = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.VIEW_PLANS)),
]
ManagePlans = Annotated[
    AppAuthorization,
    Depends(require_app_permission(AppPermission.MANAGE_PLANS)),
]


def _correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, str) else str(uuid.uuid4())


def _plan_response(plan: SubscriptionPlan, entitlements: list[PlanEntitlement]) -> PlanRead:
    response = PlanRead.model_validate(plan)
    return response.model_copy(
        update={"entitlements": [EntitlementRead.model_validate(item) for item in entitlements]}
    )


@router.get("/features", response_model=list[FeatureRead])
async def list_features(
    authorization: ViewPlans,
    db: DatabaseSession,
) -> list[FeatureRead]:
    features = await catalog_service.list_features(db, application_id=authorization.application_id)
    return [FeatureRead.model_validate(feature) for feature in features]


@router.post("/features", response_model=FeatureRead, status_code=status.HTTP_201_CREATED)
async def create_feature(
    payload: FeatureCreate,
    request: Request,
    authorization: ManagePlans,
    db: DatabaseSession,
) -> FeatureRead:
    feature = await catalog_service.create_feature(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return FeatureRead.model_validate(feature)


@router.get("/plans", response_model=list[PlanRead])
async def list_plans(
    authorization: ViewPlans,
    db: DatabaseSession,
) -> list[PlanRead]:
    plans = await catalog_service.list_plans(db, application_id=authorization.application_id)
    return [_plan_response(plan, entitlements) for plan, entitlements in plans]


@router.post("/plans", response_model=PlanRead, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: PlanCreate,
    request: Request,
    authorization: ManagePlans,
    db: DatabaseSession,
) -> PlanRead:
    plan, entitlements = await catalog_service.create_plan(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=_correlation_id(request),
    )
    return _plan_response(plan, entitlements)


@router.get("/plans/{plan_id}", response_model=PlanRead)
async def get_plan(
    plan_id: uuid.UUID,
    authorization: ViewPlans,
    db: DatabaseSession,
) -> PlanRead:
    plan, entitlements = await catalog_service.get_plan(
        db,
        application_id=authorization.application_id,
        plan_id=plan_id,
    )
    return _plan_response(plan, entitlements)


@router.put("/plans/{plan_id}/entitlements", response_model=PlanRead)
async def replace_entitlements(
    plan_id: uuid.UUID,
    payload: EntitlementSet,
    request: Request,
    authorization: ManagePlans,
    db: DatabaseSession,
) -> PlanRead:
    plan, entitlements = await catalog_service.replace_entitlements(
        db,
        application_id=authorization.application_id,
        plan_id=plan_id,
        principal=authorization.principal,
        payloads=payload.entitlements,
        correlation_id=_correlation_id(request),
    )
    return _plan_response(plan, entitlements)


__all__ = ["router"]
