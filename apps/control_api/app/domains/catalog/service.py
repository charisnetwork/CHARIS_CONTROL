from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AppFeature,
    AuditLog,
    CouponPlan,
    LimitType,
    NotificationPlanAudience,
    PlanEntitlement,
    PlanStatus,
    PlanUiConfig,
    PlanUiItem,
    Subscription,
    SubscriptionPlan,
    WebhookEvent,
)
from app.domains.catalog.schemas import EntitlementInput, FeatureCreate, PlanCreate, PlanUpdate


def _audit(
    *,
    application_id: uuid.UUID,
    principal: AuthenticatedUser,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    correlation_id: str,
    after: dict[str, object],
) -> AuditLog:
    return AuditLog(
        application_id=application_id,
        actor_user_id=principal.user.id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        correlation_id=correlation_id,
        after_summary=after,
    )


def _event(
    *,
    application_id: uuid.UUID,
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, object],
) -> WebhookEvent:
    now = datetime.now(UTC)
    return WebhookEvent(
        application_id=application_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=str(aggregate_id),
        payload=payload,
        idempotency_key=f"{event_type}:{aggregate_id}:{uuid.uuid4()}",
        occurred_at=now,
    )


class CatalogService:
    async def list_features(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[AppFeature]:
        result = await db.scalars(
            select(AppFeature)
            .where(AppFeature.application_id == application_id, AppFeature.active.is_(True))
            .order_by(AppFeature.name, AppFeature.id)
        )
        return list(result.all())

    async def create_feature(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: FeatureCreate,
        correlation_id: str,
    ) -> AppFeature:
        feature = AppFeature(
            id=uuid.uuid4(),
            application_id=application_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            default_unit=payload.default_unit,
            allowed_reset_periods=[period.value for period in payload.allowed_reset_periods],
            supports_numeric_limit=payload.supports_numeric_limit,
            active=True,
        )
        db.add_all(
            [
                feature,
                _audit(
                    application_id=application_id,
                    principal=principal,
                    action="feature.created",
                    entity_type="app_feature",
                    entity_id=feature.id,
                    correlation_id=correlation_id,
                    after={"code": feature.code, "name": feature.name},
                ),
                _event(
                    application_id=application_id,
                    event_type="feature.catalog.changed",
                    aggregate_type="app_feature",
                    aggregate_id=feature.id,
                    payload={"feature_id": str(feature.id), "code": feature.code},
                ),
            ]
        )
        await self._commit_unique(db, "A feature with this code already exists")
        return feature

    async def list_plans(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[tuple[SubscriptionPlan, list[PlanEntitlement]]]:
        plans = list(
            (
                await db.scalars(
                    select(SubscriptionPlan)
                    .where(
                        SubscriptionPlan.application_id == application_id,
                        SubscriptionPlan.status != PlanStatus.ARCHIVED,
                    )
                    .order_by(SubscriptionPlan.price, SubscriptionPlan.name)
                )
            ).all()
        )
        if not plans:
            return []
        plan_ids = [plan.id for plan in plans]
        entitlements = list(
            (
                await db.scalars(
                    select(PlanEntitlement)
                    .where(
                        PlanEntitlement.application_id == application_id,
                        PlanEntitlement.plan_id.in_(plan_ids),
                    )
                    .order_by(PlanEntitlement.plan_id, PlanEntitlement.feature_id)
                )
            ).all()
        )
        by_plan: dict[uuid.UUID, list[PlanEntitlement]] = {plan_id: [] for plan_id in plan_ids}
        for entitlement in entitlements:
            by_plan[entitlement.plan_id].append(entitlement)
        return [(plan, by_plan[plan.id]) for plan in plans]

    async def get_plan(
        self, db: AsyncSession, *, application_id: uuid.UUID, plan_id: uuid.UUID
    ) -> tuple[SubscriptionPlan, list[PlanEntitlement]]:
        plan = await db.scalar(
            select(SubscriptionPlan).where(
                SubscriptionPlan.id == plan_id,
                SubscriptionPlan.application_id == application_id,
                SubscriptionPlan.status != PlanStatus.ARCHIVED,
            )
        )
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
        entitlements = list(
            (
                await db.scalars(
                    select(PlanEntitlement)
                    .where(
                        PlanEntitlement.plan_id == plan_id,
                        PlanEntitlement.application_id == application_id,
                    )
                    .order_by(PlanEntitlement.feature_id)
                )
            ).all()
        )
        return plan, entitlements

    async def create_plan(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: PlanCreate,
        correlation_id: str,
    ) -> tuple[SubscriptionPlan, list[PlanEntitlement]]:
        await self._validated_features(
            db, application_id=application_id, entitlements=payload.entitlements
        )
        plan = SubscriptionPlan(
            id=uuid.uuid4(),
            application_id=application_id,
            name=payload.name,
            code=payload.code,
            description=payload.description,
            price=payload.price,
            currency=payload.currency,
            duration_value=payload.duration_value,
            duration_unit=payload.duration_unit,
            coupons_allowed=payload.coupons_allowed,
            user_limit=payload.user_limit,
            user_limit_unlimited=payload.user_limit_unlimited,
            status=payload.status,
            effective_at=payload.effective_at,
        )
        entitlement_models = self._entitlement_models(
            application_id=application_id,
            plan_id=plan.id,
            payloads=payload.entitlements,
        )
        # Persist the parent before its entitlements; these models have no ORM
        # relationships to order their inserts. Keep both in one transaction.
        db.add(plan)
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A plan with this name or code already exists",
            ) from exc
        db.add_all(
            [
                *entitlement_models,
                _audit(
                    application_id=application_id,
                    principal=principal,
                    action="plan.created",
                    entity_type="subscription_plan",
                    entity_id=plan.id,
                    correlation_id=correlation_id,
                    after={
                        "code": plan.code,
                        "status": plan.status.value,
                        "entitlement_count": len(entitlement_models),
                    },
                ),
                _event(
                    application_id=application_id,
                    event_type="plan.created",
                    aggregate_type="subscription_plan",
                    aggregate_id=plan.id,
                    payload={"plan_id": str(plan.id), "code": plan.code},
                ),
            ]
        )
        await self._commit_unique(db, "A plan with this name or code already exists")
        return plan, entitlement_models

    async def _locked_plan(
        self, db: AsyncSession, *, application_id: uuid.UUID, plan_id: uuid.UUID
    ) -> SubscriptionPlan:
        plan = await db.scalar(
            select(SubscriptionPlan)
            .where(
                SubscriptionPlan.id == plan_id,
                SubscriptionPlan.application_id == application_id,
            )
            .with_for_update()
        )
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
        return plan

    async def _hide_from_storefront(
        self, db: AsyncSession, *, application_id: uuid.UUID, plan_id: uuid.UUID
    ) -> None:
        await db.execute(
            update(PlanUiItem)
            .where(PlanUiItem.application_id == application_id, PlanUiItem.plan_id == plan_id)
            .values(visible=False)
        )
        await db.execute(
            update(PlanUiConfig)
            .where(
                PlanUiConfig.application_id == application_id,
                PlanUiConfig.recommended_plan_id == plan_id,
            )
            .values(recommended_plan_id=None)
        )

    async def update_plan(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        plan_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: PlanUpdate,
        correlation_id: str,
    ) -> tuple[SubscriptionPlan, list[PlanEntitlement]]:
        plan = await self._locked_plan(db, application_id=application_id, plan_id=plan_id)
        if plan.version != payload.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Plan was changed by someone else; reload and retry",
            )
        if plan.status == PlanStatus.ARCHIVED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Archived plans cannot be edited"
            )
        changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
        for field in ("name", "price", "duration_value", "duration_unit", "coupons_allowed"):
            if field in changes and changes[field] is None:
                raise HTTPException(status_code=422, detail=f"{field} cannot be empty")
        if "user_limit" in changes or "user_limit_unlimited" in changes:
            unlimited = bool(changes.get("user_limit_unlimited", plan.user_limit_unlimited))
            limit = changes.get("user_limit", None if unlimited else plan.user_limit)
            if unlimited == (limit is not None):
                raise HTTPException(
                    status_code=422,
                    detail="Define either a limited user_limit or user_limit_unlimited",
                )
            changes["user_limit"], changes["user_limit_unlimited"] = limit, unlimited
        new_status = changes.get("status", plan.status)
        effective_at = changes.get("effective_at", plan.effective_at)
        if new_status == PlanStatus.ACTIVE and effective_at is None:
            raise HTTPException(status_code=422, detail="Active plans require effective_at")
        before = {"price": str(plan.price), "status": plan.status.value, "name": plan.name}
        for field, value in changes.items():
            setattr(plan, field, value)
        if new_status == PlanStatus.ARCHIVED:
            plan.archived_at = datetime.now(UTC)
            await self._hide_from_storefront(db, application_id=application_id, plan_id=plan_id)
        plan.version += 1
        db.add_all(
            [
                _audit(
                    application_id=application_id,
                    principal=principal,
                    action="plan.updated",
                    entity_type="subscription_plan",
                    entity_id=plan.id,
                    correlation_id=correlation_id,
                    after={
                        "before": before,
                        "changed": sorted(changes),
                        "version": plan.version,
                    },
                ),
                _event(
                    application_id=application_id,
                    event_type="plan.archived"
                    if new_status == PlanStatus.ARCHIVED
                    else "plan.updated",
                    aggregate_type="subscription_plan",
                    aggregate_id=plan.id,
                    payload={"plan_id": str(plan.id), "version": plan.version},
                ),
            ]
        )
        await self._commit_unique(db, "A plan with this name already exists")
        await db.refresh(plan)
        entitlements = (
            await db.scalars(
                select(PlanEntitlement)
                .where(
                    PlanEntitlement.plan_id == plan_id,
                    PlanEntitlement.application_id == application_id,
                )
                .order_by(PlanEntitlement.feature_id)
            )
        ).all()
        return plan, list(entitlements)

    async def delete_plan(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        plan_id: uuid.UUID,
        principal: AuthenticatedUser,
        correlation_id: str,
    ) -> None:
        """Delete a never-used plan. Plans with customers or references must be archived."""
        plan = await self._locked_plan(db, application_id=application_id, plan_id=plan_id)
        for model in (Subscription, CouponPlan, NotificationPlanAudience):
            used = await db.scalar(
                select(func.count())
                .select_from(model)
                .where(model.application_id == application_id, model.plan_id == plan_id)
            )
            if used:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This plan is used by customers, coupons or notifications; "
                    "archive it instead",
                )
        await self._hide_from_storefront(db, application_id=application_id, plan_id=plan_id)
        for owned in (PlanUiItem, PlanEntitlement):
            await db.execute(
                delete(owned).where(
                    owned.application_id == application_id, owned.plan_id == plan_id
                )
            )
        await db.delete(plan)
        db.add_all(
            [
                _audit(
                    application_id=application_id,
                    principal=principal,
                    action="plan.deleted",
                    entity_type="subscription_plan",
                    entity_id=plan_id,
                    correlation_id=correlation_id,
                    after={"code": plan.code, "name": plan.name},
                ),
                _event(
                    application_id=application_id,
                    event_type="plan.deleted",
                    aggregate_type="subscription_plan",
                    aggregate_id=plan_id,
                    payload={"plan_id": str(plan_id)},
                ),
            ]
        )
        await db.commit()

    async def replace_entitlements(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        plan_id: uuid.UUID,
        principal: AuthenticatedUser,
        payloads: list[EntitlementInput],
        correlation_id: str,
    ) -> tuple[SubscriptionPlan, list[PlanEntitlement]]:
        plan = await db.scalar(
            select(SubscriptionPlan)
            .where(
                SubscriptionPlan.id == plan_id,
                SubscriptionPlan.application_id == application_id,
                SubscriptionPlan.status != PlanStatus.ARCHIVED,
            )
            .with_for_update()
        )
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
        await self._validated_features(db, application_id=application_id, entitlements=payloads)
        await db.execute(
            delete(PlanEntitlement).where(
                PlanEntitlement.application_id == application_id,
                PlanEntitlement.plan_id == plan_id,
            )
        )
        entitlements = self._entitlement_models(
            application_id=application_id,
            plan_id=plan_id,
            payloads=payloads,
        )
        plan.version += 1
        db.add_all(
            [
                *entitlements,
                _audit(
                    application_id=application_id,
                    principal=principal,
                    action="plan.entitlements.replaced",
                    entity_type="subscription_plan",
                    entity_id=plan.id,
                    correlation_id=correlation_id,
                    after={"entitlement_count": len(entitlements), "version": plan.version},
                ),
                _event(
                    application_id=application_id,
                    event_type="plan.entitlements.changed",
                    aggregate_type="subscription_plan",
                    aggregate_id=plan.id,
                    payload={"plan_id": str(plan.id), "version": plan.version},
                ),
            ]
        )
        await db.commit()
        return plan, entitlements

    async def _validated_features(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        entitlements: list[EntitlementInput],
    ) -> dict[uuid.UUID, AppFeature]:
        if not entitlements:
            return {}
        feature_ids = {item.feature_id for item in entitlements}
        features = list(
            (
                await db.scalars(
                    select(AppFeature).where(
                        AppFeature.application_id == application_id,
                        AppFeature.id.in_(feature_ids),
                        AppFeature.active.is_(True),
                    )
                )
            ).all()
        )
        by_id = {feature.id: feature for feature in features}
        if set(by_id) != feature_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Every entitlement feature must belong to the selected application",
            )
        for item in entitlements:
            feature = by_id[item.feature_id]
            if item.enabled and item.limit_type == LimitType.LIMITED:
                if not feature.supports_numeric_limit:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Feature {feature.code} does not support numerical limits",
                    )
                if (
                    item.reset_period
                    and item.reset_period.value not in feature.allowed_reset_periods
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Reset period is not allowed for feature {feature.code}",
                    )
                if feature.default_unit and item.unit != feature.default_unit:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Unit must be {feature.default_unit} for feature {feature.code}",
                    )
        return by_id

    @staticmethod
    def _entitlement_models(
        *,
        application_id: uuid.UUID,
        plan_id: uuid.UUID,
        payloads: list[EntitlementInput],
    ) -> list[PlanEntitlement]:
        return [
            PlanEntitlement(
                id=uuid.uuid4(),
                application_id=application_id,
                plan_id=plan_id,
                feature_id=item.feature_id,
                enabled=item.enabled,
                limit_type=item.limit_type,
                limit_value=item.limit_value,
                unit=item.unit,
                reset_period=item.reset_period,
            )
            for item in payloads
        ]

    @staticmethod
    async def _commit_unique(db: AsyncSession, detail: str) -> None:
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc


catalog_service = CatalogService()


__all__ = ["CatalogService", "catalog_service"]
