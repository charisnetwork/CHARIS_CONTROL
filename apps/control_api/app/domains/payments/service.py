import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthenticatedUser
from app.db.models import (
    AffiliateCommission,
    Application,
    ApplicationEnvironment,
    ApplicationStatus,
    AuditLog,
    Coupon,
    CouponRedemption,
    DurationUnit,
    PaymentStatus,
    PaymentTransaction,
    RazorpayCheckout,
    Subscriber,
    SubscriberStatus,
    Subscription,
    SubscriptionEvent,
    SubscriptionStatus,
    WebhookEvent,
)
from app.domains.coupons.service import coupon_service
from app.domains.payments import gateway
from app.domains.payments.schemas import CheckoutCreate, ProviderOrder, ProviderPayment
from app.domains.subscriptions.schemas import SubscriptionCreate
from app.domains.subscriptions.service import _subscription_end, subscription_service


def minor_amount(value: object, currency: str) -> int:
    if currency != "INR":
        raise HTTPException(status_code=422, detail="This checkout supports INR plans only")
    amount = Decimal(str(value)) * 100
    if (
        not amount.is_finite()
        or amount != amount.to_integral_value()
        or not 100 <= amount <= 100_000_000
    ):
        raise HTTPException(
            status_code=422, detail="Plan price must be INR 1–10,00,000 with at most two decimals"
        )
    return int(amount)


def order_matches(order: ProviderOrder, checkout: RazorpayCheckout) -> bool:
    return (
        order.receipt == str(checkout.id)
        and order.notes.get("charis_checkout_id") == str(checkout.id)
        and order.amount == checkout.amount_minor
        and order.currency == checkout.currency
    )


def payment_matches(payment: ProviderPayment, checkout: RazorpayCheckout) -> bool:
    return (
        payment.order_id == checkout.provider_order_id
        and payment.amount == checkout.amount_minor
        and payment.currency == checkout.currency
        and payment.captured
        and payment.status in {"captured", "refunded"}
        and payment.amount_refunded <= payment.amount
        and (payment.status != "refunded" or payment.amount_refunded == payment.amount)
    )


def checkout_view(record: RazorpayCheckout) -> dict[str, object]:
    settings = gateway.payment_settings()
    return {
        "id": str(record.id),
        "subscription_id": str(record.subscription_id),
        "order_id": record.provider_order_id,
        "payment_id": record.provider_payment_id,
        "amount_minor": record.amount_minor,
        "currency": record.currency,
        "status": record.status,
        "key_id": settings.razorpay_key_id,
        "mode": settings.razorpay_mode,
        "created_at": record.created_at.isoformat(),
    }


CHECKOUT_EXPIRY = timedelta(hours=24)


async def expire_stale_checkouts(
    db: AsyncSession,
    *,
    application_id: uuid.UUID | None = None,
    subscriber_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> int:
    """Expire unpaid orders older than 24h: cancel the pending term, release its coupon.

    A payment that still arrives later is recorded and flagged for review, never lost.
    The caller commits.
    """
    now = now or datetime.now(UTC)
    statement = (
        select(RazorpayCheckout, Subscription)
        .join(
            Subscription,
            (Subscription.id == RazorpayCheckout.subscription_id)
            & (Subscription.application_id == RazorpayCheckout.application_id),
        )
        .where(
            RazorpayCheckout.status.in_(["creating", "ready"]),
            RazorpayCheckout.provider_payment_id.is_(None),
            RazorpayCheckout.created_at < now - CHECKOUT_EXPIRY,
        )
        .with_for_update(of=RazorpayCheckout)
    )
    if application_id is not None:
        statement = statement.where(RazorpayCheckout.application_id == application_id)
    if subscriber_id is not None:
        statement = statement.where(Subscription.subscriber_id == subscriber_id)
    expired = 0
    for checkout, pending in (await db.execute(statement)).all():
        checkout.status = "expired"
        if pending.status == SubscriptionStatus.PENDING:
            pending.status = SubscriptionStatus.CANCELLED
            pending.cancelled_at = now
            pending.version += 1
        redemption = await db.scalar(
            select(CouponRedemption).where(
                CouponRedemption.application_id == checkout.application_id,
                CouponRedemption.subscription_id == pending.id,
            )
        )
        earned = (
            await db.scalar(
                select(AffiliateCommission.id).where(
                    AffiliateCommission.application_id == checkout.application_id,
                    AffiliateCommission.redemption_id == redemption.id,
                )
            )
            if redemption is not None
            else None
        )
        if redemption is not None and earned is None:
            coupon = await db.scalar(
                select(Coupon)
                .where(
                    Coupon.application_id == checkout.application_id,
                    Coupon.id == redemption.coupon_id,
                )
                .with_for_update()
            )
            if coupon is not None and coupon.redemption_count > 0:
                coupon.redemption_count -= 1
                coupon.version += 1
            await db.delete(redemption)
        db.add(
            AuditLog(
                application_id=checkout.application_id,
                actor_user_id=None,
                action="payment.expired",
                entity_type="razorpay_checkout",
                entity_id=str(checkout.id),
                correlation_id=str(checkout.id),
                after_summary={
                    "subscription_id": str(pending.id),
                    "coupon_released": redemption is not None and earned is None,
                },
            )
        )
        expired += 1
    await db.flush()
    return expired


async def start_checkout(
    db: AsyncSession,
    *,
    application_id: uuid.UUID,
    principal: AuthenticatedUser | None,
    payload: CheckoutCreate,
    correlation_id: str,
    external_actor_id: str | None = None,
) -> RazorpayCheckout:
    if principal is None and not external_actor_id:
        raise HTTPException(status_code=403, detail="Checkout actor is required")
    settings = gateway.payment_settings()
    application = await db.get(Application, application_id)
    if application is None or application.status != ApplicationStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Application not available")
    if (
        application.environment == ApplicationEnvironment.PRODUCTION
        and settings.razorpay_mode != "live"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Production applications require Razorpay live mode; "
                "use a staging application for test payments"
            ),
        )
    subscriber = await db.scalar(
        select(Subscriber)
        .where(
            Subscriber.id == payload.subscriber_id,
            Subscriber.application_id == application_id,
        )
        .with_for_update()
    )
    if subscriber is None or subscriber.status != SubscriberStatus.ACTIVE:
        raise HTTPException(
            status_code=422, detail="An active subscriber in this application is required"
        )
    existing = await db.scalar(
        select(RazorpayCheckout).where(
            RazorpayCheckout.application_id == application_id,
            RazorpayCheckout.idempotency_key == str(payload.idempotency_key),
        )
    )
    if existing is not None:
        quoted = await db.scalar(
            select(Subscription).where(
                Subscription.id == existing.subscription_id,
                Subscription.application_id == application_id,
            )
        )
        if (
            quoted is None
            or quoted.subscriber_id != payload.subscriber_id
            or quoted.plan_id != payload.plan_id
            or existing.previous_subscription_id != payload.previous_subscription_id
            or existing.previous_version != payload.previous_version
            or existing.reason != payload.reason
            or quoted.commercial_snapshot.get("coupon_code") != payload.coupon_code
        ):
            raise HTTPException(
                status_code=409, detail="Checkout key belongs to a different request"
            )
        return existing
    await expire_stale_checkouts(db, application_id=application_id, subscriber_id=subscriber.id)
    if external_actor_id is not None:
        pending_order = await db.scalar(
            select(RazorpayCheckout.id)
            .join(
                Subscription,
                (Subscription.id == RazorpayCheckout.subscription_id)
                & (Subscription.application_id == RazorpayCheckout.application_id),
            )
            .where(
                RazorpayCheckout.application_id == application_id,
                Subscription.subscriber_id == subscriber.id,
                RazorpayCheckout.status.in_(["creating", "ready"]),
            )
        )
        if pending_order is not None:
            raise HTTPException(
                status_code=409,
                detail="Resume your existing checkout before starting another payment",
            )
    current = list(
        (
            await db.scalars(
                select(Subscription)
                .where(
                    Subscription.application_id == application_id,
                    Subscription.subscriber_id == subscriber.id,
                    Subscription.status.in_(
                        [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]
                    ),
                )
                .with_for_update()
            )
        ).all()
    )
    if payload.previous_subscription_id is None:
        if current:
            raise HTTPException(
                status_code=409, detail="Select the current term explicitly to replace or renew it"
            )
    else:
        previous = await db.scalar(
            select(Subscription)
            .where(
                Subscription.id == payload.previous_subscription_id,
                Subscription.application_id == application_id,
                Subscription.subscriber_id == subscriber.id,
            )
            .with_for_update()
        )
        if (
            previous is None
            or previous.version != payload.previous_version
            or previous.status
            not in {
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.SUSPENDED,
                SubscriptionStatus.EXPIRED,
            }
            or any(item.id != previous.id for item in current)
        ):
            raise HTTPException(
                status_code=409, detail="Current subscription changed or cannot be replaced"
            )
    pending = await subscription_service.create_subscription(
        db,
        application_id=application_id,
        principal=principal,
        payload=SubscriptionCreate(
            subscriber_id=subscriber.id,
            plan_id=payload.plan_id,
            starts_at=datetime.now(UTC),
            auto_renews=False,
            coupon_code=payload.coupon_code,
            coupon_idempotency_key=(
                f"checkout:{payload.idempotency_key}" if payload.coupon_code else None
            ),
        ),
        correlation_id=correlation_id,
        commit=False,
        initial_status=SubscriptionStatus.PENDING,
    )
    checkout = RazorpayCheckout(
        id=uuid.uuid4(),
        application_id=application_id,
        subscription_id=pending.id,
        previous_subscription_id=payload.previous_subscription_id,
        previous_version=payload.previous_version,
        idempotency_key=str(payload.idempotency_key),
        amount_minor=minor_amount(
            pending.commercial_snapshot["final_price"], pending.commercial_snapshot["currency"]
        ),
        currency="INR",
        status="creating",
        requested_by=principal.user.id if principal else None,
        external_actor_id=external_actor_id,
        reason=payload.reason,
    )
    db.add(checkout)
    # Persist before the external side effect. Ambiguous failures never retry creation blindly.
    await db.commit()
    await db.refresh(checkout)
    order = await gateway.create_provider_order(
        str(checkout.id), checkout.amount_minor, checkout.currency
    )
    if not order_matches(order, checkout):
        raise HTTPException(status_code=502, detail="Provider order did not match the saved quote")
    locked = await db.scalar(
        select(RazorpayCheckout)
        .where(
            RazorpayCheckout.id == checkout.id,
            RazorpayCheckout.application_id == application_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert locked is not None
    if locked.provider_order_id not in {None, order.id}:
        raise HTTPException(status_code=409, detail="Checkout already bound to another order")
    locked.provider_order_id = order.id
    if locked.status == "creating":
        locked.status = "ready"
    await db.commit()
    await db.refresh(locked)
    return locked


async def settle_payment(
    db: AsyncSession,
    *,
    payment: ProviderPayment,
    application_id: uuid.UUID | None = None,
    expected_checkout_id: uuid.UUID | None = None,
) -> RazorpayCheckout | None:
    order = await gateway.fetch_order(payment.order_id)
    try:
        checkout_id = uuid.UUID(order.notes.get("charis_checkout_id", ""))
    except ValueError:
        return None  # A valid merchant event for a different product/order.
    if expected_checkout_id is not None and checkout_id != expected_checkout_id:
        raise HTTPException(status_code=409, detail="Payment belongs to another checkout")
    statement = (
        select(RazorpayCheckout, Subscription)
        .join(
            Subscription,
            (Subscription.id == RazorpayCheckout.subscription_id)
            & (Subscription.application_id == RazorpayCheckout.application_id),
        )
        .where(RazorpayCheckout.id == checkout_id)
    )
    if application_id is not None:
        statement = statement.where(RazorpayCheckout.application_id == application_id)
    found = (await db.execute(statement)).one_or_none()
    if found is None:
        return None
    preliminary, quoted = found
    # Consistent subscriber -> checkout -> subscription locking serializes activation.
    subscriber = await db.scalar(
        select(Subscriber)
        .where(
            Subscriber.id == quoted.subscriber_id,
            Subscriber.application_id == preliminary.application_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    checkout = await db.scalar(
        select(RazorpayCheckout)
        .where(
            RazorpayCheckout.id == preliminary.id,
            RazorpayCheckout.application_id == preliminary.application_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert checkout is not None
    if not order_matches(order, checkout) or checkout.provider_order_id not in {None, order.id}:
        raise HTTPException(status_code=409, detail="Provider order does not match checkout")
    checkout.provider_order_id = order.id
    if not payment_matches(payment, checkout):
        raise HTTPException(
            status_code=409, detail="Payment is not captured or does not match the saved amount"
        )
    if checkout.provider_payment_id not in {None, payment.id}:
        raise HTTPException(status_code=409, detail="Checkout already settled by another payment")
    checkout.provider_payment_id = payment.id
    subscription = await db.scalar(
        select(Subscription)
        .where(
            Subscription.id == checkout.subscription_id,
            Subscription.application_id == checkout.application_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert subscription is not None
    application = await db.get(Application, checkout.application_id)
    ledger = await db.scalar(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.application_id == checkout.application_id,
            PaymentTransaction.provider == "razorpay",
            PaymentTransaction.provider_payment_id == payment.id,
        )
        .with_for_update()
    )
    now = datetime.now(UTC)
    if ledger is None:
        ledger = PaymentTransaction(
            id=uuid.uuid4(),
            application_id=checkout.application_id,
            subscription_id=subscription.id,
            provider="razorpay",
            provider_payment_id=payment.id,
            provider_order_id=order.id,
            amount=Decimal(payment.amount) / 100,
            currency=payment.currency,
            status=PaymentStatus.SUCCEEDED,
            paid_at=now,
            metadata_json={"checkout_id": str(checkout.id), "amount_refunded_minor": 0},
        )
        db.add(ledger)
    # Never downgrade a known refund if a stale provider response arrives later.
    previous_refunded = int(ledger.metadata_json.get("amount_refunded_minor", 0))
    refunded = max(payment.amount_refunded, previous_refunded)
    prior_status = checkout.status
    if refunded:
        ledger.metadata_json = {**ledger.metadata_json, "amount_refunded_minor": refunded}
        ledger.status = (
            PaymentStatus.REFUNDED
            if refunded == payment.amount
            else PaymentStatus.PARTIALLY_REFUNDED
        )
        checkout.status = "refunded" if refunded == payment.amount else "review"
        if refunded == payment.amount:
            await coupon_service.settle_checkout_commission(
                db, subscription=subscription, now=now, refunded=True
            )
        if refunded == payment.amount and subscription.status in {
            SubscriptionStatus.PENDING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.SUSPENDED,
        }:
            subscription.status = SubscriptionStatus.CANCELLED
            subscription.cancelled_at = now
            subscription.auto_renews = False
            subscription.version += 1
    elif checkout.status not in {"paid", "review", "refunded"}:
        current = list(
            (
                await db.scalars(
                    select(Subscription)
                    .where(
                        Subscription.application_id == checkout.application_id,
                        Subscription.subscriber_id == subscription.subscriber_id,
                        Subscription.id != subscription.id,
                        Subscription.status.in_(
                            [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]
                        ),
                    )
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).all()
        )
        previous = None
        if checkout.previous_subscription_id is not None:
            previous = await db.scalar(
                select(Subscription)
                .where(
                    Subscription.id == checkout.previous_subscription_id,
                    Subscription.application_id == checkout.application_id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        valid_previous = (checkout.previous_subscription_id is None and not current) or (
            previous is not None
            and previous.version == checkout.previous_version
            and previous.status
            in {SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED}
            and all(item.id == previous.id for item in current)
        )
        if (
            subscriber is None
            or subscriber.status != SubscriberStatus.ACTIVE
            or not valid_previous
            or application is None
            or application.status != ApplicationStatus.ACTIVE
            or (
                application.environment == ApplicationEnvironment.PRODUCTION
                and gateway.payment_settings().razorpay_mode != "live"
            )
        ):
            checkout.status = "review"  # Payment retained; never overwrite a newer term.
        elif subscription.status != SubscriptionStatus.PENDING:
            checkout.status = "review"
        else:
            if previous is not None:
                previous.status = SubscriptionStatus.CANCELLED
                previous.cancelled_at = now
                previous.auto_renews = False
                previous.version += 1
                await db.flush()  # Retire previous ACTIVE row before activating its replacement.
            subscription.starts_at = now
            snapshot = subscription.commercial_snapshot
            subscription.ends_at = _subscription_end(
                now, int(snapshot["duration_value"]), DurationUnit(snapshot["duration_unit"])
            )
            subscription.status = SubscriptionStatus.ACTIVE
            subscription.version += 1
            checkout.status = "paid"
            await coupon_service.settle_checkout_commission(
                db, subscription=subscription, now=now, refunded=False
            )
    if prior_status != checkout.status or refunded != previous_refunded:
        details = {
            "checkout_id": str(checkout.id),
            "subscription_id": str(subscription.id),
            "status": checkout.status,
            "payment_id": payment.id,
            "reason": checkout.reason,
            "amount_refunded_minor": refunded,
            "external_actor_id": getattr(checkout, "external_actor_id", None),
        }
        event_type = f"payment.{checkout.status}"
        db.add_all(
            [
                SubscriptionEvent(
                    id=uuid.uuid4(),
                    application_id=checkout.application_id,
                    subscription_id=subscription.id,
                    event_type=event_type,
                    effective_at=now,
                    details=details,
                    actor_user_id=checkout.requested_by,
                ),
                AuditLog(
                    application_id=checkout.application_id,
                    actor_user_id=checkout.requested_by,
                    action=event_type,
                    entity_type="payment",
                    entity_id=str(ledger.id),
                    correlation_id=str(checkout.id),
                    after_summary=details,
                ),
                WebhookEvent(
                    id=uuid.uuid4(),
                    application_id=checkout.application_id,
                    event_type=event_type,
                    aggregate_type="subscription",
                    aggregate_id=str(subscription.id),
                    payload=details,
                    occurred_at=now,
                    idempotency_key=f"razorpay:{checkout.id}:{checkout.status}:{refunded}",
                ),
            ]
        )
    await db.commit()
    await db.refresh(checkout)
    return checkout
