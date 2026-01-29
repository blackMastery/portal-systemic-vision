import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface PaymentResponse {
  merchantTransactionId: string;
  transactionId: string;
  resultCode: number;
  resultMessage: string | null;
  htmlResponse: string;
  sourceOfFundsList: any | null;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Parse webhook body
    const rawBody = await req.text();
    const body = JSON.parse(rawBody) as PaymentResponse;
    console.log("🚀 ~ POST ~ body:", body);

    // Validate required fields
    if (!body.merchantTransactionId) {
      return NextResponse.json(
        { error: 'Missing merchantTransactionId' },
        { status: 400 }
      );
    }

    // Log the webhook data to Supabase for audit trail
    const { error: logError } = await supabase
      .from('mmg_webhook_logs')
      .insert({
        merchant_transaction_id: body.merchantTransactionId,
        transaction_id: body.transactionId,
        result_code: body.resultCode,
        result_message: body.resultMessage,
        html_response: body.htmlResponse,
        raw_body: body,
      });

    if (logError) {
      console.error('Error logging webhook data:', logError);
    }

    // Fetch payment_transactions record using merchantTransactionId (which is payment_transactions.id)
    const { data: paymentTransaction, error: fetchError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('id', body.merchantTransactionId)
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
    if (body.resultCode === 0) {
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
          payment_reference: body.transactionId,
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
          mmg_transaction_id: body.transactionId,
          mmg_reference: body.transactionId,
          completed_at: new Date().toISOString(),
          gateway_response: body,
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

      return NextResponse.json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          merchantTransactionId: body.merchantTransactionId,
          transactionId: body.transactionId,
          status: 'completed',
          subscriptionId: subscription.id,
        },
      });
    } else {
      // Handle payment failure
      const { error: updatePaymentError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'failed',
          mmg_transaction_id: body.transactionId,
          gateway_response: body,
          error_message: body.resultMessage || 'Payment failed',
        })
        .eq('id', paymentTransaction.id);

      if (updatePaymentError) {
        console.error('Error updating payment transaction:', updatePaymentError);
        throw updatePaymentError;
      }

      console.log("🚀 ~ POST ~ payment failed, transaction marked as failed");

      return NextResponse.json({
        success: true,
        message: 'Payment failed - user can retry',
        data: {
          merchantTransactionId: body.merchantTransactionId,
          transactionId: body.transactionId,
          status: 'failed',
          resultCode: body.resultCode,
          resultMessage: body.resultMessage,
        },
      });
    }
  } catch (error) {
    console.error('MMG webhook error:', error);
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