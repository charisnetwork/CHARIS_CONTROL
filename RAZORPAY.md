# Razorpay checkout — Charis OS

Customer self-service checkout is now wired inside Civil through tenant-scoped,
app-key-authenticated OS adapter routes. OS still owns payment verification,
ledger and entitlement activation; the customer never signs into OS. Existing
administrator checkout remains a support tool. These are one-time plan-term
payments, not Razorpay recurring Subscriptions or automatic renewal.
Apply migration20261020_0003 after20261013_0002. See
../charis_civil/SUBSCRIPTION_ARCHITECTURE.md for the corrected ownership contract.
Real provider/browser payment testing still requires configured merchant test keys.

Since 2026-10-20 the customer adapter also supports **coupons/partner codes**, a read-only
**quote**, and **free (₹0) plans**. Bill Easy (`../bill easy/CHARIS_OS_INTEGRATION.md`) and Civil
both use it. All apps share one Razorpay account; every order, payment, coupon and commission is
recorded against its application, so finances stay separate per app.

## Deploy safely

1. Deploy the OS changes with payments disabled (the default).
2. Run `.venv/bin/alembic upgrade head` against the **Control OS database only**.
   New revision `20261013_0002` creates `razorpay_checkouts`; do not run it against
   Civil, Bill Easy or an old Prisma database. Never use runtime schema sync.
3. Set these variables on the **Control OS backend**, never Vite/Cloudflare:

   ```text
   RAZORPAY_ENABLED=true
   RAZORPAY_MODE=test
   RAZORPAY_KEY_ID=<Razorpay test key ID>
   RAZORPAY_KEY_SECRET=<matching key secret>
   RAZORPAY_WEBHOOK_SECRET=<independent random secret, minimum 16 characters>
   ```

4. Configure a public HTTPS Razorpay webhook at:
   `https://<OS API origin>/api/v1/payments/razorpay/webhook`.
   Subscribe to **payment.captured** and **refund.processed**. Use the same
   independent webhook secret, not the API key secret. Set Razorpay's capture
   settings to automatic capture. Authorized-only payments grant nothing.
5. Use a staging application record for test payments. Production app records
   reject test-mode checkout/activation. No real merchant credentials are stored
   in this repository or used by the automated tests.
6. Verify successful, dismissed, failed and delayed checkout; callback loss;
   webhook retries; duplicate verification; partial/full refunds; current-term
   changes during checkout; permissions; and Civil access refresh. Confirm
   corresponding captured payment and order in Razorpay's merchant dashboard.
7. Only after test-mode verification switch to live keys, `RAZORPAY_MODE=live`,
   and configure the live webhook. Do not mix test/live keys or webhook secrets.
   Key rotation needs reconciliation of outstanding orders before switching.

If the OS frontend has a Content Security Policy, allow the official Razorpay
checkout script/frame/connect origins according to current Razorpay guidance.
All application API calls still use the existing environment-driven API client.
Only the public key ID is returned to the browser; API/webhook secrets stay server-side.

## APIs

All routes below use `/api/v1`:

- `GET /apps/{app_id}/payments/razorpay`: capability and latest 50 saved orders;
  requires VIEW_SUBSCRIPTIONS.
- `POST /apps/{app_id}/payments/razorpay/orders`: requires MANAGE_SUBSCRIPTIONS.
  Body: subscriber_id, plan_id, UUID idempotency_key, reason; when replacing or
  renewing a term also previous_subscription_id and previous_version.
- `POST /apps/{app_id}/payments/razorpay/verify`: same manage permission;
  razorpay_order_id, razorpay_payment_id, razorpay_signature.
- `POST /apps/{app_id}/payments/razorpay/checkouts/{id}/reconcile`: same manage
  permission; payment_id from merchant dashboard. Fetches provider state; it
  cannot mark an unpaid order paid.
- `POST /payments/razorpay/webhook`: no user cookie/session; requires valid raw
  body HMAC. Payload limited to 64 KiB and provider status independently fetched.

## Pricing and activation

- INR plans only, INR 1–10,00,000, at most two decimal places. The **server** reads
  the catalog price; clients cannot submit the amount/currency/entitlements.
- Catalog price minus an optional app-scoped coupon is the final charge. The coupon
  is validated with the same rules as admin assignment (status/window, plan scope,
  limits, first-subscription, per-subscriber) and must leave at least INR 1. Tax/GST
  invoices, storage add-ons, mid-term proration and carry-over credits are **not**
  supported. Configure appropriate final prices before live enablement.
- `POST .../checkout/quote` {plan_id, coupon_code?} prices a plan with the real rules
  inside a rolled-back transaction: nothing is saved, no redemption is reserved.
- Creating an order **reserves** the coupon redemption. Affiliate commission is earned
  only when the payment is verified (once, even with concurrent callbacks) and a full
  refund adds an equal negative adjustment. Abandoned orders never earn commission;
  their reserved redemption is not released automatically yet.
- A visible plan priced INR 0 activates immediately through `.../checkout/orders`
  without Razorpay, only when the customer has no current active/suspended term
  (lapsed terms are marked expired first). Coupons do not apply to free plans.
  The order key must include the coupon: the same key with a different coupon is 409.
- Unpaid orders older than 24 hours become `expired` (migration 20261020_0004) when the
  customer starts a new order, or via the daily `python -m app.cli expire-checkouts`: the
  pending term is cancelled and the coupon reservation released. A payment that still
  arrives for an expired order is recorded and set to `review`, never lost or auto-activated.
- Create an immutable pending subscription snapshot before creating the provider
  order. Pending terms are excluded from the Civil entitlement adapter.
- Activation requires fetched payment captured=true, captured/refunded status,
  exact amount/currency/order, and matching saved order receipt/notes. Browser
  callbacks additionally require the order/payment signature. No payment is
  trusted just because the browser or webhook claims it succeeded.
- Activation starts a full calendar term at verification time. Replacement retires
  the explicitly selected old term. Subscription version changes or a different
  current term produce **review**, not an overwrite. Subscriber/application
  suspension or archiving also prevents automatic activation.
- Provider order creation is a non-transactional network side effect: save intent
  first and never automatically repeat an ambiguous create. Same-key requests
  return the saved intent. Captured webhooks or reconciliation can recover an
  unbound order using its receipt/notes. Abandoned intents currently have no
  automatic expiry/cleanup job; orders remain visible for explicit reconciliation.
- Each payment and order is globally bound to one checkout. Subscriber/checkout
  row locks serialize activation and duplicate callbacks. Status/history/audit,
  payment ledger and outbox commit together. Outbox dispatch is still deferred;
  Civil refreshes via its existing bounded subscription cache.

## Refunds and review

- Refunds are initiated by an authorized merchant **in Razorpay**, not by this UI.
- A verified full refund cancels the associated paid term and records REFUNDED;
  it does not restore the old replaced term. A partial refund records remaining
  collected value and flags review; an already active term retains access until
  the administrator decides otherwise. A pending term is never activated after
  any refund. Stale events cannot erase a recorded refund.
- Review means captured money is recorded, but access may not have activated.
  Do not charge again. Investigate/refund in Razorpay and reconcile. There is no
  automatic review override or automatic refund API in this release.
- Reports show net captured Razorpay value after known refunds, grouped using
  original paid_at. This is not settlement accounting or a refund-date cash ledger.

## Verification evidence

Both migrations applied to a fresh isolated PostgreSQL 17 database. Provider HTTP
calls were mocked; real database tests exercise eight concurrent callbacks,
single ledger creation, idempotency, wrong amounts/authorization/app rejection,
stale replacement review, successful replacement, full/partial refunds, stale
captured events, timeout recovery and replacement rollback.

No hosted checkout, real Razorpay test-mode payment, merchant account configuration,
settlement, production database migration or deployment is certified by these tests.
