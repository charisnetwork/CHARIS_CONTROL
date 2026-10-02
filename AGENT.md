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
- Every catalog, subscriber, subscription, entitlement, coupon, affiliate, report, notification, health, credential, webhook, and audit record is scoped to one selected application.
- Applications register their own feature catalogs. Never hard-code Bill Easy feature names into the Control Centre domain.

## Target architecture

- `apps/control_api` is the replacement Python 3.13 backend: FastAPI, Pydantic, SQLAlchemy 2, Alembic, and PostgreSQL.
- API routes are versioned under `/api/v1`; downstream product adapters use a separate versioned control contract.
- The React/TypeScript frontend in `apps/web` must route through application selection before rendering any application-owned data.
- FastAPI is the only tracked backend. Do not reintroduce Express/Prisma or runtime schema synchronization.
- A clean PostgreSQL schema is allowed. Do not migrate or reuse the old development records.

## Security and entitlement contracts

- Owner and team sessions use Argon2id passwords, short-lived JWT access tokens, opaque hashed refresh sessions, refresh rotation, CSRF validation, persistent login throttling, and exact app-scoped permissions.
- Integration credentials are shown once and stored only as a hash or an external encrypted-secret reference.
- Cross-application foreign keys and query filters are mandatory. Owners bypass permission grants, not application existence or scoping.
- Entitlements support enabled/disabled, limited/unlimited, numerical limits, units, and reset periods. Usage and coupon redemption must be transaction-safe and idempotent.
- The eventual downstream entitlement token remains application- and tenant-scoped and deny-by-default. SDK cache keys use `applicationId:tenantId`.

## Recent work

- Read and reconciled the complete DPR against the repository before implementation.
- Inventoried reusable Express concepts: product adapter boundary, outbound URL validation, dynamic feature catalogs, immutable commercial/entitlement snapshots, atomic coupon usage, signed entitlements, event outbox, public catalog, commissions, and app health.
- Added the clean FastAPI service foundation, strict environment validation, exact CORS/trusted-host boundaries, correlation IDs, liveness/readiness checks, and a no-seed owner provisioning command.
- Added secure login, refresh rotation, logout, current-user APIs, persistent login throttling, live session validation, and application-scoped RBAC.
- Added owner/team application registry APIs with safe integration URL validation, one-time hashed credential issuance, archiving, and audit records.
- Added a 31-table app-scoped SQLAlchemy schema and matching frozen Alembic baseline covering authentication, permissions, features, plans, entitlements, subscribers, usage, payments, coupons, affiliates, notifications, health, credentials, report jobs, webhooks, and audit logs.
- Added backend tests for security, configuration, application isolation, registry behavior, health, and schema validation.
- Replaced the frontend's global entry route with login, `/apps` application selection, and `/apps/:appId/...` scoped navigation. Access tokens are memory-only, refresh uses the secure session contract, and the hard-coded Railway API fallback was removed.
- Added an owner-only application registration UI with one-time credential display. Unported legacy global modules are no longer routed; scoped placeholders remain until each replacement API passes its phase gate.
- Added the selected-application overview API and UI. Control Centre counts and latest recorded health are queried only by `application_id`; missing downstream health never falls back to fabricated data.
- Added app-owned feature catalog and subscription plan APIs, typed plan entitlements, capability validation, audit records, and same-transaction webhook outbox events. The Plans UI now creates and displays dynamic features, plans, and limited/unlimited entitlements without Bill Easy-specific fields.
- Added a deny-by-default backend entitlement evaluator that distinguishes missing, disabled, unlimited, within-limit, and limit-exceeded decisions.
- Added app-scoped subscriber and subscription APIs/UI, separate subscription RBAC permissions, active-plan assignment, calendar-correct expiry, and immutable commercial/entitlement snapshots.
- Added transaction-safe usage consumption using PostgreSQL row locks, period counters, database uniqueness, and app-wide idempotency keys. Replays must match the original counter, amount, and operation; quota denial occurs before incrementing usage.
- Added Phase 6 app-scoped coupon APIs and UI with normalized codes, promotion/affiliate schema validation, optional plan scope, validity windows, total and per-subscriber redemption limits, first-subscription eligibility, minimum plan duration, and fixed-discount currency matching.
- Coupon redemption now runs inside subscription creation: the coupon row is locked, eligibility is rechecked, the counter and idempotent redemption record are written in the same database transaction, and immutable snapshots retain gross price, discount, coupon code, and final price.
- Added Phase 7 app-scoped affiliate APIs/UI with partner creation, active/disabled/archived status handling, commission summaries by currency, immutable ledger history, and idempotent manual payout/adjustment records.
- Affiliate coupon redemption now verifies that the partner is active and atomically creates an earned commission ledger entry from the net subscription amount. Percentage and fixed commissions are capped and currency-validated; serialized payouts cannot exceed the available currency balance.
- Added Phase 8 app-scoped push-notification APIs/UI for drafts, scheduled messages, relative deep links, all-subscriber or selected-plan audiences, cancellation, and explicit send-now actions.
- Dispatch resolves only active subscribers inside the selected application, creates one deterministic/idempotent delivery per recipient, and emits a durable `notification.dispatch.requested` outbox event in the same transaction. The CLI `process-notifications` command safely materializes due schedules; the application adapter performs provider delivery.
- Added Phase 9 selected-application report APIs/UI with bounded date ranges, subscriber/subscription/coupon/usage counts, collected revenue and earned commission by currency, active plan distribution, and subscription trends.
- Added audited CSV exports for subscriptions, payments, coupon redemptions, affiliate commissions, and usage events. Export queries are app-scoped, capped at 10,000 rows, streamed without local report files, recorded as completed report jobs, and neutralize spreadsheet formulas.
- Added Phase 10 selected-application settings APIs/UI for validated registry URLs, integration metadata, app-reported health history, one-time credential rotation, and subscription storefront presentation.
- Application adapters authenticate with `X-Charis-App-Key` against hashed, app-scoped active/grace credentials. Rotation serializes credential versions, exposes the new secret once, and supports a bounded grace period; health payloads reject secret-like fields.
- Storefront settings validate every recommended/visible plan against the selected application and atomically replace display order, labels, visibility, comparison, and billing-period preferences.
- Added Phase 11 owner-controlled team creation and permission replacement plus paginated app-scoped audit-log access. Team accounts use the same Argon2id authentication and cannot be created or re-permissioned by non-owners.
- Added API security headers, request-size rejection, integration credential verification using constant-time digest comparison, and final isolation/schema regression tests.
- Removed the tracked Express/Prisma backend after the FastAPI replacement gates passed. Root Railway deployment now builds `apps/control_api`, applies only reviewed Alembic migrations during pre-deploy, and starts Uvicorn without runtime schema synchronization.

## Verification

Run the FastAPI checks from `apps/control_api`: `.venv/bin/ruff format --check app tests alembic`, `.venv/bin/ruff check app tests alembic`, `.venv/bin/mypy app`, `.venv/bin/pytest`, and `.venv/bin/alembic upgrade head --sql`. The completed Phase 11 suite passes 70 backend tests, frontend lint/production build, SDK build/test, and offline Alembic generation. The frontend production build currently reports a non-blocking bundle-size warning.

## Deployment constraints

- Do not deploy the FastAPI baseline against the existing Prisma schema. Provision a clean Control Centre PostgreSQL database when the replacement reaches its deployment phase.
- Apply only the reviewed Alembic migration to a clean Control Centre PostgreSQL database before deployment.
- Never use this repository to access Bill Easy's database. Bill Easy's `/control` adapter is the only approved operational-data boundary.
