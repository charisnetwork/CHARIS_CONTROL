from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.domains.reports.schemas import ExportRequest, ReportRange
from app.domains.reports.service import ReportService, render_csv


def test_report_range_is_bounded_and_timezone_aware() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        ReportRange(starts_at=now - timedelta(days=367), ends_at=now)
    with pytest.raises(ValidationError):
        ReportRange(starts_at=datetime(2026, 1, 1), ends_at=datetime(2026, 1, 2))


def test_csv_export_neutralizes_spreadsheet_formulas() -> None:
    content = render_csv(["name", "value"], [("=IMPORTXML('bad')", 1)])
    assert b"'=IMPORTXML" in content


@pytest.mark.parametrize(
    "report_type",
    ["subscriptions", "payments", "coupon_redemptions", "affiliate_commissions", "usage_events"],
)
def test_every_export_query_is_application_scoped(report_type: str) -> None:
    application_id = uuid.uuid4()
    now = datetime.now(UTC)
    request = ExportRequest(
        report_type=report_type,
        starts_at=now - timedelta(days=1),
        ends_at=now,
    )
    _, statement = ReportService()._export_statement(application_id, request)
    sql = str(
        statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )
    assert str(application_id) in sql
    assert "application_id" in sql
