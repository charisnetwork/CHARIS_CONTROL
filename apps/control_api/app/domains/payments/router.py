import uuid
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy import select

from app.api.dependencies import AppAuthorization, DatabaseSession, require_app_permission
from app.core.config import get_settings
from app.db.models import AppPermission, RazorpayCheckout
from app.domains.payments import gateway
from app.domains.payments.schemas import (
    CheckoutCreate,
    CheckoutVerify,
    ProviderWebhook,
    ReconcileRequest,
)
from app.domains.payments.service import checkout_view, settle_payment, start_checkout

router = APIRouter(tags=["Razorpay payments"])
ManagePayments = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.MANAGE_SUBSCRIPTIONS))
]
ViewPayments = Annotated[
    AppAuthorization, Depends(require_app_permission(AppPermission.VIEW_SUBSCRIPTIONS))
]


@router.get("/apps/{app_id}/payments/razorpay")
async def list_payments(
    authorization: ViewPayments, db: DatabaseSession, response: Response
) -> dict[str, object]:
    response.headers["Cache-Control"] = "no-store"
    settings = get_settings()
    if not settings.razorpay_enabled:
        return {"enabled": False, "mode": settings.razorpay_mode, "checkouts": []}
    records = (
        await db.scalars(
            select(RazorpayCheckout)
            .where(
                RazorpayCheckout.application_id == authorization.application_id,
            )
            .order_by(RazorpayCheckout.created_at.desc())
            .limit(50)
        )
    ).all()
    return {
        "enabled": True,
        "mode": settings.razorpay_mode,
        "checkouts": [checkout_view(record) for record in records],
    }


@router.post("/apps/{app_id}/payments/razorpay/orders", status_code=201)
async def create_order(
    payload: CheckoutCreate, request: Request, authorization: ManagePayments, db: DatabaseSession
) -> dict[str, object]:
    record = await start_checkout(
        db,
        application_id=authorization.application_id,
        principal=authorization.principal,
        payload=payload,
        correlation_id=str(getattr(request.state, "correlation_id", uuid.uuid4())),
    )
    return checkout_view(record)


@router.post("/apps/{app_id}/payments/razorpay/verify")
async def verify_payment(
    payload: CheckoutVerify, authorization: ManagePayments, db: DatabaseSession
) -> dict[str, object]:
    settings = gateway.payment_settings()
    record = await db.scalar(
        select(RazorpayCheckout).where(
            RazorpayCheckout.application_id == authorization.application_id,
            RazorpayCheckout.provider_order_id == payload.razorpay_order_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    body = f"{record.provider_order_id}|{payload.razorpay_payment_id}".encode()
    if not gateway.valid_signature(
        body, payload.razorpay_signature, settings.razorpay_key_secret.get_secret_value()
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    payment = await gateway.fetch_payment(payload.razorpay_payment_id)
    result = await settle_payment(
        db,
        payment=payment,
        application_id=authorization.application_id,
        expected_checkout_id=record.id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    return checkout_view(result)


@router.post("/apps/{app_id}/payments/razorpay/checkouts/{checkout_id}/reconcile")
async def reconcile_payment(
    checkout_id: uuid.UUID,
    payload: ReconcileRequest,
    authorization: ManagePayments,
    db: DatabaseSession,
) -> dict[str, object]:
    gateway.payment_settings()
    record = await db.scalar(
        select(RazorpayCheckout).where(
            RazorpayCheckout.id == checkout_id,
            RazorpayCheckout.application_id == authorization.application_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    result = await settle_payment(
        db,
        payment=await gateway.fetch_payment(payload.payment_id),
        application_id=authorization.application_id,
        expected_checkout_id=checkout_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    return checkout_view(result)


@router.post("/payments/razorpay/webhook")
async def razorpay_webhook(request: Request, db: DatabaseSession) -> dict[str, bool]:
    settings = gateway.payment_settings()
    body = bytearray()
    async with aclosing(request.stream()) as stream:
        async for chunk in stream:
            body.extend(chunk)
            if len(body) > 65_536:
                raise HTTPException(status_code=413, detail="Webhook too large")
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not gateway.valid_signature(
        bytes(body), signature, settings.razorpay_webhook_secret.get_secret_value()
    ):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        event = ProviderWebhook.model_validate_json(bytes(body))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc
    if event.event not in {"payment.captured", "refund.processed"}:
        return {"accepted": True}
    item = event.payload.get("payment" if event.event == "payment.captured" else "refund")
    payment_id = (
        (item.entity.id if event.event == "payment.captured" else item.entity.payment_id)
        if item
        else None
    )
    if payment_id is None:
        raise HTTPException(status_code=400, detail="Missing payment reference")
    # Refetch using our merchant credentials; do not trust event amounts/status.
    await settle_payment(db, payment=await gateway.fetch_payment(payment_id))
    return {"accepted": True}
