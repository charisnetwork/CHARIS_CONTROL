"""Opt-in integration test for an isolated, migrated local QA database.

Set CHARIS_QA_API_URL and CHARIS_QA_PASSWORD to run. Creates uniquely named
synthetic records; never use against a shared or production environment.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import httpx
import pytest


@pytest.mark.skipif(not os.getenv("CHARIS_QA_API_URL"), reason="Local QA server not configured")
def test_local_application_workflow() -> None:
    url = os.environ["CHARIS_QA_API_URL"]
    assert urlparse(url).hostname in {"localhost", "127.0.0.1"}
    suffix = uuid.uuid4().hex[:10]
    now = datetime.now(UTC)
    with httpx.Client(base_url=url, timeout=20) as client:

        def call(method: str, path: str, payload: dict | None = None, expected: int = 200):
            response = client.request(method, path, json=payload)
            assert response.status_code == expected, (
                method,
                path,
                response.status_code,
                response.text[:500],
            )
            return response.json()

        login = call(
            "POST",
            "/auth/login",
            {"email": "qa@example.com", "password": os.environ["CHARIS_QA_PASSWORD"]},
        )
        client.headers["Authorization"] = f"Bearer {login['access_token']}"
        app = call(
            "POST",
            "/apps",
            {
                "name": f"QA {suffix}",
                "slug": f"qa-{suffix}",
                "control_api_base_url": "https://example.com/control",
                "environment": "staging",
            },
            201,
        )
        app_id = app["application"]["id"]
        base = f"/apps/{app_id}"
        feature = call(
            "POST",
            base + "/features",
            {
                "name": "Documents",
                "code": "documents",
                "default_unit": "documents",
                "supports_numeric_limit": True,
                "allowed_reset_periods": ["monthly"],
            },
            201,
        )
        plan = call(
            "POST",
            base + "/plans",
            {
                "name": "QA Monthly",
                "code": "qa_monthly",
                "price": "100",
                "currency": "INR",
                "duration_value": 1,
                "duration_unit": "month",
                "user_limit_unlimited": True,
                "status": "active",
                "effective_at": now.isoformat(),
                "entitlements": [
                    {
                        "feature_id": feature["id"],
                        "enabled": True,
                        "limit_type": "limited",
                        "limit_value": 10,
                        "unit": "documents",
                        "reset_period": "monthly",
                    }
                ],
            },
            201,
        )
        subscriber = call(
            "POST",
            base + "/subscribers",
            {"name": "QA Subscriber", "external_id": "qa-subscriber", "metadata": {"test": True}},
            201,
        )
        assert subscriber["metadata"] == {"test": True}
        coupon = call(
            "POST",
            base + "/coupons",
            {
                "name": "QA Discount",
                "code": "QA10",
                "discount_type": "percentage",
                "discount_value": "10",
                "starts_at": (now - timedelta(days=1)).isoformat(),
                "ends_at": (now + timedelta(days=1)).isoformat(),
                "maximum_redemptions": 1,
                "first_subscription_only": True,
                "plan_ids": [plan["id"]],
            },
            201,
        )
        subscription = call(
            "POST",
            base + "/subscriptions",
            {
                "subscriber_id": subscriber["id"],
                "plan_id": plan["id"],
                "starts_at": now.isoformat(),
                "coupon_code": coupon["code"],
                "coupon_idempotency_key": "qa-redeem-001",
            },
            201,
        )
        assert subscription["commercial_snapshot"]["final_price"] == "90.00"
        usage = base + f"/subscriptions/{subscription['id']}/usage/documents/consume"
        request = {"idempotency_key": "qa-usage-001", "amount": 10, "operation": "create"}
        assert call("POST", usage, request)["consumed"]
        assert call("POST", usage, request)["idempotent_replay"]
        assert not call("POST", usage, {**request, "idempotency_key": "qa-usage-002", "amount": 1})[
            "consumed"
        ]
        notification = call(
            "POST",
            base + "/notifications",
            {
                "title": "QA notice",
                "message": "Local test",
                "audience_type": "plans",
                "plan_ids": [plan["id"]],
            },
            201,
        )
        assert (
            call("POST", base + f"/notifications/{notification['id']}/dispatch")["recipient_count"]
            == 1
        )
        for path in [
            "/overview",
            "/plans",
            "/subscribers",
            "/subscriptions",
            "/coupons",
            "/affiliates",
            "/notifications",
            "/reports/summary",
            "/settings/credentials",
            "/settings/health",
            "/settings/subscription-storefront",
            "/team",
            "/audit",
        ]:
            call("GET", base + path)
