from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.core.security import hash_password, normalize_email
from app.db.models import (
    AppPermission,
    AuditLog,
    ControlUser,
    UserAppPermission,
    UserRole,
    UserStatus,
)
from app.domains.governance.schemas import TeamMemberCreate


def _require_owner(principal: AuthenticatedUser) -> None:
    if principal.user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Owner role is required")


class GovernanceService:
    async def list_team(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[tuple[ControlUser, list[AppPermission]]]:
        rows = (
            await db.execute(
                select(ControlUser, UserAppPermission.permission)
                .join(UserAppPermission, UserAppPermission.user_id == ControlUser.id)
                .where(UserAppPermission.application_id == application_id)
                .order_by(ControlUser.display_name, UserAppPermission.permission)
            )
        ).all()
        members: dict[uuid.UUID, tuple[ControlUser, list[AppPermission]]] = {}
        for user, permission in rows:
            members.setdefault(user.id, (user, []))[1].append(permission)
        return list(members.values())

    async def create_team_member(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: TeamMemberCreate,
        correlation_id: str,
    ) -> tuple[ControlUser, list[AppPermission]]:
        _require_owner(principal)
        user = ControlUser(
            id=uuid.uuid4(),
            email=normalize_email(str(payload.email)),
            display_name=" ".join(payload.display_name.split()),
            password_hash=hash_password(payload.password.get_secret_value()),
            role=UserRole.TEAM_MEMBER,
            status=UserStatus.ACTIVE,
        )
        grants = [
            UserAppPermission(
                user_id=user.id,
                application_id=application_id,
                permission=permission,
                granted_by_user_id=principal.user.id,
            )
            for permission in payload.permissions
        ]
        db.add_all(
            [
                user,
                *grants,
                AuditLog(
                    application_id=application_id,
                    actor_user_id=principal.user.id,
                    action="team_member.created",
                    entity_type="control_user",
                    entity_id=str(user.id),
                    correlation_id=correlation_id,
                    after_summary={
                        "email": user.email,
                        "permissions": [item.value for item in payload.permissions],
                    },
                ),
            ]
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=409, detail="A user with this email already exists"
            ) from exc
        return user, payload.permissions

    async def replace_permissions(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        user_id: uuid.UUID,
        principal: AuthenticatedUser,
        permissions: list[AppPermission],
        correlation_id: str,
    ) -> tuple[ControlUser, list[AppPermission]]:
        _require_owner(principal)
        user = await db.scalar(
            select(ControlUser)
            .where(ControlUser.id == user_id, ControlUser.role == UserRole.TEAM_MEMBER)
            .with_for_update()
        )
        if user is None:
            raise HTTPException(status_code=404, detail="Team member not found")
        await db.execute(
            delete(UserAppPermission).where(
                UserAppPermission.application_id == application_id,
                UserAppPermission.user_id == user_id,
            )
        )
        db.add_all(
            [
                *[
                    UserAppPermission(
                        user_id=user_id,
                        application_id=application_id,
                        permission=permission,
                        granted_by_user_id=principal.user.id,
                    )
                    for permission in permissions
                ],
                AuditLog(
                    application_id=application_id,
                    actor_user_id=principal.user.id,
                    action="team_member.permissions_replaced",
                    entity_type="control_user",
                    entity_id=str(user_id),
                    correlation_id=correlation_id,
                    after_summary={"permissions": [item.value for item in permissions]},
                ),
            ]
        )
        await db.commit()
        return user, permissions

    async def audit_logs(
        self, db: AsyncSession, *, application_id: uuid.UUID, limit: int, offset: int
    ) -> list[AuditLog]:
        rows = await db.scalars(
            select(AuditLog)
            .where(AuditLog.application_id == application_id)
            .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(rows.all())


governance_service = GovernanceService()

__all__ = ["GovernanceService", "governance_service"]
