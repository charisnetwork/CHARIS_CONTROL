from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    Affiliate,
    AffiliateCommission,
    AuditLog,
    CommissionEntryType,
    Coupon,
    CouponRedemption,
    PaymentStatus,
    PaymentTransaction,
    ReportJob,
    ReportStatus,
    Subscriber,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    UsageCounter,
    UsageEvent,
)
from app.domains.reports.schemas import ExportReportType, ExportRequest, ReportRange

EXPORT_LIMIT = 10_000


def _in_range(column: Any, value: ReportRange) -> tuple[Any, Any]:
    return column >= value.starts_at, column < value.ends_at


def _safe_cell(value: object) -> object:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def render_csv(headers: list[str], rows: list[tuple[object, ...]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows([[_safe_cell(value) for value in row] for row in rows])
    return output.getvalue().encode("utf-8-sig")


class ReportService:
    async def summary(
        self, db: AsyncSession, *, application_id: uuid.UUID, report_range: ReportRange
    ) -> dict[str, object]:
        subscriber_count = await db.scalar(
            select(func.count())
            .select_from(Subscriber)
            .where(
                Subscriber.application_id == application_id,
                *_in_range(Subscriber.created_at, report_range),
            )
        )
        subscription_count = await db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(
                Subscription.application_id == application_id,
                *_in_range(Subscription.created_at, report_range),
            )
        )
        active_count = await db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(
                Subscription.application_id == application_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
        )
        redemption_count = await db.scalar(
            select(func.count())
            .select_from(CouponRedemption)
            .where(
                CouponRedemption.application_id == application_id,
                *_in_range(CouponRedemption.redeemed_at, report_range),
            )
        )
        usage_count = await db.scalar(
            select(func.count())
            .select_from(UsageEvent)
            .where(
                UsageEvent.application_id == application_id,
                *_in_range(UsageEvent.occurred_at, report_range),
            )
        )
        return {
            "starts_at": report_range.starts_at,
            "ends_at": report_range.ends_at,
            "new_subscribers": subscriber_count or 0,
            "new_subscriptions": subscription_count or 0,
            "active_subscriptions": active_count or 0,
            "coupon_redemptions": redemption_count or 0,
            "discount_total_by_currency": await self._currency_totals(
                db,
                application_id,
                CouponRedemption.currency,
                CouponRedemption.discount_amount,
                CouponRedemption.redeemed_at,
                CouponRedemption,
                report_range,
            ),
            "collected_revenue_by_currency": await self._currency_totals(
                db,
                application_id,
                PaymentTransaction.currency,
                PaymentTransaction.amount,
                PaymentTransaction.paid_at,
                PaymentTransaction,
                report_range,
                PaymentTransaction.status == PaymentStatus.SUCCEEDED,
            ),
            "earned_commission_by_currency": await self._currency_totals(
                db,
                application_id,
                AffiliateCommission.currency,
                AffiliateCommission.amount,
                AffiliateCommission.occurred_at,
                AffiliateCommission,
                report_range,
                AffiliateCommission.entry_type == CommissionEntryType.EARNED,
            ),
            "usage_events": usage_count or 0,
            "plan_distribution": await self._plan_distribution(db, application_id),
            "subscription_trend": await self._subscription_trend(db, application_id, report_range),
        }

    async def export(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        principal: AuthenticatedUser,
        request: ExportRequest,
        correlation_id: str,
    ) -> tuple[bytes, str, bool]:
        headers, statement = self._export_statement(application_id, request)
        rows = (await db.execute(statement.limit(EXPORT_LIMIT + 1))).all()
        truncated = len(rows) > EXPORT_LIMIT
        rows = rows[:EXPORT_LIMIT]
        now = datetime.now(UTC)
        job_id = uuid.uuid4()
        filename = f"{request.report_type.value}-{now:%Y%m%dT%H%M%SZ}.csv"
        db.add_all(
            [
                ReportJob(
                    id=job_id,
                    application_id=application_id,
                    report_type=request.report_type.value,
                    output_format="csv",
                    parameters={
                        "starts_at": request.starts_at.isoformat(),
                        "ends_at": request.ends_at.isoformat(),
                        "row_count": len(rows),
                        "truncated": truncated,
                    },
                    status=ReportStatus.COMPLETED,
                    requested_by_user_id=principal.user.id,
                    result_reference=f"streamed:{filename}",
                    error_code=None,
                    requested_at=now,
                    completed_at=now,
                    expires_at=now + timedelta(days=7),
                ),
                AuditLog(
                    application_id=application_id,
                    actor_user_id=principal.user.id,
                    action="report.exported",
                    entity_type="report_job",
                    entity_id=str(job_id),
                    correlation_id=correlation_id,
                    after_summary={
                        "report_type": request.report_type.value,
                        "row_count": len(rows),
                        "truncated": truncated,
                    },
                ),
            ]
        )
        await db.commit()
        return render_csv(headers, [tuple(row) for row in rows]), filename, truncated

    async def _currency_totals(
        self,
        db: AsyncSession,
        application_id: uuid.UUID,
        currency: Any,
        amount: Any,
        occurred_at: Any,
        table: Any,
        report_range: ReportRange,
        *conditions: Any,
    ) -> list[dict[str, object]]:
        rows = (
            await db.execute(
                select(currency, func.sum(amount), func.count())
                .select_from(table)
                .where(
                    table.application_id == application_id,
                    *_in_range(occurred_at, report_range),
                    *conditions,
                )
                .group_by(currency)
                .order_by(currency)
            )
        ).all()
        return [
            {"currency": code, "amount": Decimal(total), "count": count}
            for code, total, count in rows
        ]

    async def _plan_distribution(
        self, db: AsyncSession, application_id: uuid.UUID
    ) -> list[dict[str, object]]:
        rows = (
            await db.execute(
                select(SubscriptionPlan.id, SubscriptionPlan.name, func.count(Subscription.id))
                .join(
                    Subscription,
                    (Subscription.plan_id == SubscriptionPlan.id)
                    & (Subscription.application_id == SubscriptionPlan.application_id),
                )
                .where(
                    Subscription.application_id == application_id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                )
                .group_by(SubscriptionPlan.id, SubscriptionPlan.name)
                .order_by(func.count(Subscription.id).desc(), SubscriptionPlan.name)
            )
        ).all()
        return [
            {"plan_id": str(plan_id), "plan_name": name, "active_subscriptions": count}
            for plan_id, name, count in rows
        ]

    async def _subscription_trend(
        self, db: AsyncSession, application_id: uuid.UUID, report_range: ReportRange
    ) -> list[dict[str, object]]:
        day = func.date_trunc("day", Subscription.created_at)
        rows = (
            await db.execute(
                select(day, func.count())
                .where(
                    Subscription.application_id == application_id,
                    *_in_range(Subscription.created_at, report_range),
                )
                .group_by(day)
                .order_by(day)
            )
        ).all()
        return [{"date": value.date().isoformat(), "subscriptions": count} for value, count in rows]

    def _export_statement(
        self, application_id: uuid.UUID, request: ExportRequest
    ) -> tuple[list[str], Select[Any]]:
        if request.report_type == ExportReportType.SUBSCRIPTIONS:
            return [
                "subscription_id",
                "subscriber",
                "plan",
                "status",
                "starts_at",
                "ends_at",
            ], select(
                Subscription.id,
                Subscriber.external_id,
                SubscriptionPlan.code,
                Subscription.status,
                Subscription.starts_at,
                Subscription.ends_at,
            ).join(
                Subscriber,
                (Subscriber.id == Subscription.subscriber_id)
                & (Subscriber.application_id == Subscription.application_id),
            ).join(
                SubscriptionPlan,
                (SubscriptionPlan.id == Subscription.plan_id)
                & (SubscriptionPlan.application_id == Subscription.application_id),
            ).where(
                Subscription.application_id == application_id,
                *_in_range(Subscription.created_at, request),
            ).order_by(Subscription.created_at)
        if request.report_type == ExportReportType.PAYMENTS:
            return [
                "payment_id",
                "subscription_id",
                "provider",
                "amount",
                "currency",
                "status",
                "paid_at",
            ], select(
                PaymentTransaction.id,
                PaymentTransaction.subscription_id,
                PaymentTransaction.provider,
                PaymentTransaction.amount,
                PaymentTransaction.currency,
                PaymentTransaction.status,
                PaymentTransaction.paid_at,
            ).where(
                PaymentTransaction.application_id == application_id,
                *_in_range(PaymentTransaction.created_at, request),
            ).order_by(PaymentTransaction.created_at)
        if request.report_type == ExportReportType.COUPON_REDEMPTIONS:
            return [
                "redemption_id",
                "coupon",
                "subscriber",
                "discount",
                "currency",
                "redeemed_at",
            ], select(
                CouponRedemption.id,
                Coupon.code,
                Subscriber.external_id,
                CouponRedemption.discount_amount,
                CouponRedemption.currency,
                CouponRedemption.redeemed_at,
            ).join(
                Coupon,
                (Coupon.id == CouponRedemption.coupon_id)
                & (Coupon.application_id == CouponRedemption.application_id),
            ).join(
                Subscription,
                (Subscription.id == CouponRedemption.subscription_id)
                & (Subscription.application_id == CouponRedemption.application_id),
            ).join(
                Subscriber,
                (Subscriber.id == Subscription.subscriber_id)
                & (Subscriber.application_id == Subscription.application_id),
            ).where(
                CouponRedemption.application_id == application_id,
                *_in_range(CouponRedemption.redeemed_at, request),
            ).order_by(CouponRedemption.redeemed_at)
        if request.report_type == ExportReportType.AFFILIATE_COMMISSIONS:
            return [
                "entry_id",
                "affiliate",
                "type",
                "amount",
                "currency",
                "reference",
                "occurred_at",
            ], select(
                AffiliateCommission.id,
                Affiliate.email,
                AffiliateCommission.entry_type,
                AffiliateCommission.amount,
                AffiliateCommission.currency,
                AffiliateCommission.reference,
                AffiliateCommission.occurred_at,
            ).join(
                Affiliate,
                (Affiliate.id == AffiliateCommission.affiliate_id)
                & (Affiliate.application_id == AffiliateCommission.application_id),
            ).where(
                AffiliateCommission.application_id == application_id,
                *_in_range(AffiliateCommission.occurred_at, request),
            ).order_by(AffiliateCommission.occurred_at)
        return ["event_id", "subscription_id", "operation", "delta", "occurred_at"], select(
            UsageEvent.id,
            UsageCounter.subscription_id,
            UsageEvent.operation,
            UsageEvent.delta,
            UsageEvent.occurred_at,
        ).join(
            UsageCounter,
            (UsageCounter.id == UsageEvent.counter_id)
            & (UsageCounter.application_id == UsageEvent.application_id),
        ).where(
            UsageEvent.application_id == application_id, *_in_range(UsageEvent.occurred_at, request)
        ).order_by(UsageEvent.occurred_at)


report_service = ReportService()

__all__ = ["EXPORT_LIMIT", "ReportService", "render_csv", "report_service"]
