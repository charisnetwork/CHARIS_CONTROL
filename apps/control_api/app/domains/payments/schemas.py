import uuid
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CheckoutCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    subscriber_id: uuid.UUID
    plan_id: uuid.UUID
    idempotency_key: uuid.UUID
    previous_subscription_id: uuid.UUID | None = None
    previous_version: int | None = Field(default=None, ge=1)
    reason: str = Field(min_length=5, max_length=500)
    coupon_code: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("coupon_code", mode="before")
    @classmethod
    def normalize_coupon_code(cls, value: object) -> object:
        return value.strip().upper() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_previous_pair(self) -> Self:
        if (self.previous_subscription_id is None) != (self.previous_version is None):
            raise ValueError("Previous subscription ID and version must be supplied together")
        return self


class CheckoutVerify(BaseModel):
    model_config = ConfigDict(extra="forbid")
    razorpay_order_id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,80}$")
    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,80}$")
    razorpay_signature: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class ReconcileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,80}$")


class ProviderOrder(BaseModel):
    id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,80}$")
    amount: int = Field(strict=True, ge=100)
    currency: str
    receipt: str
    notes: dict[str, str] = Field(default_factory=dict)


class ProviderPayment(BaseModel):
    id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,80}$")
    order_id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,80}$")
    amount: int = Field(strict=True, ge=100)
    currency: str
    status: str
    captured: bool
    amount_refunded: int = Field(default=0, strict=True, ge=0)


class WebhookEntity(BaseModel):
    id: str | None = None
    payment_id: str | None = None


class WebhookItem(BaseModel):
    entity: WebhookEntity


class ProviderWebhook(BaseModel):
    event: str
    payload: dict[str, WebhookItem]
