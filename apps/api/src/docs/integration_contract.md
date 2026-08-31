# Charis Control Center - External Integration API Contract

To connect a product (like Bill Easy, Charis Civil) to the Charis Control Center, the product MUST expose the following REST endpoints.

## Authentication
All requests from the Control Center to the product will include an `x-api-key` header.
The product must validate this key before returning data.

**Header Format:**
`x-api-key: <product-specific-api-key>`

## Required Endpoints

### 1. Get Subscriptions
`GET <product_api_base_url>/api/admin/subscriptions`

**Response Format (200 OK):**
```json
[
  {
    "id": "sub_123",
    "customerId": "cust_abc",
    "customerName": "Acme Corp",
    "customerEmail": "admin@acme.com",
    "planId": "plan_pro",
    "planName": "PRO",
    "price": 999,
    "billingCycle": "MONTHLY", // or "YEARLY"
    "status": "ACTIVE", // "TRIAL", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"
    "startDate": "2023-01-01T12:00:00Z",
    "nextRenewalDate": "2023-02-01T12:00:00Z",
    "paymentStatus": "PAID"
  }
]
```

### 2. Get Plans
`GET <product_api_base_url>/api/admin/plans`

**Response Format (200 OK):**
```json
[
  {
    "id": "plan_pro",
    "name": "PRO",
    "description": "Advanced Operations",
    "monthlyPrice": 999,
    "yearlyPrice": 9990,
    "features": ["Unlimited Projects", "API Access"],
    "maxUsers": 10,
    "maxStorageGb": 100,
    "isActive": true
  }
]
```

### 3. Get Dashboard Stats
`GET <product_api_base_url>/api/admin/stats`

**Response Format (200 OK):**
```json
{
  "totalCustomers": 1500,
  "activeSubscriptions": 1200,
  "trialSubscriptions": 100,
  "cancelledSubscriptions": 200,
  "mrr": 45000,
  "arr": 540000
}
```
