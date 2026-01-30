import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { mmgService } from "@/lib/mmg";

const SUBSCRIPTION_TYPES = ["rider_monthly", "driver_monthly"] as const;
type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];

interface ConfirmPaymentRequest {
  transactionId: string;
  subscriptionType: string;
}

interface SubscriptionPrices {
  rider_monthly?: number;
  driver_monthly?: number;
}

function isSubscriptionType(s: string): s is SubscriptionType {
  return SUBSCRIPTION_TYPES.includes(s as SubscriptionType);
}

export async function POST(req: Request) {
  try {
    console.log("[MMG confirm-payment] POST request received");
    const body = (await req.json()) as ConfirmPaymentRequest;
    const { transactionId, subscriptionType } = body;
    console.log("[MMG confirm-payment] body:", { transactionId: transactionId ? `${transactionId.slice(0, 8)}...` : undefined, subscriptionType });

    if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
      console.log("[MMG confirm-payment] validation failed: transactionId missing or invalid");
      return NextResponse.json(
        { error: "transactionId is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!subscriptionType || !isSubscriptionType(subscriptionType)) {
      console.log("[MMG confirm-payment] validation failed: subscriptionType missing or invalid", subscriptionType);
      return NextResponse.json(
        { error: "subscriptionType is required and must be 'rider_monthly' or 'driver_monthly'" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    console.log("[MMG confirm-payment] Supabase client created");

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[MMG confirm-payment] auth failed: missing or invalid Authorization header");
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    console.log("[MMG confirm-payment] verifying Supabase token");
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.log("[MMG confirm-payment] auth failed: invalid token", authError?.message);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    console.log("[MMG confirm-payment] token verified, auth_id:", authUser.id);

    console.log("[MMG confirm-payment] fetching user profile");
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (userError || !user) {
      console.error("[MMG confirm-payment] user not found:", userError);
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }
    console.log("[MMG confirm-payment] user profile loaded:", { id: user.id, role: user.role });

    if (!user.role) {
      console.log("[MMG confirm-payment] validation failed: user role not set");
      return NextResponse.json(
        { error: "User profile incomplete. Role not set." },
        { status: 400 }
      );
    }

    // subscriptionType must match user role
    const expectedRoleByType: Record<SubscriptionType, string> = {
      rider_monthly: "rider",
      driver_monthly: "driver",
    };
    if (user.role !== expectedRoleByType[subscriptionType]) {
      console.log("[MMG confirm-payment] validation failed: subscriptionType does not match role", { subscriptionType, role: user.role });
      return NextResponse.json(
        { error: "subscriptionType does not match your account role" },
        { status: 400 }
      );
    }

    // Transaction already used by a different user -> 409
    console.log("[MMG confirm-payment] checking if transaction already used by another user");
    const { data: existingOther } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("mmg_transaction_id", transactionId.trim())
      .neq("user_id", user.id)
      .maybeSingle();

    if (existingOther) {
      console.log("[MMG confirm-payment] conflict: transaction already linked to another account");
      return NextResponse.json(
        { error: "Transaction already linked to another account" },
        { status: 409 }
      );
    }

    // Idempotency: same user, same transaction, already completed
    console.log("[MMG confirm-payment] checking idempotency (existing completed payment for this user + transactionId)");
    const { data: existingPayment } = await supabase
      .from("payment_transactions")
      .select("id, subscription_id")
      .eq("user_id", user.id)
      .eq("mmg_transaction_id", transactionId.trim())
      .eq("status", "completed")
      .maybeSingle();

    if (existingPayment) {
      console.log("[MMG confirm-payment] idempotent: already processed, returning existing", { paymentId: existingPayment.id, subscriptionId: existingPayment.subscription_id });
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        paymentTransactionId: existingPayment.id,
        subscriptionId: existingPayment.subscription_id,
        status: "completed",
      });
    }

    // Load expected price from system_config
    console.log("[MMG confirm-payment] loading subscription_prices from system_config");
    const { data: configRow, error: configError } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "subscription_prices")
      .maybeSingle();

    if (configError || !configRow?.value) {
      console.error("[MMG confirm-payment] system_config subscription_prices missing or error:", configError);
      return NextResponse.json(
        { error: "Subscription pricing is not configured" },
        { status: 500 }
      );
    }
    const prices = configRow.value as SubscriptionPrices;
    const expectedAmount = prices[subscriptionType];
    console.log("[MMG confirm-payment] expected amount for", subscriptionType, ":", expectedAmount);

    if (typeof expectedAmount !== "number" || expectedAmount <= 0) {
      console.error("[MMG confirm-payment] subscription_prices missing key or invalid:", subscriptionType, prices);
      return NextResponse.json(
        { error: "Subscription pricing is not configured for this plan" },
        { status: 500 }
      );
    }

    // Look up transaction at MMG (throws if not found or not successful)
    console.log("[MMG confirm-payment] calling MMG lookupTransaction");
    let lookupResult;
    try {
      lookupResult = await mmgService.lookupTransaction(transactionId.trim());
      console.log("[MMG confirm-payment] MMG lookup success, transactionStatus:", lookupResult.transactionStatus, "amount:", lookupResult.amount);
    } catch (lookupErr) {
      const message =
        lookupErr instanceof Error ? lookupErr.message : "Transaction lookup failed";
      console.error("[MMG confirm-payment] MMG lookup error:", lookupErr);
      return NextResponse.json(
        { error: "Transaction not found or not successful", details: message },
        { status: 400 }
      );
    }

    const amount = parseFloat(lookupResult.amount) || 0;
    if (amount !== expectedAmount) {
      console.log("[MMG confirm-payment] amount mismatch:", { amount, expectedAmount });
      return NextResponse.json(
        {
          error: "Payment amount does not match subscription price",
          code: "AMOUNT_MISMATCH",
        },
        { status: 422 }
      );
    }

    const currency = lookupResult.currency || "GYD";
    const mmgReference =
      lookupResult.transactionReference ||
      lookupResult.transactionReceipt ||
      transactionId.trim();
    const creationDate = lookupResult.creationDate
      ? new Date(lookupResult.creationDate)
      : new Date();
    const now = new Date();

    // Create payment record (completed)
    console.log("[MMG confirm-payment] creating payment_transactions record");
    const { data: paymentTransaction, error: transactionError } = await supabase
      .from("payment_transactions")
      .insert({
        user_id: user.id,
        amount,
        currency,
        payment_method: "mmg",
        status: "completed",
        mmg_transaction_id: transactionId.trim(),
        mmg_reference: mmgReference,
        initiated_at: creationDate.toISOString(),
        completed_at: now.toISOString(),
        gateway_response: lookupResult as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (transactionError || !paymentTransaction) {
      console.error("[MMG confirm-payment] error creating payment transaction:", transactionError);
      throw transactionError;
    }
    console.log("[MMG confirm-payment] payment_transactions created:", paymentTransaction.id);

    // Subscription dates (30 days)
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);
    console.log("[MMG confirm-payment] subscription window:", { startDate: startDate.toISOString(), endDate: endDate.toISOString() });

    // Create subscription record
    console.log("[MMG confirm-payment] creating subscriptions record");
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        user_role: user.role,
        plan_type: "monthly",
        amount,
        currency,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: "active",
        payment_method: "mmg",
        payment_reference: transactionId.trim(),
        payment_date: now.toISOString(),
      })
      .select()
      .single();

    if (subscriptionError || !subscription) {
      console.error("[MMG confirm-payment] error creating subscription:", subscriptionError);
      throw subscriptionError;
    }
    console.log("[MMG confirm-payment] subscriptions created:", subscription.id);

    // Link payment to subscription
    console.log("[MMG confirm-payment] linking payment to subscription");
    const { error: updatePaymentError } = await supabase
      .from("payment_transactions")
      .update({
        subscription_id: subscription.id,
      })
      .eq("id", paymentTransaction.id);

    if (updatePaymentError) {
      console.error("[MMG confirm-payment] error updating payment with subscription_id:", updatePaymentError);
      throw updatePaymentError;
    }
    console.log("[MMG confirm-payment] payment linked to subscription");

    // Update user profile by role
    console.log("[MMG confirm-payment] updating profile for role:", user.role);
    if (user.role === "driver") {
      const { error: driverUpdateError } = await supabase
        .from("driver_profiles")
        .update({
          subscription_status: "active",
          subscription_start_date: startDate.toISOString(),
          subscription_end_date: endDate.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", user.id);

      if (driverUpdateError) {
        console.error("[MMG confirm-payment] error updating driver profile:", driverUpdateError);
        throw driverUpdateError;
      }
      console.log("[MMG confirm-payment] driver_profiles updated");
    } else if (user.role === "rider") {
      const { error: riderUpdateError } = await supabase
        .from("rider_profiles")
        .update({
          subscription_status: "active",
          subscription_start_date: startDate.toISOString(),
          subscription_end_date: endDate.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", user.id);

      if (riderUpdateError) {
        console.error("[MMG confirm-payment] error updating rider profile:", riderUpdateError);
        throw riderUpdateError;
      }
      console.log("[MMG confirm-payment] rider_profiles updated");
    }

    console.log("[MMG confirm-payment] success, returning response", { paymentId: paymentTransaction.id, subscriptionId: subscription.id });
    return NextResponse.json({
      success: true,
      paymentTransactionId: paymentTransaction.id,
      subscriptionId: subscription.id,
      amount,
      currency,
      status: "completed",
    });
  } catch (error) {
    console.error("[MMG confirm-payment] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
