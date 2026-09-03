# Charis Control Centre working guide

## Boundaries

- Control Centre and Bill Easy are separate repositories and PostgreSQL databases.
- Never run `prisma db push`, destructive database commands, or a Bill Easy migration from this repository.
- Do not commit, push, reset, clean, or create branches without explicit approval.
- Private signing keys, webhook secrets, and application credentials remain server-side.

## Subscription domain

- An `Application` is a product; a `Plan` is a reusable catalog offering.
- A `SubscriptionReference` assigns one plan to one downstream tenant/customer.
- Plan duration pricing, promotional tiers, and plan-feature assignments are catalog data.
- A subscription stores a commercial and entitlement snapshot so later catalog edits do not rewrite history.
- Usage periods are distinct from subscription duration (for example, a 3-year subscription can have a monthly invoice quota).

## Entitlement contract

The Control Centre returns an RSA-SHA256 signed compact token:

`base64url(payload).base64url(signature)`

`exp`/`iat` use Unix seconds. The payload is application- and tenant-scoped and includes plan, subscription status, feature/limit snapshots, billing cycle, and usage period. SDK cache keys use `applicationId:tenantId`.

## Recent work

- Added catalog pricing, promotion, plan-feature, commercial snapshot, and usage-period schema definitions (migration still requires reviewed creation/deployment).
- Changed subscription creation to quote and snapshot an existing plan rather than create a plan/customer hybrid.
- Added a quote endpoint and redesigned the subscription modal around tenant assignment, duration, coupon, and final price.
- Extended entitlement payloads with subscription and usage-period context.
- Added a public, credential-free catalog projection at `GET /api/public/catalog/:applicationSlug`; it is the only Control Centre API intended for a product's browser pricing UI.
- Corrected plan-catalog API/UI contracts, restricted plan creation to management roles, and replaced the Control Centre customer/dashboard mock data with Control Centre records and the authenticated downstream adapter contract.
- Hardened quote/subscription behavior: supported durations are explicit, duration tiers are calculated period-by-period, coupon codes are uppercase, plan scope is enforced, and coupon consumption is recorded atomically with the subscription snapshot.
- Entitlement fallback now grants only explicit plan entitlements, never every feature in a subscription model. SDK denials return structured feature/quota upgrade responses and accept the documented entitlement header form.
- Bill Easy now exposes its approved, API-key-guarded `/control` adapter for health, tenant, usage, activity, and revenue projections. Its public pricing views consume the Control Centre public catalog without browser credentials; if unavailable they show an explicit unavailable state rather than fabricated pricing.

## Verification

Run only safe checks locally: `npx tsc --noEmit` for API, web, and SDK. Production database migrations must be reviewed and applied through `prisma migrate deploy` against Control Centre only.

## Current deployment constraint

- The current Control Centre database was synchronized before a complete Prisma migration baseline existed. Do not invent or mark migration history as applied blindly, and do not switch Railway away from its temporary pre-launch schema command until a reviewed baseline migration has been created and reconciled against the Control Centre database.
- Never use this repository to access Bill Easy's database. Bill Easy's `/control` adapter is the only approved operational-data boundary.
