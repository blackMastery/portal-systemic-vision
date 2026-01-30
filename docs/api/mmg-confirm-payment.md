# MMG Confirm Payment Endpoint

## Overview

The confirm-payment endpoint lets the client confirm a completed MMG payment by supplying the MMG transaction ID and subscription type. The server loads the expected subscription price from `system_config` (key `subscription_prices`), looks up the transaction via the MMG e-commerce API, and validates that the transaction amount matches the configured price. If it matches, the server creates a payment record, a subscription record, and updates the user profile. If the amount does not match, the API returns 422 with JSON only (no redirect).

## Endpoint

**URL:** `POST /api/mmg/confirm-payment`

**Headers:**
```
Authorization: Bearer <supabase_auth_token>
Content-Type: application/json
```

**Body:**
```json
{
  "transactionId": "20373204135924",
  "subscriptionType": "rider_monthly"
}
```

**Parameters:**
- `transactionId` (required, string): The MMG transaction ID returned after payment (e.g. from redirect or MMG SDK).
- `subscriptionType` (required, string): One of `"rider_monthly"` or `"driver_monthly"`. Must match the authenticated user's role (rider → `rider_monthly`, driver → `driver_monthly`). The server uses this to look up the expected price from `system_config.subscription_prices` and validate the MMG transaction amount.

## Response

**Success – new processing (200):**
```json
{
  "success": true,
  "paymentTransactionId": "550e8400-e29b-41d4-a716-446655440000",
  "subscriptionId": "660e8400-e29b-41d4-a716-446655440001",
  "amount": 5000,
  "currency": "GYD",
  "status": "completed"
}
```

**Success – already processed / idempotent (200):**
```json
{
  "success": true,
  "alreadyProcessed": true,
  "paymentTransactionId": "550e8400-e29b-41d4-a716-446655440000",
  "subscriptionId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "completed"
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid `transactionId`, missing or invalid `subscriptionType` (must be `rider_monthly` or `driver_monthly`), subscriptionType does not match user role, or MMG lookup failed / transaction not successful
- `401 Unauthorized`: Missing or invalid authorization token
- `404 Not Found`: User profile not found
- `409 Conflict`: Transaction already linked to another account
- `422 Unprocessable Entity`: Payment amount does not match the configured subscription price. Response body is JSON only:

  Example 422 body:
  ```json
  {
    "error": "Payment amount does not match subscription price",
    "code": "AMOUNT_MISMATCH"
  }
  ```
- `500 Internal Server Error`: Server-side error, or subscription pricing not configured in `system_config` (key `subscription_prices`)

## Flow

1. User is authenticated via Supabase Auth (same as checkout).
2. User profile is fetched; role must be `driver` or `rider`.
3. `subscriptionType` must match the user's role (rider → `rider_monthly`, driver → `driver_monthly`); otherwise 400.
4. If another user already has this `mmg_transaction_id`, the API returns 409.
5. If the current user already has a completed payment for this `transactionId`, the API returns 200 with `alreadyProcessed: true` (idempotency).
6. Server loads expected subscription price from `system_config` where `key = 'subscription_prices'` and reads the value for the given `subscriptionType` (e.g. `rider_monthly` or `driver_monthly`, in GYD). If missing or invalid, returns 500.
7. Server calls MMG e-commerce login to obtain an access token (cached until expiry).
8. Server calls MMG e-merchant-initiated-transactions lookup with the given `transactionId`.
9. If lookup fails or `transactionStatus` is not `successful`, the API returns 400.
10. Server compares the MMG transaction amount to the expected price. If they do not match, returns 422 with `code: "AMOUNT_MISMATCH"` (JSON only).
11. Server creates a `payment_transactions` record (status `completed`), then a `subscriptions` record (30-day window, `plan_type: 'monthly'`), links the payment to the subscription, and updates `driver_profiles` or `rider_profiles` with subscription dates and `subscription_status: 'active'`.

This is the same business logic as the webhook success path; see [mmg-checkout.md](mmg-checkout.md) for database tables and subscription/profile update details.

## Environment Variables

Required for confirm-payment (MMG e-commerce API):

| Variable | Description |
|----------|-------------|
| `MMG_ECOMMERCE_URL` | (Optional) Base URL for e-commerce API. Default: `https://mwallet.mmgtest.net` |
| `MMG_ECOMMERCE_API_KEY` | API key for e-commerce login and lookup |
| `MMG_ECOMMERCE_USERNAME` | E-commerce login username |
| `MMG_ECOMMERCE_PASSWORD` | E-commerce login password |
| `MMG_WSS_MID` | WSS merchant ID (x-wss-mid header) |
| `MMG_WSS_MKEY` | WSS key (x-wss-mkey header) |
| `MMG_WSS_MSECRET` | WSS secret (x-wss-msecret header) |

Checkout flow uses separate variables: `MMG_MERCHANT_MID`, `MMG_SECRET_KEY`, `MMG_CLIENT_ID`, `MMG_CHECKOUT_URL`. See [mmg-checkout.md](mmg-checkout.md).

## Example Usage

```bash
curl -X POST http://localhost:3000/api/mmg/confirm-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_supabase_token>" \
  -d '{"transactionId": "20373204135924", "subscriptionType": "rider_monthly"}'
```

## Security and Idempotency

- Only the authenticated user is associated with the payment and subscription; the MMG transaction is linked to that user.
- If the same MMG transaction ID is submitted again by the same user, the endpoint returns success with existing IDs and `alreadyProcessed: true` without creating duplicate records.
- If the same MMG transaction ID was already used by a different user, the API returns 409 Conflict.
