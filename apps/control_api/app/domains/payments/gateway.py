import hashlib
import hmac
import re
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.domains.payments.schemas import ProviderOrder, ProviderPayment


def payment_settings() -> Settings:
    settings = get_settings()
    if not settings.razorpay_enabled:
        raise HTTPException(status_code=503, detail="Razorpay checkout is not enabled")
    return settings


def valid_signature(body: bytes, supplied: str, secret: str) -> bool:
    if re.fullmatch(r"[a-fA-F0-9]{64}", supplied) is None:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return bool(secret) and hmac.compare_digest(expected, supplied.lower())


async def provider_request(method: str, path: str, payload: dict[str, object] | None = None) -> Any:
    settings = payment_settings()
    try:
        async with httpx.AsyncClient(
            base_url="https://api.razorpay.com/v1/",
            timeout=10,
            follow_redirects=False,
            trust_env=False,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
        ) as client:
            response = await client.request(method, path, json=payload)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail="Payment provider unavailable; reconcile before retrying"
        ) from exc


async def create_provider_order(checkout_id: str, amount: int, currency: str) -> ProviderOrder:
    result = await provider_request(
        "POST",
        "orders",
        {
            "amount": amount,
            "currency": currency,
            "receipt": checkout_id,
            "partial_payment": False,
            "notes": {"charis_checkout_id": checkout_id},
        },
    )
    return validate_order(result)


def validate_order(result: Any) -> ProviderOrder:
    try:
        return ProviderOrder.model_validate(result)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Invalid provider order response") from exc


async def fetch_order(order_id: str) -> ProviderOrder:
    if not order_id.startswith("order_") or not order_id[6:].isalnum() or len(order_id) > 86:
        raise HTTPException(status_code=400, detail="Invalid order ID")
    order = validate_order(await provider_request("GET", f"orders/{order_id}"))
    if order.id != order_id:
        raise HTTPException(status_code=502, detail="Provider order mismatch")
    return order


async def fetch_payment(payment_id: str) -> ProviderPayment:
    if not payment_id.startswith("pay_") or not payment_id[4:].isalnum() or len(payment_id) > 84:
        raise HTTPException(status_code=400, detail="Invalid payment ID")
    result = await provider_request("GET", f"payments/{payment_id}")
    try:
        payment = ProviderPayment.model_validate(result)
        if payment.id != payment_id:
            raise ValueError("Payment ID mismatch")
        return payment
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Invalid provider payment response") from exc
