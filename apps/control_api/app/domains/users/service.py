from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    Affiliate,
    AuditLog,
    Coupon,
    CouponRedemption,
    PaymentStatus,
    PaymentTransaction,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionStatus,
)
from app.domains.reports.service import net_payment_amount
from app.domains.users.schemas import (
    AccessState,
    UserCoupon,
    UserDetail,
    UserPage,
    UserPayment,
    UserRow,
    UserSubscription,
)

PAID_STATUSES = (
    PaymentStatus.SUCCEEDED,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
)


def _billing(snapshot: dict[str, Any]) -> str:
    value, unit = snapshot.get("duration_value"), snapshot.get("duration_unit")
    if (value, unit) in ((1, "month"),):
        return "Monthly"
    if (value, unit) in ((1, "year"), (12, "month")):
        return "Yearly"
    if value and unit:
        return f"{value} {unit}{'' if value == 1 else 's'}"
    return "—"


def _search_filter(query: str) -> Any:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    columns = (
        Subscriber.name,
        Subscriber.contact_name,
        Subscriber.email,
        Subscriber.mobile_number,
        Subscriber.external_id,
        Subscriber.contact_user_id,
    )
    clauses: list[ColumnElement[bool]] = [column.ilike(pattern, escape="\\") for column in columns]
    digits = re.sub(r"\D", "", query)
    if len(digits) >= 4:
        # "98470 12345" finds "+91-9847012345".
        clauses.append(
            func.regexp_replace(Subscriber.mobile_number, r"\D", "", "g").contains(digits)
        )
    try:
        clauses.append(Subscriber.id == uuid.UUID(query))
    except ValueError:
        pass
    return or_(*clauses)


class UserDirectoryService:
    """Read-only view of app accounts in OS; the only write is an operator restriction."""

    async def _rows(
        self, db: AsyncSession, application_id: uuid.UUID, subscribers: list[Subscriber]
    ) -> list[tuple[UserRow, list[UserSubscription], list[UserPayment]]]:
        ids = [subscriber.id for subscriber in subscribers]
        subscriptions = (
            (
                await db.scalars(
                    select(Subscription)
                    .where(
                        Subscription.application_id == application_id,
                        Subscription.subscriber_id.in_(ids),
                    )
                    .order_by(Subscription.starts_at.desc(), Subscription.created_at.desc())
                )
            ).all()
            if ids
            else []
        )
        subscription_ids = [subscription.id for subscription in subscriptions]
        coupons: dict[uuid.UUID, UserCoupon] = {}
        payments: dict[uuid.UUID, list[UserPayment]] = defaultdict(list)
        if subscription_ids:
            redemptions = await db.execute(
                select(CouponRedemption, Coupon, Affiliate)
                .join(
                    Coupon,
                    (Coupon.id == CouponRedemption.coupon_id)
                    & (Coupon.application_id == CouponRedemption.application_id),
                )
                .outerjoin(
                    Affiliate,
                    (Affiliate.id == Coupon.affiliate_id)
                    & (Affiliate.application_id == Coupon.application_id),
                )
                .where(
                    CouponRedemption.application_id == application_id,
                    CouponRedemption.subscription_id.in_(subscription_ids),
                )
            )
            for redemption, coupon, affiliate in redemptions.all():
                coupons[redemption.subscription_id] = UserCoupon(
                    code=coupon.code,
                    name=coupon.name,
                    discount_amount=redemption.discount_amount,
                    affiliate_id=affiliate.id if affiliate else None,
                    affiliate_name=(affiliate.company_name or affiliate.contact_name)
                    if affiliate
                    else None,
                )
            paid = await db.execute(
                select(PaymentTransaction, net_payment_amount())
                .where(
                    PaymentTransaction.application_id == application_id,
                    PaymentTransaction.subscription_id.in_(subscription_ids),
                )
                .order_by(PaymentTransaction.created_at.desc())
            )
            for payment, net in paid.all():
                payments[payment.subscription_id].append(
                    UserPayment(
                        id=payment.id,
                        subscription_id=payment.subscription_id,
                        amount=payment.amount,
                        net_amount=net if payment.status in PAID_STATUSES else Decimal(0),
                        currency=payment.currency,
                        status=payment.status.value,
                        paid_at=payment.paid_at,
                        provider_payment_id=payment.provider_payment_id,
                    )
                )

        by_subscriber: dict[uuid.UUID, list[Subscription]] = defaultdict(list)
        for subscription in subscriptions:
            by_subscriber[subscription.subscriber_id].append(subscription)

        now = datetime.now(UTC)
        results = []
        for subscriber in subscribers:
            terms = by_subscriber[subscriber.id]
            history = [
                UserSubscription(
                    id=term.id,
                    plan_id=term.plan_id,
                    plan_name=str(term.commercial_snapshot.get("plan_name") or "—"),
                    billing=_billing(term.commercial_snapshot),
                    price=Decimal(
                        str(
                            term.commercial_snapshot.get("final_price")
                            or term.commercial_snapshot.get("price")
                            or 0
                        )
                    ),
                    currency=str(term.commercial_snapshot.get("currency") or "INR"),
                    status=term.status.value,
                    starts_at=term.starts_at,
                    ends_at=term.ends_at,
                    cancelled_at=term.cancelled_at,
                    coupon=coupons.get(term.id),
                )
                for term in terms
            ]
            # Same choice as the app snapshot: the live term, else the latest started one.
            started = [
                (term, view)
                for term, view in zip(terms, history, strict=True)
                if term.starts_at <= now and term.status != SubscriptionStatus.PENDING
            ]
            live = next(
                (
                    pair
                    for pair in started
                    if pair[0].status == SubscriptionStatus.ACTIVE
                    and (pair[0].ends_at is None or pair[0].ends_at > now)
                ),
                None,
            )
            current = live or (started[0] if started else None)
            access: AccessState
            inactive_since: datetime | None = None
            if subscriber.restricted_at is not None:
                access, inactive_since = "restricted", subscriber.restricted_at
            elif live is not None:
                access = "active"
            elif current is not None:
                term = current[0]
                access = (
                    "expired" if term.status == SubscriptionStatus.ACTIVE else term.status.value  # type: ignore[assignment]
                )
                inactive_since = term.cancelled_at or term.ends_at
            elif terms:
                access = "pending"
            else:
                access = "no_plan"
            subscriber_payments = [p for term in terms for p in payments.get(term.id, [])]
            row = UserRow(
                id=subscriber.id,
                external_id=subscriber.external_id,
                business_name=subscriber.name,
                contact_name=subscriber.contact_name,
                contact_user_id=subscriber.contact_user_id,
                email=subscriber.email,
                mobile_number=subscriber.mobile_number,
                gender=subscriber.gender,
                date_of_birth=subscriber.date_of_birth,
                location=subscriber.location,
                team_size=subscriber.team_size,
                joined_at=subscriber.joined_at,
                last_active_at=subscriber.last_active_at,
                profile_synced_at=subscriber.profile_synced_at,
                access=access,
                subscription=current[1] if current else (history[0] if history else None),
                first_subscribed_at=min((term.starts_at for term, _ in started), default=None),
                inactive_since=inactive_since,
                total_paid=sum((p.net_amount for p in subscriber_payments), Decimal(0)),
                restricted_at=subscriber.restricted_at,
                restriction_reason=subscriber.restriction_reason,
            )
            results.append((row, history, subscriber_payments))
        return results

    async def list_users(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        query: str | None,
        access: str | None,
        plan_id: uuid.UUID | None,
        coupon: str | None,
        affiliate_id: uuid.UUID | None,
        limit: int,
        offset: int,
    ) -> UserPage:
        statement = select(Subscriber).where(
            Subscriber.application_id == application_id,
            Subscriber.status != SubscriberStatus.ARCHIVED,
        )
        if query:
            statement = statement.where(_search_filter(query))
        subscribers = list(
            (
                await db.scalars(statement.order_by(Subscriber.created_at.desc(), Subscriber.id))
            ).all()
        )
        rows = [row for row, _, _ in await self._rows(db, application_id, subscribers)]
        if access:
            rows = [row for row in rows if row.access == access]
        if plan_id:
            rows = [row for row in rows if row.subscription and row.subscription.plan_id == plan_id]
        if coupon == "used":
            rows = [row for row in rows if row.subscription and row.subscription.coupon]
        elif coupon == "none":
            rows = [row for row in rows if not (row.subscription and row.subscription.coupon)]
        if affiliate_id:
            rows = [
                row
                for row in rows
                if row.subscription
                and row.subscription.coupon
                and row.subscription.coupon.affiliate_id == affiliate_id
            ]
        return UserPage(total=len(rows), items=rows[offset : offset + limit])

    async def _subscriber(
        self, db: AsyncSession, application_id: uuid.UUID, user_id: uuid.UUID, lock: bool = False
    ) -> Subscriber:
        statement = select(Subscriber).where(
            Subscriber.application_id == application_id, Subscriber.id == user_id
        )
        subscriber = await db.scalar(statement.with_for_update() if lock else statement)
        if subscriber is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return subscriber

    async def get_user(
        self, db: AsyncSession, *, application_id: uuid.UUID, user_id: uuid.UUID
    ) -> UserDetail:
        subscriber = await self._subscriber(db, application_id, user_id)
        [(row, history, payments)] = await self._rows(db, application_id, [subscriber])
        return UserDetail(**row.model_dump(), subscriptions=history, payments=payments)

    async def set_restriction(
        self,
        db: AsyncSession,
        *,
        application_id: uuid.UUID,
        user_id: uuid.UUID,
        principal: AuthenticatedUser,
        restrict: bool,
        reason: str,
        correlation_id: str,
    ) -> UserDetail:
        subscriber = await self._subscriber(db, application_id, user_id, lock=True)
        if subscriber.status == SubscriberStatus.ARCHIVED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is archived")
        if restrict == (subscriber.restricted_at is not None):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already restricted" if restrict else "User is not restricted",
            )
        before = {"status": subscriber.status.value, "restricted": not restrict}
        if restrict:
            subscriber.status = SubscriberStatus.SUSPENDED
            subscriber.restricted_at = datetime.now(UTC)
            subscriber.restriction_reason = reason
        else:
            subscriber.status = SubscriberStatus.ACTIVE
            subscriber.restricted_at = None
            subscriber.restriction_reason = None
        subscriber.version += 1
        db.add(
            AuditLog(
                application_id=application_id,
                actor_user_id=principal.user.id,
                action="user.restricted" if restrict else "user.restored",
                entity_type="subscriber",
                entity_id=str(subscriber.id),
                correlation_id=correlation_id,
                before_summary=before,
                after_summary={
                    "status": subscriber.status.value,
                    "restricted": restrict,
                    "reason": reason,
                },
            )
        )
        await db.commit()
        return await self.get_user(db, application_id=application_id, user_id=user_id)


user_directory_service = UserDirectoryService()
