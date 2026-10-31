import uuid
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import ReportingAdapter
from app.domains.overview import adapter

SUMMARY = {
    "contract_version": 1,
    "generated_at": "2026-10-30T00:00:00Z",
    "customers": {"total": 3, "active_30d": 2, "new_in_range": 1},
    "users": {"total": 5, "enabled": 4, "active_24h": 1, "active_7d": 2},
    "usage": {"projects": 7, "photos": 10, "photo_storage_bytes": 1234},
    "payroll": "must not leave adapter",
}


async def test_reporting_uses_only_app_config_and_filters_extra_fields(monkeypatch):
    app_id = uuid.uuid4()
    connection = ReportingAdapter(base_url="https://civil.example/api/v1/control", token="x" * 32)
    monkeypatch.setattr(
        adapter, "get_settings", lambda: SimpleNamespace(reporting_adapters={app_id: connection})
    )
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=SUMMARY)

    original = httpx.AsyncClient
    monkeypatch.setattr(
        adapter.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    result = await adapter.fetch_report(app_id, "summary", adapter.AppSummary)
    assert result.customers.total == 3
    assert "payroll" not in result.model_dump()
    assert str(requests[0].url) == "https://civil.example/api/v1/control/summary"
    assert requests[0].headers["Authorization"] == "Bearer " + "x" * 32
    with pytest.raises(HTTPException) as error:
        await adapter.fetch_report(uuid.uuid4(), "summary", adapter.AppSummary)
    assert error.value.status_code == 503
    assert len(requests) == 1


@pytest.mark.parametrize("mode", ["redirect", "unauthorized", "invalid", "oversize", "timeout"])
async def test_reporting_failures_are_bounded_and_redacted(monkeypatch, mode):
    app_id = uuid.uuid4()
    connection = ReportingAdapter(
        base_url="https://civil.example/api/v1/control", token="secret" * 8
    )
    monkeypatch.setattr(
        adapter, "get_settings", lambda: SimpleNamespace(reporting_adapters={app_id: connection})
    )
    calls = []

    def handle(request):
        calls.append(request)
        if mode == "timeout":
            raise httpx.ReadTimeout("private detail", request=request)
        if mode == "redirect":
            return httpx.Response(302, headers={"Location": "https://other.example"})
        if mode == "unauthorized":
            return httpx.Response(401, text="private detail")
        if mode == "oversize":
            return httpx.Response(200, content=b"x" * 1_048_577)
        return httpx.Response(200, json={"private": "detail"})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        adapter.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    with pytest.raises(HTTPException) as error:
        await adapter.fetch_report(app_id, "summary", adapter.AppSummary)
    assert error.value.status_code == 502
    assert error.value.detail == "Application reporting is temporarily unavailable"
    assert len(calls) == 1


@pytest.mark.parametrize(
    "url",
    [
        "http://civil.example/control",
        "https://user:pass@civil.example",
        "https://civil.example?token=x",
    ],
)
def test_reporting_rejects_unsafe_config(url):
    with pytest.raises(ValidationError):
        ReportingAdapter(base_url=url, token="x" * 32)
