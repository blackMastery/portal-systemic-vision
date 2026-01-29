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
    const body = await req.json() as CheckoutRequest;
    const { amount, currency = "GYD", description = "Subscription Payment" } = body;
    
    console.log("🚀 ~ POST ~ body:", body);

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount. Amount must be greater than 0" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    // Verify the token with Supabase
    const token = authHeader.split(" ")[1];
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user profile from users table
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, role, phone_number, full_name")
      .eq("auth_id", authUser.id)
      .single();

    if (userError || !user) {
      console.error("User not found:", userError);
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Validate user has a role
    if (!user.role) {
      return NextResponse.json(
        { error: "User profile incomplete. Role not set." },
        { status: 400 }
      );
    }

    // Create payment_transactions record
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
      console.error("Error creating payment transaction:", transactionError);
      throw transactionError;
    }

    console.log("🚀 ~ POST ~ paymentTransaction:", paymentTransaction);

    // Create MMG checkout session using payment_transaction.id as merchant transaction ID
    const checkoutUrl = await mmgService.createCheckoutSession({
      amount,
      currency,
      description,
      app_transaction_id: paymentTransaction.id,
    });

    // Return successful response
    return NextResponse.json({
      success: true,
      paymentTransactionId: paymentTransaction.id,
      redirectUrl: checkoutUrl,
      amount,
      currency,
      status: "PENDING",
    });
  } catch (error) {
    console.error("MMG checkout error:", error);
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
