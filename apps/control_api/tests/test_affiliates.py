from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.domains.affiliates.schemas import CommissionEntryCreate


def test_manual_earned_commission_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CommissionEntryCreate(
            entry_type="earned",
            amount="10",
            currency="inr",
            reference="payment-reference",
            occurred_at=datetime.now(UTC),
        )


def test_payout_requires_positive_amount_and_normalizes_currency() -> None:
    payout = CommissionEntryCreate(
        entry_type="paid",
        amount="10.50",
        currency=" inr ",
        reference="payment-reference",
        occurred_at=datetime.now(UTC),
    )
    assert payout.currency == "INR"
    with pytest.raises(ValidationError):
        CommissionEntryCreate(
            entry_type="paid",
            amount="-1",
            currency="INR",
            reference="payment-reference",
            occurred_at=datetime.now(UTC),
        )
