# Charis API App Package

This is the **integration layer** that each subscriber app (Bill Easy, Charis Civil, etc.) deploys alongside their application. It connects to **the app's own PostgreSQL database** and communicates with the Control Centre.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Control Centre    │────▶│    API App          │────▶│   App Database      │
│   (Management)      │     │    (This Package)   │     │   (PostgreSQL)      │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        │                           │                           │
        │  Webhooks (outbox)        │  Local CRUD               │
        │  REST API calls           │  Entitlement signing      │
        ▼                           ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Control Centre DB  │     │  Redis (BullMQ)     │     │  App Tables         │
│  (Plans, Coupons,   │     │  Webhook queue      │     │  (Subscribers,      │
│   Affiliates, etc.) │     │  Entitlement cache  │     │   Subscriptions,    │
└─────────────────────┘     └─────────────────────┘     │   Usage, Coupons,   │
                                                        │   Affiliates, etc.) │
                                                        └─────────────────────┘
```

## Features

- **Entitlement Verification** - `GET /api/entitlements/:tenantId` returns signed JWT for SDK
- **Control Centre Sync** - Receives webhook events from Control Centre via outbox pattern
- **Webhook Delivery** - Delivers webhooks to app's configured endpoints with retry/backoff
- **Subscription Management** - Local CRUD for subscribers, subscriptions, usage
- **Coupon Redemption** - Validates and applies coupons (promo + affiliate)
- **Usage Tracking** - Idempotent usage consumption with limit enforcement
- **Health Reporting** - Reports health status to Control Centre

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Keys (RS256 for entitlement signing)
```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Setup Database
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Run Development Server
```bash
npm run dev
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | App's PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis for BullMQ + caching | Yes |
| `CONTROL_CENTRE_URL` | Control Centre base URL | Yes |
| `CONTROL_CENTRE_API_KEY` | API key for Control Centre calls | Yes |
| `CONTROL_CENTRE_WEBHOOK_SECRET` | Secret for verifying Control Centre webhooks | Yes |
| `ENTITLEMENT_PRIVATE_KEY_PATH` | Path to RS256 private key | Yes |
| `ENTITLEMENT_PUBLIC_KEY_PATH` | Path to RS256 public key | Yes |
| `APP_ID` | Unique app identifier (e.g., `bill-easy`) | Yes |
| `CONTROL_API_SECRET` | Shared secret for Control Centre → App calls | Yes |
| `PORT` | Server port (default: 4000) | No |

## API Endpoints

### SDK Entitlement Verification
```
GET  /api/entitlements/:tenantId     # Get signed entitlement token
POST /api/entitlements/verify        # Verify token (debug)
```

### Control Centre → App (requires `X-Control-Secret` header)
```
POST   /api/v1/control/subscriptions           # Create subscription
PATCH  /api/v1/control/subscriptions/:id/activate
PATCH  /api/v1/control/subscriptions/:id/cancel
POST   /api/v1/control/coupons/redeem          # Redeem coupon
POST   /api/v1/control/usage                   # Report usage
POST   /api/v1/control/webhook-events          # Receive webhook events
GET    /api/v1/control/health                  # Health check
```

### App's Own Webhooks (for external integrations)
```
POST   /api/v1/webhooks/endpoints              # Register webhook endpoint
GET    /api/v1/webhooks/endpoints
GET    /api/v1/webhooks/endpoints/:id
DELETE /api/v1/webhooks/endpoints/:id
GET    /api/v1/webhooks/deliveries             # View delivery status
```

## Webhook Events (from Control Centre)

The Control Centre sends these events via the outbox pattern:

| Event Type | Aggregate | Description |
|------------|-----------|-------------|
| `plan.created` | plan | New plan created |
| `plan.updated` | plan | Plan modified |
| `plan.archived` | plan | Plan archived |
| `coupon.created` | coupon | New coupon |
| `coupon.updated` | coupon | Coupon modified |
| `coupon.expired` | coupon | Coupon expired |
| `subscription.created` | subscription | Subscription created in CC |
| `subscription.updated` | subscription | Subscription modified |
| `affiliate.created` | affiliate | New affiliate |
| `notification.created` | notification | Notification to deliver |

## Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY prisma ./prisma/
RUN npx prisma generate
COPY dist ./dist
COPY keys ./keys
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Build
```bash
npm run build
docker build -t charis-api-app .
```

## Database Schema

See `prisma/schema.prisma` for complete schema. Key models:

- **Subscriber** - Tenant/customer identity
- **SubscriptionPlan** - Pricing plans with entitlements
- **Feature** - Feature catalog (synced from Control Centre)
- **PlanEntitlement** - Plan ↔ Feature limits
- **Subscription** - Active subscriptions
- **UsageCounter/UsageEvent** - Usage tracking
- **Coupon/CouponRedemption** - Promotions & affiliate coupons
- **Affiliate/AffiliateCommission** - Affiliate program
- **Notification/NotificationDelivery** - In-app notifications
- **WebhookEndpoint/WebhookEvent/WebhookDelivery** - Outbound webhooks
- **ControlCentreEvent** - Inbound events from Control Centre

## Development

```bash
# Watch mode
npm run dev

# Database studio
npm run prisma:studio

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT