from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    Affiliate,
    AffiliateCommission,
    AffiliateStatus,
    AuditLog,
    CommissionEntryType,
    WebhookEvent,
)
from app.domains.affiliates.schemas import AffiliateCreate, CommissionEntryCreate


def _audit(
    application_id: uuid.UUID,
    principal: AuthenticatedUser,
    action: str,
    entity_id: uuid.UUID,
    correlation_id: str,
    after: dict[str, object],
) -> AuditLog:
    return AuditLog(
        application_id=application_id,
        actor_user_id=principal.user.id,
        action=action,
        entity_type="affiliate",
        entity_id=str(entity_id),
        correlation_id=correlation_id,
        after_summary=after,
    )


class AffiliateService:
    async def list_affiliates(
        self, db: AsyncSession, *, application_id: uuid.UUID
    ) -> list[Affiliate]:
        rows = await db.scalars(
            select(Affiliate)
            .where(
                Affiliate.application_id == application_id,
                Affiliate.status != AffiliateStatus.ARCHIVED,
            )
            .order_by(Affiliate.contact_name, Affiliate.id)
        )
        return list(rows.all())

    async def create_affiliate(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: AffiliateCreate,
        correlation_id: str,
    ) -> Affiliate:
        affiliate = Affiliate(
            id=uuid.uuid4(),
            application_id=application_id,
            company_name=payload.company_name,
            contact_name=payload.contact_name,
            mobile_number=payload.mobile_number,
            email=str(payload.email).casefold(),
            tax_registration_number=payload.tax_registration_number,
            address=payload.address,
            notes=payload.notes,
            status=AffiliateStatus.ACTIVE,
        )
        db.add_all(
            [
                affiliate,
                _audit(
                    application_id,
                    principal,
                    "affiliate.created",
                    affiliate.id,
                    correlation_id,
                    {"email": affiliate.email},
                ),
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=application_id,
                    event_type="affiliate.created",
                    aggregate_type="affiliate",
                    aggregate_id=str(affiliate.id),
                    payload={"affiliate_id": str(affiliate.id)},
                    idempotency_key=f"affiliate.created:{affiliate.id}",
                    occurred_at=datetime.now(UTC),
                ),
            ]
        )
        await self._commit(db, "An affiliate with this email already exists")
        return affiliate

    async def update_status(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        affiliate_id: uuid.UUID,
        new_status: AffiliateStatus,
        principal: AuthenticatedUser,
        correlation_id: str,
    ) -> Affiliate:
        affiliate = await db.scalar(
            select(Affiliate)
            .where(
                Affiliate.application_id == application_id,
                Affiliate.id == affiliate_id,
            )
            .with_for_update()
        )
        if affiliate is None:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        affiliate.status = new_status
        affiliate.archived_at = (
            datetime.now(UTC) if new_status == AffiliateStatus.ARCHIVED else None
        )
        affiliate.version += 1
        db.add(
            _audit(
                application_id,
                principal,
                "affiliate.status_changed",
                affiliate.id,
                correlation_id,
                {"status": new_status.value},
            )
        )
        await db.commit()
        return affiliate

    async def list_commissions(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        affiliate_id: uuid.UUID,
    ) -> list[AffiliateCommission]:
        await self._require_affiliate(db, application_id, affiliate_id)
        rows = await db.scalars(
            select(AffiliateCommission)
            .where(
                AffiliateCommission.application_id == application_id,
                AffiliateCommission.affiliate_id == affiliate_id,
            )
            .order_by(AffiliateCommission.occurred_at.desc(), AffiliateCommission.id)
        )
        return list(rows.all())

    async def commission_summary(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        affiliate_id: uuid.UUID,
    ) -> list[tuple[str, Decimal, Decimal, Decimal]]:
        await self._require_affiliate(db, application_id, affiliate_id)
        rows = (
            await db.execute(
                select(
                    AffiliateCommission.currency,
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type == CommissionEntryType.EARNED,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type == CommissionEntryType.PAID,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type
                                    == CommissionEntryType.ADJUSTMENT,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                )
                .where(
                    AffiliateCommission.application_id == application_id,
                    AffiliateCommission.affiliate_id == affiliate_id,
                )
                .group_by(AffiliateCommission.currency)
            )
        ).all()
        return [
            (currency, Decimal(earned), Decimal(paid), Decimal(adjustments))
            for currency, earned, paid, adjustments in rows
        ]

    async def create_commission_entry(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        affiliate_id: uuid.UUID,
        principal: AuthenticatedUser,
        payload: CommissionEntryCreate,
        correlation_id: str,
    ) -> AffiliateCommission:
        affiliate = await db.scalar(
            select(Affiliate)
            .where(Affiliate.application_id == application_id, Affiliate.id == affiliate_id)
            .with_for_update()
        )
        if affiliate is None or affiliate.status == AffiliateStatus.ARCHIVED:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        existing = await db.scalar(
            select(AffiliateCommission).where(
                AffiliateCommission.application_id == application_id,
                AffiliateCommission.reference == payload.reference,
                AffiliateCommission.entry_type == payload.entry_type,
            )
        )
        if existing is not None:
            if (
                existing.affiliate_id != affiliate_id
                or existing.amount != payload.amount
                or existing.currency != payload.currency
            ):
                raise HTTPException(status_code=409, detail="Commission reference was reused")
            return existing
        if payload.entry_type == CommissionEntryType.PAID:
            totals = await db.execute(
                select(
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type == CommissionEntryType.EARNED,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type == CommissionEntryType.PAID,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    AffiliateCommission.entry_type
                                    == CommissionEntryType.ADJUSTMENT,
                                    AffiliateCommission.amount,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                ).where(
                    AffiliateCommission.application_id == application_id,
                    AffiliateCommission.affiliate_id == affiliate_id,
                    AffiliateCommission.currency == payload.currency,
                )
            )
            earned, paid, adjustments = totals.one()
            available = Decimal(earned) + Decimal(adjustments) - Decimal(paid)
            if payload.amount > available:
                raise HTTPException(
                    status_code=422,
                    detail="Payout exceeds the affiliate's available currency balance",
                )
        entry = AffiliateCommission(
            id=uuid.uuid4(),
            application_id=application_id,
            affiliate_id=affiliate_id,
            redemption_id=None,
            entry_type=payload.entry_type,
            amount=payload.amount,
            currency=payload.currency,
            reference=payload.reference,
            notes=payload.notes,
            occurred_at=payload.occurred_at,
        )
        db.add_all(
            [
                entry,
                _audit(
                    application_id,
                    principal,
                    "affiliate.commission_recorded",
                    affiliate_id,
                    correlation_id,
                    {
                        "entry_type": payload.entry_type.value,
                        "amount": str(payload.amount),
                        "currency": payload.currency,
                    },
                ),
            ]
        )
        await self._commit(db, "Commission reference already exists")
        return entry

    @staticmethod
    async def _require_affiliate(
        db: AsyncSession, application_id: uuid.UUID, affiliate_id: uuid.UUID
    ) -> None:
        found = await db.scalar(
            select(Affiliate.id).where(
                Affiliate.application_id == application_id, Affiliate.id == affiliate_id
            )
        )
        if found is None:
            raise HTTPException(status_code=404, detail="Affiliate not found")

    @staticmethod
    async def _commit(db: AsyncSession, detail: str) -> None:
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=409, detail=detail) from exc


affiliate_service = AffiliateService()

__all__ = ["AffiliateService", "affiliate_service"]
