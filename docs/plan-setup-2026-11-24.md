# Control Centre plan setup: Buildtrack Civil and Bill Easy (24 Nov 2026)

This sheet says what to enter in Control Centre → Applications → (app) → Plans. Every price, limit and line of card text on the apps' plan pages comes from these entries. Nothing here needs a code change.

## Rules for every plan (both apps)

- **Compare-at price:** leave it empty. The apps no longer draw crossed-out list prices. A price that was never charged can count as misleading pricing.
- **Badge:** use it on one plan only, the one you want most people to pick. Use "Most popular".
- **Tagline:** one plain line saying who the plan is for. Don't use jokes or internal notes such as "for our beloved friends", "test1" or "Most Exited".
- **Highlights:** 3 or 4 short lines, each one a real limit or feature. Write "up to", never "upto".
- **Limits:** set each limit once. If a limit is in the list below, switch the old duplicate off.
- **GST:** say it in the description, for example "Price includes 18% GST" or "+ 18% GST", whichever is true.

---

## Buildtrack Civil

These are your final decisions of 19 Nov 2026 (implementation.md): no Free plan, a 14-day trial, then paid yearly plans. Charges are per company, never per user.

Switch these **off on every plan:**
- `storage_bytes`, the old photo-only storage limit. `storage_gb` replaces it.
- `photos_per_project` and `photo_uploads`. Storage is the only limit on photos.

| Field | Trial | Starter | Business | Pro |
|---|---|---|---|---|
| Plan code | `trial` | `starter` | `business` (renamed from "Enterprises") | `pro` |
| Price | ₹0 | ₹3,999 / year | ₹6,999 / year | ₹14,999 / year |
| Duration | 14 days, once per customer | 1 year | 1 year | 1 year |
| Badge | none | none | **Most popular** | none |
| Tagline | Try everything for 14 days | For a small contractor with 1–2 sites | For firms running several sites | For large firms with many sites |
| `open_sites` | 2 (my suggestion) | 2 | 10 | Unlimited |
| `users_total` | 10 | 10 | 100 | 100 |
| `storage_gb` | 2 (my suggestion) | 5 | 10 | 25 |
| Projects, daily reports, site photos, attendance, labour, clients, documents, invoices/expenses (`projects`, `daily_operations`, `site_photos`, `attendance`, `labour`, `clients`, `documents`, `financials`) | ✓ | ✓ | ✓ | ✓ |
| `staff` (roles, payroll), `procurement`, `boq`, `estimates`, `reports`, `tenders` | ✓ | — | ✓ | ✓ |
| **`client_portal`** (new) | ✓ | — | ✓ | ✓ |

- **Role seat lines** (`users_site_engineer` and the others): leave them off. Show only the total, so the card never adds up to more people than "Users".
- **Government site passes:** these stay hidden from the plan page and are bought from each site.

| Field | Roads & drains | Buildings & other works |
|---|---|---|
| Plan code | `govt_site_roads_drains` | `govt_site_building_other` |
| Price | ₹500 per site | ₹2,500 per site |
| Duration | 3 months | 3 months |
| `client_portal` | off | off |

Still to decide later: the 2- and 3-year plans (partner commissions ₹200 / ₹500 / ₹1,000), and a monthly price if you want one alongside yearly.

---

## Bill Easy

Keep your current tiers and limits (Free after the 14-day trial, Pro, Enterprises). Fix only the text and settings below, which QA round 2 flagged.

| Field | Free | Pro | Enterprises |
|---|---|---|---|
| Compare-at price | empty (remove ₹499) | empty (remove ₹999) | empty |
| Tagline | For new businesses | For growing shops | For businesses with staff and godowns |
| Badge | none | **Most popular** | none. Remove "Business Master" |
| Description | "Start billing free." | Say whether GST is included | Say whether GST is included |
| Unlimited limits | — | Set them as Unlimited, not empty | Purchase bills, invoices and items set to **Unlimited** |
| `staff_attendance_payroll` | off | off | **on** (also on the trial) |

- **On the Pro card:** add 2–3 lines saying what is Enterprises-only (e-way bills, staff & payroll), so buyers aren't surprised after paying.
- **Not changed in code:** plan names, taglines and badges. They come from these entries, so edit them here.

---

## Before real customers pay (both apps)

1. Switch Razorpay to the live keys on the Control Centre Railway backend: `RAZORPAY_MODE=live`, the live key ID and secret, and the live webhook secret.
2. Set both application records back to **Production**: Control Centre → app → Settings → Environment.
3. Make one small real payment yourself and check that it activates the plan, then refund it.
