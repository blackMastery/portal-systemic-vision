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

export async function GET(req: Request) {
  try {
    console.log("[MMG webhook] GET request received");
    const supabase = createRouteHandlerClient({ cookies });
    console.log("[MMG webhook] Supabase client created");

    // Extract encrypted token from URL query parameters
    const { searchParams } = new URL(req.url);
    const encryptedToken = searchParams.get('token');
    console.log("[MMG webhook] token in query:", !!encryptedToken);

    if (!encryptedToken) {
      console.error("[MMG webhook] no encrypted token received from MMG");
      return NextResponse.json(
        { error: 'Missing encrypted TOKEN' },
        { status: 400 }
      );
    }

    // Decrypt the token
    let decryptedData: DecryptedPaymentResponse;
    try {
      console.log("[MMG webhook] decrypting token");
      decryptedData = decrypt(encryptedToken) as DecryptedPaymentResponse;
      console.log("[MMG webhook] decrypted:", { merchantTransactionId: decryptedData.merchantTransactionId, transactionId: decryptedData.transactionId, ResultCode: decryptedData.ResultCode });
    } catch (decryptError) {
      console.error("[MMG webhook] decrypt failed:", decryptError);
      return NextResponse.json(
        { error: 'Failed to decrypt token' },
        { status: 400 }
      );
    }

    // Convert ResultCode string to number for consistency
    const resultCode = decryptedData.ResultCode === '0' ? 0 : parseInt(decryptedData.ResultCode, 10);
    console.log("[MMG webhook] resultCode:", resultCode);

    // Validate required fields
    if (!decryptedData.merchantTransactionId) {
      console.log("[MMG webhook] validation failed: missing merchantTransactionId");
      return NextResponse.json(
        { error: 'Missing merchantTransactionId' },
        { status: 400 }
      );
    }

    // Log the webhook data to Supabase for audit trail
    console.log("[MMG webhook] inserting into mmg_webhook_logs");
    const { error: logError } = await supabase
      .from('mmg_webhook_logs')
      .insert({
        merchant_transaction_id: decryptedData.merchantTransactionId,
        transaction_id: decryptedData.transactionId,
        result_code: resultCode,
        result_message: decryptedData.ResultMessage,
        html_response: decryptedData.htmlResponse,
        raw_body: decryptedData,
      });

    if (logError) {
      console.error("[MMG webhook] error logging to mmg_webhook_logs:", logError);
    } else {
      console.log("[MMG webhook] mmg_webhook_logs insert ok");
    }

    // Fetch payment_transactions record using merchantTransactionId (which is payment_transactions.id)
    console.log("[MMG webhook] fetching payment_transactions by id:", decryptedData.merchantTransactionId);
    const { data: paymentTransaction, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', decryptedData.merchantTransactionId)
      .single();

    if (fetchError || !paymentTransaction) {
      console.error("[MMG webhook] payment transaction not found:", fetchError);
      return NextResponse.json(
        { error: 'Payment transaction not found' },
        { status: 404 }
      );
    }
    console.log("[MMG webhook] payment_transactions loaded:", { id: paymentTransaction.id, user_id: paymentTransaction.user_id, status: paymentTransaction.status });

    // Handle payment success
    if (resultCode === 0) {
      console.log("[MMG webhook] payment success path (resultCode 0)");
      // Idempotency: already processed — skip creating subscription, just redirect
      if (paymentTransaction.status === 'completed') {
        console.log("[MMG webhook] idempotent: already completed, redirecting to success");
        return NextResponse.redirect(
          new URL(`/payment-success?transactionId=${decryptedData.transactionId}&paymentId=${paymentTransaction.id}`, req.url),
          { status: 303 }
        );
      }

      // Calculate subscription dates (30 days from today)
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);
      console.log("[MMG webhook] subscription window:", { startDate: startDate.toISOString(), endDate: endDate.toISOString() });

      // Get user profile to determine role
      console.log("[MMG webhook] fetching user by id:", paymentTransaction.user_id);
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', paymentTransaction.user_id)
        .single();

      if (userError || !user) {
        console.error("[MMG webhook] user not found:", userError);
        throw new Error('User not found');
      }
      console.log("[MMG webhook] user loaded:", { id: user.id, role: user.role });

      // Create subscription record
      console.log("[MMG webhook] creating subscriptions record");
      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: paymentTransaction.user_id,
          user_role: user.role,
          plan_type: 'monthly',
          amount: paymentTransaction.amount,
          currency: paymentTransaction.currency,
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
        throw subscriptionError;
      }
      console.log("[MMG webhook] subscriptions created:", subscription.id);

      // Update payment_transactions record with subscription id
      console.log("[MMG webhook] updating payment_transactions with subscription_id and completed status");
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
        .eq('id', paymentTransaction.id);

      if (updatePaymentError) {
        console.error("[MMG webhook] error updating payment transaction:", updatePaymentError);
        throw updatePaymentError;
      }
      console.log("[MMG webhook] payment_transactions updated");

      // Update user profile based on role
      console.log("[MMG webhook] updating profile for role:", user.role);
      if (user.role === 'driver') {
        const { error: driverUpdateError } = await supabase
          .from('driver_profiles')
          .update({
            subscription_status: 'active',
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', paymentTransaction.user_id);

        if (driverUpdateError) {
          console.error("[MMG webhook] error updating driver profile:", driverUpdateError);
          throw driverUpdateError;
        }
        console.log("[MMG webhook] driver_profiles updated");
      } else if (user.role === 'rider') {
        const { error: riderUpdateError } = await supabase
          .from('rider_profiles')
          .update({
            subscription_status: 'active',
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', paymentTransaction.user_id);

        if (riderUpdateError) {
          console.error("[MMG webhook] error updating rider profile:", riderUpdateError);
          throw riderUpdateError;
        }
        console.log("[MMG webhook] rider_profiles updated");
      }

      // Redirect to success page
      console.log("[MMG webhook] success, redirecting to payment-success");
      return NextResponse.redirect(
        new URL(`/payment-success?transactionId=${decryptedData.transactionId}&paymentId=${paymentTransaction.id}`, req.url),
        { status: 303 }
      );
    } else {
      // Handle payment failure
      console.log("[MMG webhook] payment failure path (resultCode !== 0), marking transaction as failed");
      const { error: updatePaymentError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'failed',
          mmg_transaction_id: decryptedData.transactionId,
          gateway_response: decryptedData,
          error_message: decryptedData.ResultMessage || 'Payment failed',
        })
        .eq('id', paymentTransaction.id);

      if (updatePaymentError) {
        console.error("[MMG webhook] error updating payment transaction (failed):", updatePaymentError);
        throw updatePaymentError;
      }
      console.log("[MMG webhook] payment_transactions marked as failed, redirecting to payment-failed");

      // Redirect to failure page
      return NextResponse.redirect(
        new URL(`/payment-failed?transactionId=${decryptedData.transactionId}&paymentId=${paymentTransaction.id}&reason=${encodeURIComponent(decryptedData.ResultMessage)}`, req.url),
        { status: 303 }
      );
    }
  } catch (error) {
    console.error("[MMG webhook] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}