from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AppCredential,
    Application,
    ApplicationStatus,
    AuditLog,
    CredentialStatus,
    UserAppPermission,
    UserRole,
)
from app.domains.applications.schemas import ApplicationCreate, IssuedCredential


def _as_storage_url(value: object | None) -> str | None:
    if value is None:
        return None
    return str(value).rstrip("/")


def _correlation_id(value: str | None) -> str:
    candidate = (value or "").strip()
    if (
        candidate
        and len(candidate) <= 100
        and all(character.isalnum() or character in "-_.:" for character in candidate)
    ):
        return candidate
    return str(uuid.uuid4())


def _client_ip(value: str | None) -> str | None:
    if value is None:
        return None
    return value[:64]


class ApplicationRegistryService:
    async def list_for_user(
        self,
        db: AsyncSession,
        principal: AuthenticatedUser,
        *,
        include_archived: bool = False,
    ) -> list[Application]:
        statement = select(Application)
        if not include_archived:
            statement = statement.where(Application.status != ApplicationStatus.ARCHIVED)

        if principal.user.role != UserRole.OWNER:
            has_assignment = exists(
                select(UserAppPermission.application_id).where(
                    UserAppPermission.user_id == principal.user.id,
                    UserAppPermission.application_id == Application.id,
                )
            )
            statement = statement.where(has_assignment)

        result = await db.scalars(statement.order_by(Application.name, Application.id))
        return list(result.unique().all())

    async def create(
        self,
        db: AsyncSession,
        principal: AuthenticatedUser,
        payload: ApplicationCreate,
        *,
        correlation_id: str | None,
        ip_address: str | None,
    ) -> tuple[Application, IssuedCredential]:
        if principal.user.role != UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Owner role is required to register an application",
            )

        now = datetime.now(UTC)
        application = Application(
            id=uuid.uuid4(),
            name=payload.name,
            slug=payload.slug,
            logo_url=_as_storage_url(payload.logo_url),
            frontend_url=_as_storage_url(payload.frontend_url),
            control_api_base_url=_as_storage_url(payload.control_api_base_url),
            health_path=payload.health_path,
            environment=payload.environment,
            status=ApplicationStatus.ACTIVE,
            integration_config=dict(payload.integration_config),
        )

        key_prefix = f"cc_{secrets.token_hex(6)}"
        plaintext_credential = f"{key_prefix}.{secrets.token_urlsafe(32)}"
        credential = AppCredential(
            id=uuid.uuid4(),
            application_id=application.id,
            credential_type="control_api_key",
            key_prefix=key_prefix,
            secret_hash=hashlib.sha256(plaintext_credential.encode("utf-8")).hexdigest(),
            encrypted_secret_reference=None,
            credential_version=1,
            status=CredentialStatus.ACTIVE,
            valid_from=now,
        )
        audit_log = AuditLog(
            application_id=application.id,
            actor_user_id=principal.user.id,
            action="application.created",
            entity_type="application",
            entity_id=str(application.id),
            correlation_id=_correlation_id(correlation_id),
            before_summary=None,
            after_summary={
                "name": application.name,
                "slug": application.slug,
                "environment": application.environment.value,
                "status": application.status.value,
                "credential_type": credential.credential_type,
                "credential_version": credential.credential_version,
                "key_prefix": credential.key_prefix,
            },
            ip_address=_client_ip(ip_address),
        )

        try:
            db.add(application)
            flush = getattr(db, "flush", None)
            if flush is not None:
                await flush()
            db.add_all([credential, audit_log])
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An application with this slug already exists",
            ) from exc

        return application, IssuedCredential(
            credential_type=credential.credential_type,
            key_prefix=credential.key_prefix,
            credential_version=credential.credential_version,
            secret=plaintext_credential,
            valid_from=now,
        )

    async def archive(
        self,
        db: AsyncSession,
        principal: AuthenticatedUser,
        application: Application,
        *,
        correlation_id: str | None,
        ip_address: str | None,
    ) -> Application:
        if principal.user.role != UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Owner role is required to archive an application",
            )

        locked_application = await db.scalar(
            select(Application).where(Application.id == application.id).with_for_update()
        )
        if locked_application is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found",
            )
        application = locked_application

        if application.status == ApplicationStatus.ARCHIVED:
            return application

        before = {
            "status": application.status.value,
            "archived_at": application.archived_at.isoformat()
            if application.archived_at is not None
            else None,
            "version": application.version,
        }
        application.status = ApplicationStatus.ARCHIVED
        application.archived_at = datetime.now(UTC)
        application.version += 1
        audit_log = AuditLog(
            application_id=application.id,
            actor_user_id=principal.user.id,
            action="application.archived",
            entity_type="application",
            entity_id=str(application.id),
            correlation_id=_correlation_id(correlation_id),
            before_summary=before,
            after_summary={
                "status": application.status.value,
                "archived_at": application.archived_at.isoformat(),
                "version": application.version,
            },
            ip_address=_client_ip(ip_address),
        )
        db.add(audit_log)
        await db.commit()
        return application


application_registry_service = ApplicationRegistryService()


__all__ = ["ApplicationRegistryService", "application_registry_service"]
