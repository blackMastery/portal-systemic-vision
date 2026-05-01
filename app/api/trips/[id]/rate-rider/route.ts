import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors";
import { validate, rateRiderSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

function createSupabaseClientWithToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const tripId = params.id;

    // 1. Extract and validate Bearer token
    const accessToken = extractBearerToken(request);
    if (!accessToken) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError(
          "Missing or invalid Authorization header. Expected: Bearer <token>",
        ),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    // 2. Verify token and get auth user
    const authClient = createSupabaseClientWithToken(accessToken);
    const {
      data: { user: authUser },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !authUser) {
      logger.warn("Invalid or expired token", { error: authError });
      const { response, statusCode } = handleApiError(
        new AuthenticationError("Invalid or expired token."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    // 3. Resolve user record (mirror trip-status route — role check intentionally
    // omitted; ownership of the trip via driver_profiles is the real gate).
    const serviceClient = createSupabaseServiceClient();

    const { data: user, error: userError } = await authClient
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (userError || !user) {
      logger.warn("User not found", { authId: authUser.id, error: userError });
      const { response, statusCode } = handleApiError(
        new AuthenticationError("User not found."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    // 4. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      logger.error("Failed to parse request body", error);
      const { response, statusCode } = handleApiError(
        new Error("Invalid JSON in request body."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    const { rating, feedback } = validate(rateRiderSchema, body);

    // 5. Fetch trip and verify driver ownership + state
    const { data: trip, error: tripError } = await serviceClient
      .from("trips")
      .select("id, status, driver_id, rider_id, rider_rating")
      .eq("id", tripId)
      .single();

    if (tripError || !trip) {
      const { response, statusCode } = handleApiError(
        new NotFoundError("Trip not found."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    const { data: driverProfile } = await serviceClient
      .from("driver_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!driverProfile || trip.driver_id !== driverProfile.id) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError("You are not the driver for this trip."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    if (trip.status !== "completed") {
      const { response, statusCode } = handleApiError(
        new ConflictError(
          "Rider can only be rated after a trip is completed.",
        ),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    if (trip.rider_rating !== null && trip.rider_rating !== undefined) {
      const { response, statusCode } = handleApiError(
        new ConflictError("Rider rating has already been submitted for this trip."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    // 6. Persist. DB triggers handle rider_profiles aggregate sync and review queue insert.
    const { error: updateError } = await serviceClient
      .from("trips")
      .update({
        rider_rating: rating,
        rider_feedback: feedback ?? null,
      })
      .eq("id", tripId);

    if (updateError) {
      logger.error("Failed to persist rider rating", updateError, { tripId });
      const { response, statusCode } = handleApiError(updateError);
      return NextResponse.json(response, { status: statusCode });
    }

    logger.info("Rider rating submitted", { tripId, rating });

    return NextResponse.json({ success: true, tripId }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error submitting rider rating", error);
    const { response, statusCode } = handleApiError(error);
    return NextResponse.json(response, { status: statusCode });
  }
}
