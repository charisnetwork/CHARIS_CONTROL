"""Opt-in real-database tests: plan card content, advertised offers and atomic plan saves."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from test_feature_catalog_postgres import MANIFEST, client_for
from test_razorpay_postgres import URL, environment, pytestmark  # noqa: F401  (shared fixture)

from app.db.models import (
    AppFeature,
    Coupon,
    CouponKind,
    CouponPlan,
    CouponStatus,
    PlanEntitlement,
    PlanUiConfig,
    PlanUiItem,
    SubscriptionPlan,
    ValueType,
)
from app.domains.catalog.schemas import EntitlementInput, PlanCreate, PlanUpdate
from app.domains.catalog.service import catalog_service
from app.domains.coupons.service import coupon_service


async def add_coupon(env, code, **overrides):
    now = datetime.now(UTC)
    values = {
        "application_id": env.app.id,
        "name": f"{code} offer",
        "code": code,
        "kind": CouponKind.PROMOTION,
        "discount_type": ValueType.PERCENTAGE,
        "discount_value": Decimal("50"),
        "starts_at": now - timedelta(days=1),
        "ends_at": now + timedelta(days=30),
        "maximum_redemptions": 100,
        "status": CouponStatus.ACTIVE,
        **overrides,
    }
    async with env.sessions() as db:
        coupon = Coupon(**values)
        db.add(coupon)
        await db.commit()
        return coupon


async def create(env, **fields):
    payload = PlanCreate(
        name=fields.pop("name", "Pro Monthly"),
        price=fields.pop("price", Decimal("499")),
        duration_value=1,
        duration_unit="month",
        user_limit_unlimited=True,
        **fields,
    )
    async with env.sessions() as db:
        plan, _ = await catalog_service.create_plan(
            db,
            application_id=env.app.id,
            principal=env.principal,
            payload=payload,
            correlation_id="qa-plan-cards",
        )
        return plan


async def update(env, plan, **fields):
    async with env.sessions() as db:
        current = await db.get(SubscriptionPlan, plan.id)
        updated, entitlements = await catalog_service.update_plan(
            db,
            application_id=env.app.id,
            plan_id=plan.id,
            principal=env.principal,
            payload=PlanUpdate(expected_version=current.version, **fields),
            correlation_id="qa-plan-cards",
        )
        return updated, entitlements


def test_card_text_is_plain_and_bounded():
    base = {
        "name": "Pro",
        "price": "1",
        "duration_value": 1,
        "duration_unit": "month",
        "user_limit_unlimited": True,
    }
    cleaned = PlanCreate(**base, highlights=["  Unlimited   projects ", "", "Priority support"])
    assert cleaned.highlights == ["Unlimited projects", "Priority support"]
    assert cleaned.code is None and cleaned.currency == "INR"
    for bad in (
        {"highlights": ["<script>alert(1)</script>"]},
        {"highlights": ["Same", "same"]},
        {"highlights": [f"Line {n}" for n in range(13)]},
        {"highlights": ["x" * 121]},
        {"tagline": "Best <b>plan</b>"},
        {"artwork": "https://tracker.example/pixel.gif"},
        {"accent": "#ff0000"},
    ):
        with pytest.raises(ValidationError):
            PlanCreate(**base, **bad)


async def test_codes_are_generated_and_offers_must_be_usable(environment):  # noqa: F811
    env = environment
    first = await create(env, name="Pro Monthly", highlights=["Unlimited projects"])
    second = await create(env, name="Pro-Monthly!", price=Decimal("599"))
    assert (first.code, second.code) == ("pro_monthly", "pro_monthly_2")
    assert first.highlights == ["Unlimited projects"] and first.artwork == "auto"

    live = await add_coupon(env, "LAUNCH50")
    ended = await add_coupon(
        env,
        "OLD10",
        starts_at=datetime.now(UTC) - timedelta(days=10),
        ends_at=datetime.now(UTC) - timedelta(days=1),
        status=CouponStatus.EXPIRED,
    )
    elsewhere = await add_coupon(env, "OTHERPLAN")
    async with env.sessions() as db:
        db.add(CouponPlan(application_id=env.app.id, coupon_id=elsewhere.id, plan_id=env.plan.id))
        await db.commit()

    for coupon, message in ((ended, "ended"), (elsewhere, "other plans")):
        with pytest.raises(HTTPException) as rejected:
            await update(env, first, offer_coupon_id=coupon.id)
        assert rejected.value.status_code == 422 and message in rejected.value.detail
    with pytest.raises(HTTPException):
        await update(env, first, offer_coupon_id=live.id, coupons_allowed=False)

    updated, _ = await update(env, first, offer_coupon_id=live.id, artwork="rocket")
    assert updated.offer_coupon_id == live.id and updated.artwork == "rocket"

    # Deleting the coupon quietly removes the advertised offer.
    async with env.sessions() as db:
        await coupon_service.delete_coupon(
            db,
            application_id=env.app.id,
            coupon_id=live.id,
            principal=env.principal,
            correlation_id="qa-plan-cards",
        )
    async with env.sessions() as db:
        assert (await db.get(SubscriptionPlan, first.id)).offer_coupon_id is None


async def test_plan_and_features_save_together(environment):  # noqa: F811
    env = environment
    async with client_for(env) as client:
        published = await client.put(
            f"/integrations/apps/{env.app.id}/feature-catalog", json=MANIFEST
        )
        assert published.status_code == 200
    async with env.sessions() as db:
        found = {
            f.code: f
            for f in (
                await db.scalars(select(AppFeature).where(AppFeature.application_id == env.app.id))
            ).all()
        }
    plan = await create(env, name="Team")
    good = EntitlementInput(feature_id=found["projects"].id, enabled=True, limit_type="unlimited")
    # "tenders" is an on/off feature, so a numeric limit is invalid: nothing may be saved.
    bad = EntitlementInput(
        feature_id=found["tenders"].id,
        enabled=True,
        limit_type="limited",
        limit_value=5,
        unit="tenders",
        reset_period="monthly",
    )
    with pytest.raises(HTTPException):
        await update(env, plan, name="Team Plus", entitlements=[good, bad])
    async with env.sessions() as db:
        unchanged = await db.get(SubscriptionPlan, plan.id)
        assert unchanged.name == "Team" and unchanged.version == plan.version
        assert not (
            await db.scalars(select(PlanEntitlement).where(PlanEntitlement.plan_id == plan.id))
        ).all()

    updated, entitlements = await update(env, plan, name="Team Plus", entitlements=[good])
    assert updated.name == "Team Plus" and [e.feature_id for e in entitlements] == [
        found["projects"].id
    ]


async def test_catalog_shows_card_content_and_only_live_offers(environment):  # noqa: F811
    env = environment
    offer = await add_coupon(env, "DIWALI25", discount_value=Decimal("25"))
    async with env.sessions() as db:
        plan = await db.get(SubscriptionPlan, env.plan.id)
        plan.highlights = ["Unlimited projects", "Priority support"]
        plan.artwork, plan.accent, plan.offer_coupon_id = "crown", "violet", offer.id
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
    async with client_for(env) as client:
        path = f"/integrations/apps/{env.app.id}/subscription-catalog"
        card = (await client.get(path)).json()["plans"][0]
        assert card["highlights"] == ["Unlimited projects", "Priority support"]
        assert (card["artwork"], card["accent"], card["coupons_allowed"]) == (
            "crown",
            "violet",
            True,
        )
        assert card["offer"]["code"] == "DIWALI25"
        async with env.sessions() as db:
            (await db.get(SubscriptionPlan, env.plan.id)).artwork = "auto"
            await db.commit()
        # A lone paid plan that is not recommended gets the rocket; accent stays as chosen.
        auto = (await client.get(path)).json()["plans"][0]
        assert (auto["artwork"], auto["accent"]) == ("rocket", "violet")
        assert Decimal(card["offer"]["discount_value"]) == 25

        async with env.sessions() as db:
            (await db.get(Coupon, offer.id)).status = CouponStatus.DISABLED
            await db.commit()
        assert (await client.get(path)).json()["plans"][0]["offer"] is None
