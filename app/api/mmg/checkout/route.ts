import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { mmgService } from "@/lib/mmg";

export const dynamic = "force-dynamic";

interface CheckoutRequest {
  amount: number;
  currency?: string;
  description?: string;
  subscriptionStartDate?: string;
}

/** Normalized ISO instant for an explicit client-provided date. Throws if invalid. */
function parseExplicitSubscriptionStartDate(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("INVALID_SUBSCRIPTION_START_DATE");
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("INVALID_SUBSCRIPTION_START_DATE");
  }
  return d.toISOString();
}

function hasExplicitSubscriptionStart(body: CheckoutRequest): boolean {
  const raw = body.subscriptionStartDate;
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as CheckoutRequest;
    const { amount, currency = "GYD", description = "Subscription Payment" } = body;

    const explicitSubscriptionStart = hasExplicitSubscriptionStart(body);
    let subscriptionStartIso: string;
    try {
      subscriptionStartIso = explicitSubscriptionStart
        ? parseExplicitSubscriptionStartDate(body.subscriptionStartDate)
        : new Date().toISOString();
    } catch {
      return NextResponse.json(
        { error: "Invalid subscriptionStartDate. Use an ISO 8601 date or datetime string." },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount. Amount must be greater than 0" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, role, phone_number, full_name")
      .eq("auth_id", authUser.id)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    if (!user.role) {
      return NextResponse.json(
        { error: "User profile incomplete. Role not set." },
        { status: 400 }
      );
    }

    // Idempotency: reuse a recent pending transaction for the same user/amount
    // to prevent duplicate records on network retries
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existingTransaction } = await supabase
      .from("payment_transactions")
      .select("id, amount, currency, subscription_start_date")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("payment_method", "mmg")
      .gte("initiated_at", oneHourAgo)
      .order("initiated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingStart =
      existingTransaction?.subscription_start_date != null
        ? existingTransaction.subscription_start_date
        : null;
    // Implicit start = "now" differs per request; reuse on amount+currency only.
    // Explicit start must match the pending row's stored instant.
    const startDatesMatch =
      !explicitSubscriptionStart ||
      subscriptionStartIso === existingStart;

    const canReuse =
      !!existingTransaction &&
      existingTransaction.amount === amount &&
      existingTransaction.currency === currency &&
      startDatesMatch;

    let transactionId: string;

    if (canReuse && existingTransaction) {
      transactionId = existingTransaction.id;
    } else {
      const { data: newTransaction, error: transactionError } = await supabase
        .from("payment_transactions")
        .insert({
          user_id: user.id,
          amount,
          currency,
          payment_method: "mmg",
          status: "pending",
          initiated_at: new Date().toISOString(),
          subscription_start_date: subscriptionStartIso,
        })
        .select("id")
        .single();

      if (transactionError || !newTransaction) {
        console.error("[MMG checkout] error creating payment transaction:", transactionError);
        throw transactionError;
      }
      transactionId = newTransaction.id;
    }

    const checkoutUrl = await mmgService.createCheckoutSession({
      amount,
      currency,
      description,
      app_transaction_id: transactionId,
    });

    return NextResponse.json({
      success: true,
      paymentTransactionId: transactionId,
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
      },
      { status: 500 }
    );
  }
}
