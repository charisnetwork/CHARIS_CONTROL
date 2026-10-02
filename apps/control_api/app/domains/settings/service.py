from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AppCredential,
    Application,
    AuditLog,
    CredentialStatus,
    HealthCheck,
    PlanStatus,
    PlanUiConfig,
    PlanUiItem,
    SubscriptionPlan,
)
from app.domains.applications.schemas import IssuedCredential
from app.domains.settings.schemas import (
    ApplicationSettingsUpdate,
    HealthReportCreate,
    PlanUiSettingsUpdate,
)


def _url(value: object | None) -> str | None:
    return str(value).rstrip("/") if value is not None else None


def _audit(
    app_id: uuid.UUID,
    principal: AuthenticatedUser,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    correlation_id: str,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
) -> AuditLog:
    return AuditLog(
        application_id=app_id,
        actor_user_id=principal.user.id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        correlation_id=correlation_id,
        before_summary=before,
        after_summary=after,
    )


class SettingsService:
    async def update_application(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: ApplicationSettingsUpdate,
        correlation_id: str,
    ) -> Application:
        application = await db.scalar(
            select(Application).where(Application.id == application_id).with_for_update()
        )
        if application is None:
            raise HTTPException(status_code=404, detail="Application not found")
        before: dict[str, object] = {
            "name": application.name,
            "frontend_url": application.frontend_url,
            "control_api_base_url": application.control_api_base_url,
            "health_path": application.health_path,
            "environment": application.environment.value,
            "version": application.version,
        }
        application.name = payload.name
        application.logo_url = _url(payload.logo_url)
        application.frontend_url = _url(payload.frontend_url)
        application.control_api_base_url = _url(payload.control_api_base_url) or ""
        application.health_path = payload.health_path
        application.environment = payload.environment
        application.integration_config = dict(payload.integration_config)
        application.version += 1
        db.add(
            _audit(
                application_id,
                principal,
                "application.settings_updated",
                "application",
                application.id,
                correlation_id,
                before,
                {"name": application.name, "version": application.version},
            )
        )
        await db.commit()
        return application

    async def list_credentials(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[AppCredential]:
        rows = await db.scalars(
            select(AppCredential)
            .where(AppCredential.application_id == application_id)
            .order_by(AppCredential.credential_version.desc())
        )
        return list(rows.all())

    async def rotate_credential(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        grace_hours: int,
        correlation_id: str,
    ) -> IssuedCredential:
        credentials = list(
            (
                await db.scalars(
                    select(AppCredential)
                    .where(
                        AppCredential.application_id == application_id,
                        AppCredential.credential_type == "control_api_key",
                    )
                    .with_for_update()
                )
            ).all()
        )
        now = datetime.now(UTC)
        for credential in credentials:
            if credential.status == CredentialStatus.ACTIVE:
                if grace_hours:
                    credential.status = CredentialStatus.GRACE
                    credential.grace_ends_at = now + timedelta(hours=grace_hours)
                else:
                    credential.status = CredentialStatus.REVOKED
                    credential.revoked_at = now
        version = max((item.credential_version for item in credentials), default=0) + 1
        prefix = f"cc_{secrets.token_hex(6)}"
        secret = f"{prefix}.{secrets.token_urlsafe(32)}"
        new_credential = AppCredential(
            id=uuid.uuid4(),
            application_id=application_id,
            credential_type="control_api_key",
            key_prefix=prefix,
            secret_hash=hashlib.sha256(secret.encode()).hexdigest(),
            encrypted_secret_reference=None,
            credential_version=version,
            status=CredentialStatus.ACTIVE,
            valid_from=now,
        )
        db.add_all(
            [
                new_credential,
                _audit(
                    application_id,
                    principal,
                    "application.credential_rotated",
                    "app_credential",
                    new_credential.id,
                    correlation_id,
                    None,
                    {
                        "key_prefix": prefix,
                        "credential_version": version,
                        "grace_hours": grace_hours,
                    },
                ),
            ]
        )
        await db.commit()
        return IssuedCredential(
            credential_type=new_credential.credential_type,
            key_prefix=prefix,
            credential_version=version,
            secret=secret,
            valid_from=now,
        )

    async def record_health(
        self, db: AsyncSession, *, application_id: uuid.UUID, payload: HealthReportCreate
    ) -> HealthCheck:
        health = HealthCheck(
            id=uuid.uuid4(),
            application_id=application_id,
            overall_status=payload.overall_status,
            frontend_status=payload.frontend_status,
            backend_status=payload.backend_status,
            database_status=payload.database_status,
            latency_ms=payload.latency_ms,
            dependencies=payload.dependencies,
            incident_summary=payload.incident_summary,
            checked_at=payload.checked_at,
        )
        db.add(health)
        await db.commit()
        return health

    async def list_health(
        self, db: AsyncSession, *, application_id: uuid.UUID, limit: int = 20
    ) -> list[HealthCheck]:
        rows = await db.scalars(
            select(HealthCheck)
            .where(HealthCheck.application_id == application_id)
            .order_by(HealthCheck.checked_at.desc())
            .limit(limit)
        )
        return list(rows.all())

    async def get_plan_ui(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> tuple[PlanUiConfig | None, list[PlanUiItem]]:
        config = await db.scalar(
            select(PlanUiConfig).where(PlanUiConfig.application_id == application_id)
        )
        if config is None:
            return None, []
        items = list(
            (
                await db.scalars(
                    select(PlanUiItem)
                    .where(
                        PlanUiItem.application_id == application_id,
                        PlanUiItem.config_id == config.id,
                    )
                    .order_by(PlanUiItem.display_order)
                )
            ).all()
        )
        return config, items

    async def update_plan_ui(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: PlanUiSettingsUpdate,
        correlation_id: str,
    ) -> tuple[PlanUiConfig, list[PlanUiItem]]:
        plan_ids = {item.plan_id for item in payload.items}
        if payload.recommended_plan_id is not None:
            plan_ids.add(payload.recommended_plan_id)
        if plan_ids:
            count = await db.scalar(
                select(func.count())
                .select_from(SubscriptionPlan)
                .where(
                    SubscriptionPlan.application_id == application_id,
                    SubscriptionPlan.id.in_(plan_ids),
                    SubscriptionPlan.status != PlanStatus.ARCHIVED,
                )
            )
            if count != len(plan_ids):
                raise HTTPException(
                    status_code=422, detail="Storefront plans must belong to this application"
                )
        config = await db.scalar(
            select(PlanUiConfig)
            .where(PlanUiConfig.application_id == application_id)
            .with_for_update()
        )
        if config is None:
            config = PlanUiConfig(id=uuid.uuid4(), application_id=application_id)
            db.add(config)
            await db.flush()
        else:
            config.version += 1
        config.recommended_plan_id = payload.recommended_plan_id
        config.show_feature_comparison = payload.show_feature_comparison
        config.show_billing_period_selector = payload.show_billing_period_selector
        config.display_labels = payload.display_labels
        await db.execute(
            delete(PlanUiItem).where(
                PlanUiItem.application_id == application_id, PlanUiItem.config_id == config.id
            )
        )
        items = [
            PlanUiItem(
                id=uuid.uuid4(),
                application_id=application_id,
                config_id=config.id,
                plan_id=item.plan_id,
                visible=item.visible,
                display_order=item.display_order,
                display_label=item.display_label,
            )
            for item in payload.items
        ]
        db.add_all(
            [
                *items,
                _audit(
                    application_id,
                    principal,
                    "subscription_storefront.updated",
                    "plan_ui_config",
                    config.id,
                    correlation_id,
                    None,
                    {"item_count": len(items), "version": config.version},
                ),
            ]
        )
        await db.commit()
        return config, items


settings_service = SettingsService()

__all__ = ["SettingsService", "settings_service"]
