# MMG Checkout Integration Guide

## Overview

This guide explains how to use the MMG payment checkout endpoints to process subscription payments for drivers and riders in the application.

## Architecture

The MMG payment flow consists of three main endpoints:

1. **Checkout Endpoint** (`POST /api/mmg/checkout`) - Initiates payment session
2. **Webhook Endpoint** (`GET /api/mmg/webhook`) - Handles payment completion/failure (redirect from MMG)
3. **Confirm Payment Endpoint** (`POST /api/mmg/confirm-payment`) - Client-initiated confirmation by MMG transaction ID (see [mmg-confirm-payment.md](mmg-confirm-payment.md))

## Checkout Endpoint

### Purpose
Creates a payment transaction record and generates an MMG checkout URL for users to complete payment.

### Request

**URL:** `POST /api/mmg/checkout`

**Headers:**
```
Authorization: Bearer <supabase_auth_token>
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 5000,
  "currency": "GYD",
  "description": "Monthly Subscription"
}
```

**Parameters:**
- `amount` (required, number): Payment amount in smallest currency unit (e.g., cents)
- `currency` (optional, string): Currency code. Defaults to `"GYD"`
- `description` (optional, string): Payment description. Defaults to `"Subscription Payment"`

### Response

**Success (200):**
```json
{
  "success": true,
  "paymentTransactionId": "550e8400-e29b-41d4-a716-446655440000",
  "redirectUrl": "https://mmgpg.mmgtest.net/mmg-pg/web/payments?token=...",
  "amount": 5000,
  "currency": "GYD",
  "status": "PENDING"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid amount or user profile incomplete
- `401 Unauthorized`: User not authenticated
- `404 Not Found`: User profile not found
- `500 Internal Server Error`: Server-side error

### Flow

1. User is authenticated via Supabase Auth
2. User profile is fetched from `users` table
3. User role is validated (must be `driver` or `rider`)
4. New `payment_transactions` record is created with:
   - `user_id`: User's ID from users table
   - `amount`: Requested amount
   - `currency`: Currency code
   - `payment_method`: `'mmg'`
   - `status`: `'pending'`
   - `initiated_at`: Current timestamp
5. MMG checkout session is created using `payment_transactions.id` as the merchant transaction ID
6. Checkout URL is returned to client

### Example Usage (Frontend)

```typescript
// React/Next.js example
const handleCheckout = async (amount: number, token: string) => {
  try {
    const response = await fetch('/api/mmg/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Pass Supabase auth token
      },
      body: JSON.stringify({
        amount,
        currency: 'GYD',
        description: 'Monthly Subscription',
      }),
    });

    const data = await response.json();

    if (data.success) {
      // Store payment transaction ID for reference
      sessionStorage.setItem('paymentTransactionId', data.paymentTransactionId);
      
      // Redirect to MMG checkout
      window.location.href = data.redirectUrl;
    } else {
      console.error('Checkout failed:', data.error);
    }
  } catch (error) {
    console.error('Error initiating checkout:', error);
  }
};
```

**Getting the Supabase Auth Token:**

```typescript
// Get token from Supabase client
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Then pass to checkout function
handleCheckout(5000, token);
```

## Webhook Endpoint

### Purpose
Receives payment completion/failure notifications from MMG and updates payment records, creates subscriptions, and updates user profiles accordingly.

### Request

**URL:** `POST /api/mmg/webhook`

**Headers:**
```
Content-Type: application/json
```

**Body (from MMG):**
```json
{
  "merchantTransactionId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionId": "MMG-12345-67890",
  "resultCode": 0,
  "resultMessage": null,
  "htmlResponse": "...",
  "sourceOfFundsList": null
}
```

**Parameters:**
- `merchantTransactionId` (required): The payment_transactions.id from checkout
- `transactionId`: MMG's unique transaction identifier
- `resultCode`: `0` = success, non-zero = failure
- `resultMessage`: Error message if payment failed
- `htmlResponse`: MMG response HTML
- `sourceOfFundsList`: Additional payment details from MMG

### Response

**Success Payment (200):**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "merchantTransactionId": "550e8400-e29b-41d4-a716-446655440000",
    "transactionId": "MMG-12345-67890",
    "status": "completed",
    "subscriptionId": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

**Failed Payment (200):**
```json
{
  "success": true,
  "message": "Payment failed - user can retry",
  "data": {
    "merchantTransactionId": "550e8400-e29b-41d4-a716-446655440000",
    "transactionId": "MMG-12345-67890",
    "status": "failed",
    "resultCode": 1,
    "resultMessage": "Insufficient funds"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing merchantTransactionId
- `404 Not Found`: Payment transaction not found
- `500 Internal Server Error`: Database or processing error

### Payment Success Flow (resultCode === 0)

1. **Calculate subscription dates:**
   - `start_date`: Current date
   - `end_date`: Current date + 30 days

2. **Fetch user profile** to determine role (driver or rider)

3. **Create subscription record** in `subscriptions` table with:
   - `user_id`: From payment transaction
   - `user_role`: User's role (driver or rider)
   - `plan_type`: `'monthly'`
   - `amount`: From payment transaction
   - `currency`: From payment transaction
   - `start_date`: Today's date
   - `end_date`: 30 days from today
   - `status`: `'active'`
   - `payment_method`: `'mmg'`
   - `payment_reference`: MMG transaction ID
   - `payment_date`: Current timestamp

4. **Update payment_transactions record** with:
   - `status`: `'completed'`
   - `subscription_id`: ID of newly created subscription
   - `mmg_transaction_id`: MMG's transaction ID
   - `mmg_reference`: MMG's transaction ID
   - `completed_at`: Current timestamp
   - `gateway_response`: Full MMG webhook payload (for debugging)

5. **Update user profile** based on role:
   - **Driver**: Update `driver_profiles` table:
     - `subscription_status`: `'active'`
     - `subscription_start_date`: Start date
     - `subscription_end_date`: End date
   - **Rider**: Update `rider_profiles` table:
     - `subscription_status`: `'active'`
     - `subscription_start_date`: Start date
     - `subscription_end_date`: End date

6. **Log webhook** to `mmg_webhook_logs` table for audit trail

### Payment Failure Flow (resultCode !== 0)

1. **Update payment_transactions record** with:
   - `status`: `'failed'`
   - `mmg_transaction_id`: MMG's transaction ID
   - `gateway_response`: Full MMG webhook payload
   - `error_message`: Failure reason from MMG

2. **Log webhook** to `mmg_webhook_logs` table for audit trail

3. User can retry payment by calling checkout endpoint again (creates new payment_transactions record)

## Database Tables

### payment_transactions
Tracks all payment attempts for subscriptions.

**Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): User making the payment
- `subscription_id` (UUID): Link to created subscription (populated on success)
- `amount` (NUMERIC): Payment amount
- `currency` (VARCHAR): Currency code (default: 'GYD')
- `payment_method` (VARCHAR): 'mmg'
- `mmg_transaction_id` (VARCHAR): MMG's transaction ID
- `mmg_reference` (VARCHAR): MMG's transaction reference
- `status` (VARCHAR): 'pending', 'completed', or 'failed'
- `gateway_response` (JSONB): Full MMG API response
- `error_message` (TEXT): Failure reason if applicable
- `initiated_at` (TIMESTAMP): When payment was initiated
- `completed_at` (TIMESTAMP): When payment completed/failed
- `created_at` (TIMESTAMP): Record creation time

### subscriptions
Represents active subscriptions purchased by users.

**Fields:**
- `id` (UUID): Primary key
- `user_id` (UUID): Subscriber
- `user_role` (VARCHAR): 'driver' or 'rider'
- `plan_type` (VARCHAR): 'monthly'
- `amount` (NUMERIC): Subscription price
- `currency` (VARCHAR): 'GYD'
- `start_date` (TIMESTAMP): When subscription becomes active
- `end_date` (TIMESTAMP): When subscription expires (30 days from start)
- `status` (VARCHAR): 'active', 'expired', or 'cancelled'
- `payment_method` (VARCHAR): 'mmg'
- `payment_reference` (VARCHAR): MMG transaction ID
- `payment_date` (TIMESTAMP): When payment was completed
- `created_at` (TIMESTAMP): Record creation time
- `updated_at` (TIMESTAMP): Last update time

### driver_profiles / rider_profiles
Updated with subscription information after successful payment.

**Fields Updated:**
- `subscription_status`: 'active' (set after successful payment)
- `subscription_start_date`: When subscription begins
- `subscription_end_date`: When subscription expires
- `updated_at`: Record modification time

### mmg_webhook_logs
Audit trail of all incoming webhooks from MMG.

**Fields:**
- `id` (UUID): Primary key
- `merchant_transaction_id` (VARCHAR): Our payment_transactions.id
- `transaction_id` (VARCHAR): MMG's transaction ID
- `result_code` (INTEGER): 0 for success, non-zero for failure
- `result_message` (TEXT): Reason if failed
- `html_response` (TEXT): Full HTML response from MMG
- `raw_body` (JSONB): Full webhook payload

## Retry Mechanism

When a payment fails:

1. `payment_transactions` record is marked with status `'failed'`
2. User is notified of the failure
3. User can retry by initiating checkout again
4. A **new** `payment_transactions` record is created (not reused)
5. User receives a new MMG checkout URL and tries again

**Example Flow:**
```
Attempt 1: Checkout → paymentTransactionId: "uuid-1" → Payment fails
Attempt 2: Checkout → paymentTransactionId: "uuid-2" → Payment succeeds
         → Webhook creates subscription linked to "uuid-2"
         → User now has active subscription
```

## Environment Variables

Required MMG configuration in `.env.local`:

```
MMG_MERCHANT_MID=your_merchant_id
MMG_SECRET_KEY=your_secret_key
MMG_CLIENT_ID=your_client_id
MMG_CHECKOUT_URL=https://mmgpg.mmgtest.net/mmg-pg/web/payments
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | User not authenticated | User must log in first |
| 404 User profile not found | User record doesn't exist | Create user profile first |
| 400 User role not set | User profile incomplete | Set user role (driver/rider) |
| 400 Invalid amount | Amount <= 0 or missing | Provide valid positive amount |
| 404 Payment transaction not found | merchantTransactionId invalid | Verify transaction ID |

### Logging

All major operations are logged with console.log for debugging:
- Checkout: Amount, user, created transaction
- Webhook: Received body, payment transaction, subscription creation
- Errors: Detailed error messages with context

Check browser console or server logs for `🚀` markers indicating logged events.

## Testing

### Test Checkout Flow

```bash
curl -X POST http://localhost:3000/api/mmg/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_supabase_token>" \
  -d '{
    "amount": 5000,
    "currency": "GYD",
    "description": "Test Payment"
  }'
```

### Test Webhook (Simulated Success)

```bash
curl -X POST http://localhost:3000/api/mmg/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "merchantTransactionId": "550e8400-e29b-41d4-a716-446655440000",
    "transactionId": "MMG-12345-67890",
    "resultCode": 0,
    "resultMessage": null,
    "htmlResponse": "...",
    "sourceOfFundsList": null
  }'
```

### Test Webhook (Simulated Failure)

```bash
curl -X POST http://localhost:3000/api/mmg/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "merchantTransactionId": "550e8400-e29b-41d4-a716-446655440000",
    "transactionId": "MMG-12345-67890",
    "resultCode": 1,
    "resultMessage": "Insufficient funds",
    "htmlResponse": "...",
    "sourceOfFundsList": null
  }'
```

## Security Considerations

1. **Authentication**: Checkout endpoint requires Supabase Bearer token in Authorization header
2. **Token Verification**: Bearer token is verified against Supabase Auth before processing
3. **Role-based**: Updates user profiles only for authenticated users with valid roles
4. **Audit Trail**: All webhooks logged to `mmg_webhook_logs` for compliance
5. **Gateway Response**: Full MMG responses stored for debugging and dispute resolution
6. **Immutable Records**: Payment transactions are never deleted, only marked as failed
7. **User Isolation**: Users can only create payments for their own account (authenticated via token)

## Integration Checklist

- [ ] Users can authenticate via login
- [ ] User profiles have `role` field set (driver or rider)
- [ ] Driver/rider profiles exist in database
- [ ] MMG environment variables configured
- [ ] Checkout endpoint returns valid redirectUrl
- [ ] MMG webhook is configured to POST to `/api/mmg/webhook`
- [ ] Payment success creates subscription
- [ ] Payment success updates user profile with subscription dates
- [ ] Payment failure allows retry
- [ ] Webhook logs are recorded for audit trail
