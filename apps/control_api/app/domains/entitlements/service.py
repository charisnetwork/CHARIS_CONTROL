from __future__ import annotations

from collections.abc import Iterable

from app.db.models import LimitType
from app.domains.entitlements.schemas import EntitlementDecision, EntitlementSnapshot


def evaluate_entitlement(
    snapshots: Iterable[EntitlementSnapshot],
    *,
    feature_code: str,
    used_value: int = 0,
    requested_value: int = 1,
) -> EntitlementDecision:
    if used_value < 0 or requested_value <= 0:
        raise ValueError("usage values must be non-negative and requested_value must be positive")
    normalized_code = feature_code.strip().casefold().replace("-", "_")
    snapshot = next(
        (item for item in snapshots if item.feature_code == normalized_code),
        None,
    )
    if snapshot is None or not snapshot.enabled:
        return EntitlementDecision(
            allowed=False,
            feature_code=normalized_code,
            reason="feature_not_entitled",
            used_value=used_value,
        )
    if snapshot.limit_type == LimitType.UNLIMITED:
        return EntitlementDecision(
            allowed=True,
            feature_code=normalized_code,
            reason="unlimited",
            limit_type=LimitType.UNLIMITED,
            used_value=used_value,
            unit=snapshot.unit,
            reset_period=snapshot.reset_period,
        )

    limit = snapshot.limit_value or 0
    remaining = max(0, limit - used_value)
    return EntitlementDecision(
        allowed=requested_value <= remaining,
        feature_code=normalized_code,
        reason="within_limit" if requested_value <= remaining else "limit_exceeded",
        limit_type=LimitType.LIMITED,
        limit_value=limit,
        used_value=used_value,
        remaining=remaining,
        unit=snapshot.unit,
        reset_period=snapshot.reset_period,
    )


__all__ = ["evaluate_entitlement"]
