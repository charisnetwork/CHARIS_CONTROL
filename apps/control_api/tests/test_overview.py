from __future__ import annotations

import uuid

from sqlalchemy.dialects import postgresql

from app.domains.overview.service import OverviewService, overview_counts_statement


class RowResult:
    def __init__(self, values: tuple[int, int, int, int, int]) -> None:
        self.values = values

    def one(self) -> tuple[int, int, int, int, int]:
        return self.values


class FakeSession:
    def __init__(self) -> None:
        self.executed = []
        self.scalar_statements = []

    async def execute(self, statement):
        self.executed.append(statement)
        return RowResult((8, 11, 6, 3, 2))

    async def scalar(self, statement):
        self.scalar_statements.append(statement)
        return None


def test_overview_count_query_scopes_every_metric_to_application() -> None:
    application_id = uuid.uuid4()
    compiled = str(
        overview_counts_statement(application_id).compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )

    assert compiled.count(str(application_id)) == 5
    assert "subscribers.application_id" in compiled
    assert "subscriptions.application_id" in compiled
    assert "subscription_plans.application_id" in compiled
    assert "coupons.application_id" in compiled


async def test_overview_service_returns_control_centre_counts() -> None:
    database = FakeSession()
    service = OverviewService()

    result = await service.counts(database, application_id=uuid.uuid4())  # type: ignore[arg-type]

    assert result.subscribers == 8
    assert result.subscriptions == 11
    assert result.active_subscriptions == 6
    assert result.plans == 3
    assert result.active_coupons == 2
