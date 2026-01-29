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

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Parse the request to get the encrypted token
    const rawBody = await req.text();
    const bodyParams = new URLSearchParams(rawBody);
    const encryptedToken = bodyParams.get('TOKEN');

    console.log("🚀 ~ POST ~ encryptedToken received:", !!encryptedToken);

    if (!encryptedToken) {
      console.error('No encrypted token received from MMG');
      return NextResponse.json(
        { error: 'Missing encrypted TOKEN' },
        { status: 400 }
      );
    }

    // Decrypt the token
    let decryptedData: DecryptedPaymentResponse;
    try {
      decryptedData = decrypt(encryptedToken) as DecryptedPaymentResponse;
      console.log("🚀 ~ POST ~ decryptedData:", decryptedData);
    } catch (decryptError) {
      console.error('Error decrypting MMG token:', decryptError);
      return NextResponse.json(
        { error: 'Failed to decrypt token' },
        { status: 400 }
      );
    }

    // Convert ResultCode string to number for consistency
    const resultCode = decryptedData.ResultCode === '0' ? 0 : parseInt(decryptedData.ResultCode, 10);

    // Validate required fields
    if (!decryptedData.merchantTransactionId) {
      return NextResponse.json(
        { error: 'Missing merchantTransactionId' },
        { status: 400 }
      );
    }

    // Log the webhook data to Supabase for audit trail
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
      console.error('Error logging webhook data:', logError);
    }

    // Fetch payment_transactions record using merchantTransactionId (which is payment_transactions.id)
    const { data: paymentTransaction, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', decryptedData.merchantTransactionId)
      .single();

    if (fetchError || !paymentTransaction) {
      console.error('Payment transaction not found:', fetchError);
      return NextResponse.json(
        { error: 'Payment transaction not found' },
        { status: 404 }
      );
    }

    console.log("🚀 ~ POST ~ paymentTransaction:", paymentTransaction);

    // Handle payment success
    if (resultCode === 0) {
      // Calculate subscription dates (30 days from today)
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);

      // Get user profile to determine role
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', paymentTransaction.user_id)
        .single();

      if (userError || !user) {
        console.error('User not found:', userError);
        throw new Error('User not found');
      }

      console.log("🚀 ~ POST ~ user:", user);

      // Create subscription record
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
        console.error('Error creating subscription:', subscriptionError);
        throw subscriptionError;
      }

      console.log("🚀 ~ POST ~ subscription:", subscription);

      // Update payment_transactions record with subscription id
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
        console.error('Error updating payment transaction:', updatePaymentError);
        throw updatePaymentError;
      }

      // Update user profile based on role
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
          console.error('Error updating driver profile:', driverUpdateError);
          throw driverUpdateError;
        }

        console.log("🚀 ~ POST ~ driver profile updated");
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
          console.error('Error updating rider profile:', riderUpdateError);
          throw riderUpdateError;
        }

        console.log("🚀 ~ POST ~ rider profile updated");
      }

      // Redirect to success page
      return NextResponse.redirect(
        new URL(`/payment-success?transactionId=${decryptedData.transactionId}&paymentId=${paymentTransaction.id}`, req.url),
        { status: 303 }
      );
    } else {
      // Handle payment failure
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
        console.error('Error updating payment transaction:', updatePaymentError);
        throw updatePaymentError;
      }

      console.log("🚀 ~ POST ~ payment failed, transaction marked as failed");

      // Redirect to failure page
      return NextResponse.redirect(
        new URL(`/payment-failed?transactionId=${decryptedData.transactionId}&paymentId=${paymentTransaction.id}&reason=${encodeURIComponent(decryptedData.ResultMessage)}`, req.url),
        { status: 303 }
      );
    }
  } catch (error) {
    console.error('Error processing MMG webhook:', error);
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