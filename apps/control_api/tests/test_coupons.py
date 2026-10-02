from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.db.models import Coupon, CouponKind, CouponStatus, ValueType
from app.domains.coupons.schemas import CouponCreate
from app.domains.coupons.service import (
    calculate_commission,
    calculate_discount,
    locked_coupon_statement,
)
from app.domains.subscriptions.schemas import SubscriptionCreate


def _coupon(discount_type: ValueType, value: str) -> Coupon:
    now = datetime.now(UTC)
    return Coupon(
        id=uuid.uuid4(),
        application_id=uuid.uuid4(),
        name="Launch",
        code="LAUNCH",
        kind=CouponKind.PROMOTION,
        discount_type=discount_type,
        discount_value=Decimal(value),
        starts_at=now,
        ends_at=now + timedelta(days=1),
        maximum_redemptions=10,
        redemption_count=0,
        status=CouponStatus.ACTIVE,
    )


def test_discount_is_deterministic_and_capped_at_plan_price() -> None:
    percentage = calculate_discount(_coupon(ValueType.PERCENTAGE, "12.5"), Decimal("99.99"))
    assert percentage == Decimal("12.50")
    assert calculate_discount(_coupon(ValueType.FIXED, "150"), Decimal("99.99")) == Decimal("99.99")


def test_commission_uses_net_amount_and_is_capped() -> None:
    percentage = _coupon(ValueType.PERCENTAGE, "10")
    percentage.commission_type = ValueType.PERCENTAGE
    percentage.commission_value = Decimal("20")
    assert calculate_commission(percentage, Decimal("90")) == Decimal("18.00")
    fixed = _coupon(ValueType.PERCENTAGE, "10")
    fixed.commission_type = ValueType.FIXED
    fixed.commission_value = Decimal("200")
    assert calculate_commission(fixed, Decimal("90")) == Decimal("90.00")


def test_coupon_schema_normalizes_code_and_validates_currency_shape() -> None:
    now = datetime.now(UTC)
    coupon = CouponCreate(
        name="Launch offer",
        code=" launch-10 ",
        discount_type="percentage",
        discount_value="10",
        starts_at=now,
        ends_at=now + timedelta(days=1),
        maximum_redemptions=100,
    )
    assert coupon.code == "LAUNCH-10"
    assert coupon.currency is None
    with pytest.raises(ValidationError):
        CouponCreate(
            name="Invalid fixed",
            code="FIXED",
            discount_type="fixed",
            discount_value="10",
            starts_at=now,
            ends_at=now + timedelta(days=1),
            maximum_redemptions=100,
        )


def test_affiliate_coupon_requires_a_valid_commission_shape() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        CouponCreate(
            name="Partner offer",
            code="PARTNER",
            kind="affiliate",
            affiliate_id=uuid.uuid4(),
            discount_type="percentage",
            discount_value="10",
            commission_type="fixed",
            commission_value="100",
            starts_at=now,
            ends_at=now + timedelta(days=1),
            maximum_redemptions=100,
        )
    valid = CouponCreate(
        name="Partner offer",
        code="PARTNER",
        kind="affiliate",
        affiliate_id=uuid.uuid4(),
        discount_type="percentage",
        discount_value="10",
        commission_type="percentage",
        commission_value="15",
        starts_at=now,
        ends_at=now + timedelta(days=1),
        maximum_redemptions=100,
    )
    assert valid.commission_value == Decimal("15")


def test_subscription_coupon_fields_must_be_supplied_as_pair() -> None:
    with pytest.raises(ValidationError):
        SubscriptionCreate(
            subscriber_id=uuid.uuid4(),
            plan_id=uuid.uuid4(),
            starts_at=datetime.now(UTC),
            coupon_code="launch",
        )
    payload = SubscriptionCreate(
        subscriber_id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        starts_at=datetime.now(UTC),
        coupon_code="launch",
        coupon_idempotency_key="request-1234",
    )
    assert payload.coupon_code == "LAUNCH"


def test_coupon_redemption_lock_is_application_scoped() -> None:
    application_id = uuid.uuid4()
    statement = locked_coupon_statement(application_id, "LAUNCH")
    sql = str(
        statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )
    assert "FOR UPDATE" in sql
    assert str(application_id) in sql
    assert "coupons.application_id" in sql
    assert "coupons.code" in sql
