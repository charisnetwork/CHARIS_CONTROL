from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.models import LimitType, ResetPeriod


class EntitlementSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature_code: str = Field(min_length=2, max_length=100)
    enabled: bool
    limit_type: LimitType | None = None
    limit_value: int | None = Field(default=None, gt=0)
    unit: str | None = Field(default=None, max_length=64)
    reset_period: ResetPeriod | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> EntitlementSnapshot:
        if not self.enabled:
            if self.limit_type is not None or self.limit_value is not None:
                raise ValueError("disabled snapshots cannot grant a limit")
        elif self.limit_type is None:
            raise ValueError("enabled snapshots require limit_type")
        elif self.limit_type == LimitType.UNLIMITED and self.limit_value is not None:
            raise ValueError("unlimited snapshots cannot contain limit_value")
        elif self.limit_type == LimitType.LIMITED and (
            self.limit_value is None or self.unit is None or self.reset_period is None
        ):
            raise ValueError("limited snapshots require limit_value, unit, and reset_period")
        return self


class EntitlementDecision(BaseModel):
    allowed: bool
    feature_code: str
    reason: str
    limit_type: LimitType | None = None
    limit_value: int | None = None
    used_value: int = 0
    remaining: int | None = None
    unit: str | None = None
    reset_period: ResetPeriod | None = None


__all__ = ["EntitlementDecision", "EntitlementSnapshot"]
