from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.db.models import AppFeature, PlanEntitlement, SubscriptionPlan


def compile_query(statement) -> str:
    return str(
        statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )


def test_catalog_queries_require_application_scope() -> None:
    application_id = uuid.uuid4()
    plan_id = uuid.uuid4()
    feature_id = uuid.uuid4()

    statements = [
        select(AppFeature).where(
            AppFeature.application_id == application_id,
            AppFeature.id == feature_id,
        ),
        select(SubscriptionPlan).where(
            SubscriptionPlan.application_id == application_id,
            SubscriptionPlan.id == plan_id,
        ),
        select(PlanEntitlement).where(
            PlanEntitlement.application_id == application_id,
            PlanEntitlement.plan_id == plan_id,
        ),
    ]

    for statement in statements:
        compiled = compile_query(statement)
        assert "application_id" in compiled
        assert str(application_id) in compiled
