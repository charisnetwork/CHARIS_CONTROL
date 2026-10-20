# Charis OS — App Integration Guide (master)

How every CHARIS AI Technologies app (Civil, Bill Easy, and future apps) connects to Charis OS.
Contract version **1**. Reference implementations: Civil
(`charis_civil/apps/api/src/services/subscription.service.ts`) and Bill Easy
(`bill easy/backend/services/charisOsService.js`).

## 1. Who owns what

| Charis OS (control plane) | Each app (data plane) |
| --- | --- |
| Plans, features, limits, prices | Its own users, logins, roles |
| Coupons and partner (affiliate) codes | Its own business data and database |
| Payment verification (one shared Razorpay account) | Enforcing features and limits on every request |
| Revenue, commissions, reports — **separate per app** | Counting its own usage (invoices, photos, …) |
| Push notifications | Its own plan/checkout screens |

Customers never log in to OS. Apps call OS **from their backend only**, with an app key.

## 2. Registering a new app in OS

1. OS website → **Register application** (name, slug, frontend URL, backend URL).
   Copy the **app key** — it is shown once. (Lost? App → Settings → rotate credential.)
2. The **App ID** is in the address bar: `/apps/<APP ID>/overview`.
3. App → **Plans**: create the app's **features** (codes the app will check), then **plans**.
   Add a **₹0 plan** if the app is freemium.
4. App → **Settings → Storefront**: make plans visible, pick the recommended plan.
5. Optional: **Coupons**, **Affiliates**, **Notifications**.

Feature codes: lowercase letters, digits, `_` (e.g. `eway_bills`, `invoices`).
On/off features use no limit. Numeric limits need a unit and reset period
(`total`, `daily`, `monthly`, `yearly`, `billing_cycle`).

## 3. Environment variables

**Charis OS backend** (only place Razorpay keys live):

```env
ENVIRONMENT=production
DATABASE_URL=<OS PostgreSQL>
JWT_SIGNING_SECRET=<random 32+ chars>
CORS_ALLOWED_ORIGINS=https://<OS website>
TRUSTED_HOSTS=<OS API host>
RAZORPAY_ENABLED=true
RAZORPAY_MODE=test            # live after testing; key must start rzp_test_ / rzp_live_
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=<16+ chars, same as in Razorpay webhook>
```

**Charis OS website:** `VITE_CONTROL_API_URL=https://<OS API host>` (no `/api/v1`).

**Every app backend:**

```env
CHARIS_SUBSCRIPTION_MODE=enforce        # off = app ignores OS
CHARIS_OS_URL=https://<OS API host>     # origin only, no path
CHARIS_OS_APP_ID=<app ID>
CHARIS_OS_APP_KEY=<app key>
CHARIS_OS_SUMMARY_TOKEN=<random 32+>    # optional: lets OS read the app's summary API
```

Never put the app key or Razorpay secrets in frontend (`VITE_*`) variables or git.

**Razorpay dashboard (test, then live):** webhook URL
`https://<OS API host>/api/v1/payments/razorpay/webhook`, events `payment.captured` and
`refund.processed`, secret = `RAZORPAY_WEBHOOK_SECRET`, automatic capture on.

## 4. API: app → OS

Base: `{CHARIS_OS_URL}/api/v1/integrations/apps/{APP_ID}`
Header on every call: `X-Charis-App-Key: <app key>`. JSON in and out.
`{external_id}` = the app's own customer/company ID (OS calls it the tenant).
OS rejects keys of another app (401) and unknown fields (422).

| # | Method & path | Body | Use |
| --- | --- | --- | --- |
| 1 | `PUT /tenants/{external_id}` | `{name, email?, mobile_number?}` | Register/update the customer. Call at signup and before checkout. Idempotent. |
| 2 | `GET /tenants/{external_id}/subscription` | — | **Entitlement snapshot** — what the customer may do. |
| 3 | `GET /subscription-catalog` | — | Published plans for the app's plan page. |
| 4 | `GET /tenants/{external_id}/checkout` | — | Payments on/off, current term, recent orders (resume). |
| 5 | `POST /tenants/{external_id}/checkout/quote` | `{plan_id, coupon_code?}` | Price preview with coupon. Saves nothing. |
| 6 | `POST /tenants/{external_id}/checkout/orders` | see below | Start payment (or activate a ₹0 plan). |
| 7 | `POST /tenants/{external_id}/checkout/verify` | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` | Confirm payment after the Razorpay popup. |
| 8 | `POST /health` | `{overall_status, frontend_status, backend_status, database_status, checked_at, latency_ms?, dependencies?, incident_summary?}` | Optional health report (`healthy`/`degraded`/`critical`/`unknown`). |

**1 → response** `{contract_version: 1, application_id, tenant_id, subscriber_id, synced: true}`

**2 → snapshot**

```json
{
  "contract_version": 1, "application_id": "<APP_ID>", "tenant_id": "<external_id>",
  "status": "active | pending | suspended | cancelled | expired | unassigned",
  "subscription_id": "…", "plan_name": "Premium",
  "starts_at": "2026-10-20T…Z", "ends_at": "2026-11-20T…Z",
  "entitlements": [
    {"feature_code": "eway_bills", "enabled": true, "limit_type": "unlimited",
     "limit_value": null, "unit": null, "reset_period": null},
    {"feature_code": "invoices", "enabled": true, "limit_type": "limited",
     "limit_value": 50, "unit": "invoices", "reset_period": "monthly"}
  ]
}
```

**3 → catalog** `{contract_version, application_id, checkout_enabled, plans: [{id, name,
description, price, currency, duration_value, duration_unit, recommended, entitlements: […]}]}`

**6 → order body**

```json
{
  "plan_id": "<uuid>",
  "idempotency_key": "<new uuid per attempt; reuse only to retry the same request>",
  "actor_id": "<app user who clicked buy>",
  "coupon_code": "LAUNCH20",
  "previous_subscription_id": "<current_term.id from #4, when changing plan>",
  "previous_version": 3,
  "replacement_acknowledged": true
}
```

Response `{application_id, tenant_id, checkout}`. `checkout` has `order_id`, `amount_minor`
(paise), `currency`, `key_id`, `status` (`ready` → open Razorpay). For a **₹0 plan**, `checkout`
is `null` and `subscription` is returned already **active**.

**7 → response** `{checkout: {status}}`: `paid` (plan active), `review` (money recorded,
support to check — never charge again), `refunded`, `expired`.

Errors from checkout calls carry `{"detail": "<message to show the customer>"}` with
400/404/409/422/503.

## 5. API: OS → app (optional summary)

If the app sets `CHARIS_OS_SUMMARY_TOKEN`, OS (and only OS) may call:

- `GET {app}/api/v1/control/summary?from=&to=` → customer, user, usage counts.
- `GET {app}/api/v1/control/customers?page=&page_size=&search=&status=` → company list.

Header `Authorization: Bearer <token>`. Read-only; never send salaries, ID numbers,
passwords or the customer's own money. (Implemented in Civil.)

## 6. Rules every app must follow

1. **Deny by default.** A feature missing from the snapshot, or `enabled: false`, is not
   allowed. If `status` is not `active`: allow viewing existing records, block changes.
2. **Limits:** `limit_type: "unlimited"` → no cap. `"limited"` → compare the app's own
   usage count with `limit_value` for the `reset_period` (monthly = calendar month, India time).
3. **Cache the snapshot ≤ 60 s** per customer. Clear it right after checkout `orders`,
   `verify`, or a manual "refresh plan" action. If OS is unreachable and the cache has expired,
   return **503** for gated actions — never grant access.
4. **Validate responses**: `application_id` and `tenant_id` must match what you asked for.
5. **Server decides money.** Never accept amount, currency, entitlements, tenant or actor from
   the browser; send only `plan_id`, `coupon_code`, the idempotency key and Razorpay's three
   values. The browser only opens Razorpay with `key_id`, `order_id`, `amount_minor`.
6. Only the customer's owner/admin may buy. One unfinished order at a time — offer **Resume**.
7. Use timeouts (5 s; 20 s for checkout), refuse redirects, cap responses (256 KB).

## 7. Checkout flow

```
Customer (app UI) ──► App backend ──PUT tenant──────────────► OS
                     App backend ──POST quote (coupon)──────► OS   price preview
                     App backend ──POST orders─────────────► OS ──► Razorpay order
Customer pays in Razorpay popup (key_id, order_id)
                     App backend ──POST verify─────────────► OS ──► fetch payment from Razorpay
                                                              OS activates plan, records
                                                              revenue + partner commission
Razorpay ──webhook payment.captured / refund.processed─────► OS   (recovers lost callbacks)
                     App backend ──GET subscription────────► OS   new entitlements
```

Coupon use is reserved when the order is created; partner commission is earned only when
payment is verified and reversed on full refund. Unpaid orders expire after 24 h and release
the coupon. Changing plan starts a new full term immediately (no proration).

## 8. What OS administrators can change

Plans: create, edit (applies to new purchases; existing customers keep their frozen terms),
archive, delete (only if never used). Coupons: create, edit, enable/disable, delete (only if
unused; discount fixed after first use). Partners: create, edit, disable, archive, record
payouts. Subscriptions (support): assign, suspend, resume, cancel, renew/replace.

Scheduled jobs on the OS service: `python -m app.cli process-notifications` (every 5 min),
`python -m app.cli expire-checkouts` (daily).

## 9. Checklist for a new app

- [ ] Registered in OS; app key stored as a backend secret.
- [ ] Features + plans + storefront configured (₹0 plan if freemium).
- [ ] Signup calls #1; free plan claimed via #6 with the ₹0 plan if offered.
- [ ] Middleware enforces rules in §6 on every gated route.
- [ ] Plan page uses #3, #5, #6, #7 and shows Resume from #4.
- [ ] Owner/admin-only purchase; usage counted in the app's database.
- [ ] Tested in Razorpay test mode: buy, coupon, partner code, close & resume, refund.
