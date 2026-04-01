-- Migration: Optional subscription start date on payment_transactions
-- Date: 2026-04-01
-- Description: Stores client-chosen subscription/billing start from checkout; webhook uses
--              this when creating subscriptions (falls back to transaction time if null).

ALTER TABLE public.payment_transactions
  ADD COLUMN subscription_start_date timestamptz NULL;

COMMENT ON COLUMN public.payment_transactions.subscription_start_date IS
  'Optional start of the subscription period set at checkout (ISO instant). Webhook uses this for subscriptions.start_date when present; otherwise starts at payment completion time.';
