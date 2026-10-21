"""Opt-in real-database tests: app-published feature catalogs and storefront plan fields."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from test_razorpay_postgres import URL, environment, pytestmark  # noqa: F401  (shared fixture)

from app.api.dependencies import require_integration_credential
from app.db.models import (
    AppFeature,
    DurationUnit,
    PlanEntitlement,
    PlanStatus,
    PlanUiConfig,
    PlanUiItem,
    SubscriptionPlan,
)
from app.db.session import get_db_session
from app.domains.subscriptions.integration import router as subscription_router

MANIFEST = {
    "contract_version": 1,
    "features": [
        {"code": "projects", "name": "Projects", "group": "Sites", "description": "Create sites"},
        {"code": "tenders", "name": "Tenders", "group": "Sales"},
        {
            "code": "photos_per_project",
            "name": "Photos per project",
            "group": "Sites",
            "kind": "limit",
            "unit": "photos",
            "reset_periods": ["total"],
        },
    ],
}


def client_for(env):
    app = FastAPI()
    app.include_router(subscription_router)

    async def session():
        async with env.sessions() as db:
            yield db

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[require_integration_credential] = lambda: SimpleNamespace(
        application_id=env.app.id
    )
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def features(env):
    async with env.sessions() as db:
        rows = await db.scalars(select(AppFeature).where(AppFeature.application_id == env.app.id))
        return {f.code: f for f in rows.all()}


async def test_app_publishes_features_and_storefront_shows_them(environment):  # noqa: F811
    env = environment
    path = f"/integrations/apps/{env.app.id}"
    async with env.sessions() as db:
        db.add(AppFeature(application_id=env.app.id, code="photo_upload", name="Typed by hand"))
        await db.commit()
    async with client_for(env) as client:
        first = await client.put(path + "/feature-catalog", json=MANIFEST)
        assert first.status_code == 200, first.text
        assert {k: first.json()[k] for k in ("created", "updated", "retired")} == {
            "created": 3,
            "updated": 0,
            "retired": 0,
        }
        again = await client.put(path + "/feature-catalog", json=MANIFEST)
        assert again.json()["created"] == 0 and again.json()["updated"] == 0
        renamed = {
            "contract_version": 1,
            "features": [
                {**MANIFEST["features"][0], "name": "Project sites"},
                MANIFEST["features"][2],
            ],
        }
        changed = (await client.put(path + "/feature-catalog", json=renamed)).json()
        # Renamed "projects"; "photos_per_project" moved up a place after "tenders" left.
        assert (changed["updated"], changed["retired"]) == (2, 1)
        found = await features(env)
        assert found["projects"].name == "Project sites" and found["projects"].source == "app"
        assert found["tenders"].active is False  # No longer published by the app.
        assert found["photos_per_project"].supports_numeric_limit is True
        assert found["photo_upload"].source == "manual" and found["photo_upload"].active is True
        for bad in [
            {"contract_version": 1, "features": [MANIFEST["features"][0]] * 2},
            {
                "contract_version": 1,
                "features": [{"code": "x_limit", "name": "X", "kind": "limit"}],
            },
            {"contract_version": 1, "features": [{"code": "Bad Code", "name": "X"}]},
        ]:
            assert (await client.put(path + "/feature-catalog", json=bad)).status_code == 422

        async with env.sessions() as db:
            plan = SubscriptionPlan(
                application_id=env.app.id,
                name="Pro yearly",
                code="pro_yearly",
                price=Decimal("3990"),
                compare_at_price=Decimal("7982"),
                tagline="More flexibility",
                badge="Most Popular",
                pricing_group="pro",
                currency="INR",
                duration_value=1,
                duration_unit=DurationUnit.YEAR,
                status=PlanStatus.ACTIVE,
                effective_at=datetime.now(UTC) - timedelta(days=1),
                user_limit_unlimited=True,
            )
            db.add(plan)
            await db.flush()
            db.add_all(
                [
                    PlanEntitlement(
                        application_id=env.app.id,
                        plan_id=plan.id,
                        feature_id=found["projects"].id,
                        enabled=True,
                        limit_type="unlimited",
                    ),
                    PlanEntitlement(
                        application_id=env.app.id,
                        plan_id=plan.id,
                        feature_id=found["photos_per_project"].id,
                        enabled=True,
                        limit_type="limited",
                        limit_value=200,
                        unit="photos",
                        reset_period="total",
                    ),
                ]
            )
            config = PlanUiConfig(application_id=env.app.id)
            db.add(config)
            await db.flush()
            db.add(
                PlanUiItem(
                    application_id=env.app.id,
                    config_id=config.id,
                    plan_id=plan.id,
                    visible=True,
                    display_order=0,
                )
            )
            await db.commit()
        catalog = (await client.get(path + "/subscription-catalog")).json()
    card = catalog["plans"][0]
    assert (card["tagline"], card["badge"], card["pricing_group"]) == (
        "More flexibility",
        "Most Popular",
        "pro",
    )
    assert Decimal(card["compare_at_price"]) == Decimal("7982")
    assert [e["name"] for e in card["entitlements"]] == ["Project sites", "Photos per project"]
    assert card["entitlements"][0]["group"] == "Sites"
    assert {f["code"] for f in catalog["features"]} == {
        "projects",
        "photos_per_project",
        "photo_upload",
    }
