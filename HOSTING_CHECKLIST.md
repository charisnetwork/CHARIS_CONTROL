# Hosting checklist — Charis OS, Civil, Bill Easy (2026-10-20)

Deploy in this order: **OS → Civil → Bill Easy**. Each step is safe to stop after.
Never put keys in `VITE_*` variables or in git.

## 1. Charis OS backend (Railway, repo `CHARIS_CONTROL`)

Variables:

```env
ENVIRONMENT=production
DATABASE_URL=<Railway PostgreSQL for OS only>
JWT_SIGNING_SECRET=<random, 32+ bytes>
CORS_ALLOWED_ORIGINS=https://<OS web origin>
TRUSTED_HOSTS=<OS API host>
RAZORPAY_ENABLED=true
RAZORPAY_MODE=test                     # live only after step 5
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=<random, 16+ chars, different from the key secret>
```

After deploy:

- Confirm migrations reached **`20261020_0004`** (Railway shell: `python -m alembic current`).
  If not, run `python -m alembic upgrade head` once. Migrations 0002–0004 only add tables/columns
  and widen one check; no data is rewritten.
- First deploy only: `python -m app.cli create-owner --email <you> --display-name "<name>"`.
- Add two Railway cron jobs on the same image:
  - every 5 min: `python -m app.cli process-notifications`
  - daily: `python -m app.cli expire-checkouts` (releases coupons held by unpaid orders > 24 h)
- Razorpay dashboard → Webhooks → `https://<OS API>/api/v1/payments/razorpay/webhook`,
  events `payment.captured` and `refund.processed`, the same webhook secret, automatic capture on.
  All apps share this one Razorpay account; OS separates every payment by app.

## 2. Charis OS web (Cloudflare Pages)

`VITE_CONTROL_API_URL=https://<OS API origin>` (no `/api/v1`). Build: `npm run build` in `apps/web`.

## 3. Charis Civil (Railway + web)

Railway runs `prisma migrate deploy` before start (adds `User.lastLoginAt/lastActiveAt`).

```env
CHARIS_SUBSCRIPTION_MODE=enforce
CHARIS_OS_URL=https://<OS API origin>
CHARIS_OS_APP_ID=<Civil app ID in OS>
CHARIS_OS_APP_KEY=<Civil app key from OS>
CHARIS_OS_SUMMARY_TOKEN=<optional, random 32+ chars; enables OS → Civil summary API>
```

In OS (Civil app): features, plans (a ₹0 plan if Civil should be freemium), storefront,
coupons/partners.

## 4. Bill Easy (existing hosting)

1. Deploy the code with `CHARIS_SUBSCRIPTION_MODE` **unset**. Nothing changes for customers.
2. In OS: register Bill Easy, create the features from `bill easy/CHARIS_OS_INTEGRATION.md`,
   the plans (including a ₹0 Free plan), publish them on the storefront, add coupons/partners.
3. Set `CHARIS_SUBSCRIPTION_MODE=enforce`, `CHARIS_OS_URL`, `CHARIS_OS_APP_ID`, `CHARIS_OS_APP_KEY`.
4. In `backend/`: `npm run charis-os:sync` (dry run), then `npm run charis-os:sync -- --apply`.
   Assign the listed `ASSIGN_PAID_PLAN_IN_OS` customers their plan in OS (reason: "migrated").
   Until step 3, Bill Easy's old `/api/subscription/upgrade` still activates plans without
   verifying payment — keep the gap between steps 1 and 3 short.

## 5. Before taking real money

Per app, in Razorpay **test** mode: buy a plan, use a coupon and a partner code, close the popup
and resume, refund fully in Razorpay and confirm the plan is cancelled and the commission
reversed. Then switch OS to `RAZORPAY_MODE=live` with live keys and a live webhook.

## Known limits (not blockers)

- Apps see OS changes within 60 s (or immediately after purchase / "sync").
- No GST tax invoices, proration, add-ons or automatic renewal yet.
- OS Dashboard/Customers pages do not yet read the Civil summary API.
