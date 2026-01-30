import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { mmgService } from "@/lib/mmg";

interface CheckoutRequest {
  amount: number;
  currency?: string;
  description?: string;
}

export async function POST(req: Request) {
  try {
    console.log("[MMG checkout] POST request received");
    const body = await req.json() as CheckoutRequest;
    const { amount, currency = "GYD", description = "Subscription Payment" } = body;
    console.log("[MMG checkout] body:", { amount, currency, description });

    // Validate amount
    if (!amount || amount <= 0) {
      console.log("[MMG checkout] validation failed: invalid amount", amount);
      return NextResponse.json(
        { error: "Invalid amount. Amount must be greater than 0" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    console.log("[MMG checkout] Supabase client created");

    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[MMG checkout] auth failed: missing or invalid Authorization header");
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    // Verify the token with Supabase
    const token = authHeader.split(" ")[1];
    console.log("[MMG checkout] verifying Supabase token");
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.log("[MMG checkout] auth failed: invalid token", authError?.message);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    console.log("[MMG checkout] token verified, auth_id:", authUser.id);

    // Get user profile from users table
    console.log("[MMG checkout] fetching user profile");
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, role, phone_number, full_name")
      .eq("auth_id", authUser.id)
      .single();

    if (userError || !user) {
      console.error("[MMG checkout] user not found:", userError);
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }
    console.log("[MMG checkout] user profile loaded:", { id: user.id, role: user.role });

    // Validate user has a role
    if (!user.role) {
      console.log("[MMG checkout] validation failed: user role not set");
      return NextResponse.json(
        { error: "User profile incomplete. Role not set." },
        { status: 400 }
      );
    }

    // Create payment_transactions record
    console.log("[MMG checkout] creating payment_transactions record");
    const { data: paymentTransaction, error: transactionError } = await supabase
      .from("payment_transactions")
      .insert({
        user_id: user.id,
        amount,
        currency,
        payment_method: "mmg",
        status: "pending",
        initiated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (transactionError || !paymentTransaction) {
      console.error("[MMG checkout] error creating payment transaction:", transactionError);
      throw transactionError;
    }
    console.log("[MMG checkout] payment_transactions created:", paymentTransaction.id);

    // Create MMG checkout session using payment_transaction.id as merchant transaction ID
    console.log("[MMG checkout] creating MMG checkout session");
    const checkoutUrl = await mmgService.createCheckoutSession({
      amount,
      currency,
      description,
      app_transaction_id: paymentTransaction.id,
    });
    console.log("[MMG checkout] checkout URL generated, redirectUrl length:", checkoutUrl?.length ?? 0);

    // Return successful response
    console.log("[MMG checkout] success, returning response");
    return NextResponse.json({
      success: true,
      paymentTransactionId: paymentTransaction.id,
      redirectUrl: checkoutUrl,
      amount,
      currency,
      status: "PENDING",
    });
  } catch (error) {
    console.error("[MMG checkout] error:", error);
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
