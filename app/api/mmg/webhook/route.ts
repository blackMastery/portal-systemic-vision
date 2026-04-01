import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/encryption';

interface DecryptedPaymentResponse {
  merchantTransactionId: string;
  transactionId: string;
  ResultCode: string;
  ResultMessage: string;
  htmlResponse: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isDecryptedPaymentResponse(value: unknown): value is DecryptedPaymentResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.merchantTransactionId === 'string' &&
    typeof v.transactionId === 'string' &&
    typeof v.ResultCode === 'string'
  );
}

export async function GET(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { searchParams } = new URL(req.url);
    const encryptedToken = searchParams.get('token');

    if (!encryptedToken) {
      return NextResponse.json({ error: 'Missing encrypted TOKEN' }, { status: 400 });
    }

    // Decrypt and validate the token
    let decryptedData: DecryptedPaymentResponse;
    try {
      const raw = decrypt(encryptedToken);
      if (!isDecryptedPaymentResponse(raw)) {
        return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
      }
      decryptedData = raw;
    } catch (decryptError) {
      console.error("[MMG webhook] decrypt failed:", decryptError);
      return NextResponse.json({ error: 'Failed to decrypt token' }, { status: 400 });
    }

    if (!decryptedData.merchantTransactionId) {
      return NextResponse.json({ error: 'Missing merchantTransactionId' }, { status: 400 });
    }

    if (!isValidUUID(decryptedData.merchantTransactionId)) {
      return NextResponse.json({ error: 'Invalid merchantTransactionId format' }, { status: 400 });
    }

    const resultCode = decryptedData.ResultCode === '0' ? 0 : parseInt(decryptedData.ResultCode, 10);

    // Log the webhook data for audit trail (non-blocking)
    supabase
      .from('mmg_webhook_logs')
      .insert({
        merchant_transaction_id: decryptedData.merchantTransactionId,
        transaction_id: decryptedData.transactionId,
        result_code: resultCode,
        result_message: decryptedData.ResultMessage,
        html_response: decryptedData.htmlResponse,
        raw_body: decryptedData,
      })
      .then(({ error }) => {
        if (error) console.error("[MMG webhook] error logging to mmg_webhook_logs:", error);
      });

    if (resultCode === 0) {
      // Optimistic lock: atomically claim the transaction by moving it from
      // 'pending' → 'processing'. Only one concurrent request will succeed.
      const { data: claimed, error: claimError } = await supabase
        .from('payment_transactions')
        .update({ status: 'processing' })
        .eq('id', decryptedData.merchantTransactionId)
        .eq('status', 'pending')
        .select('id, user_id, amount, currency, status, subscription_start_date')
        .single();

      if (claimError || !claimed) {
        // Either already processing/completed by another request, or not found.
        // Check current state to return the right response.
        const { data: existing } = await supabase
          .from('payment_transactions')
          .select('id, status')
          .eq('id', decryptedData.merchantTransactionId)
          .single();

        if (existing?.status === 'completed' || existing?.status === 'processing') {
          return NextResponse.redirect(
            new URL(`/payment-success?transactionId=${decryptedData.transactionId}&paymentId=${existing.id}`, req.url),
            { status: 303 }
          );
        }

        console.error("[MMG webhook] payment transaction not found or claim failed:", claimError);
        return NextResponse.json({ error: 'Payment transaction not found' }, { status: 404 });
      }

      // Subscription window: start from checkout (if set) or payment completion time; 30-day term
      const startDate = claimed.subscription_start_date
        ? new Date(claimed.subscription_start_date)
        : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', claimed.user_id)
        .single();

      if (userError || !user) {
        console.error("[MMG webhook] user not found:", userError);
        // Revert the claim so the webhook can be retried
        await supabase
          .from('payment_transactions')
          .update({ status: 'pending' })
          .eq('id', claimed.id);
        throw new Error('User not found');
      }

      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: claimed.user_id,
          user_role: user.role,
          plan_type: 'monthly',
          amount: claimed.amount,
          currency: claimed.currency,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'active',
          payment_method: 'mmg',
          payment_reference: decryptedData.transactionId,
          payment_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (subscriptionError || !subscription) {
        console.error("[MMG webhook] error creating subscription:", subscriptionError);
        // Revert the claim so the webhook can be retried
        await supabase
          .from('payment_transactions')
          .update({ status: 'pending' })
          .eq('id', claimed.id);
        throw subscriptionError;
      }

      const { error: updatePaymentError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          subscription_id: subscription.id,
          mmg_transaction_id: decryptedData.transactionId,
          mmg_reference: decryptedData.transactionId,
          completed_at: new Date().toISOString(),
          gateway_response: decryptedData,
        })
        .eq('id', claimed.id);

      if (updatePaymentError) {
        console.error("[MMG webhook] error updating payment transaction:", updatePaymentError);
        throw updatePaymentError;
      }

      if (user.role === 'driver') {
        const { error: driverUpdateError } = await supabase
          .from('driver_profiles')
          .update({
            subscription_status: 'active',
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', claimed.user_id);

        if (driverUpdateError) {
          console.error("[MMG webhook] error updating driver profile:", driverUpdateError);
          throw driverUpdateError;
        }
      } else if (user.role === 'rider') {
        const { error: riderUpdateError } = await supabase
          .from('rider_profiles')
          .update({
            subscription_status: 'active',
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', claimed.user_id);

        if (riderUpdateError) {
          console.error("[MMG webhook] error updating rider profile:", riderUpdateError);
          throw riderUpdateError;
        }
      }

      return NextResponse.redirect(
        new URL(`/payment-success?transactionId=${decryptedData.transactionId}&paymentId=${claimed.id}`, req.url),
        { status: 303 }
      );
    } else {
      // Payment failure — mark as failed if still pending
      const { error: updatePaymentError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'failed',
          mmg_transaction_id: decryptedData.transactionId,
          gateway_response: decryptedData,
          error_message: decryptedData.ResultMessage || 'Payment failed',
        })
        .eq('id', decryptedData.merchantTransactionId)
        .in('status', ['pending', 'processing']);

      if (updatePaymentError) {
        console.error("[MMG webhook] error updating payment transaction (failed):", updatePaymentError);
        throw updatePaymentError;
      }

      return NextResponse.redirect(
        new URL(
          `/payment-failed?transactionId=${decryptedData.transactionId}&paymentId=${decryptedData.merchantTransactionId}&reason=${encodeURIComponent(decryptedData.ResultMessage)}`,
          req.url
        ),
        { status: 303 }
      );
    }
  } catch (error) {
    console.error("[MMG webhook] error:", error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
