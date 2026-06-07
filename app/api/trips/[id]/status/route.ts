import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import { validate, updateTripStatusSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { sendNotificationsToUsers } from "@/lib/firebase/notifications";

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

export async function PATCH(
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

    // 3. Verify user exists and is a driver (use auth client — untyped, matches trip-requests pattern)
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

    // if (user.role !== 'driver') {
    //   const { response, statusCode } = handleApiError(
    //     new AuthorizationError('Only drivers can update trip status.')
    //   )
    //   return NextResponse.json(response, { status: statusCode })
    // }

    // 4. Parse and validate request body
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

    const validatedBody = validate(updateTripStatusSchema, body);
    let { status } = validatedBody;
    const completeStopIndex = validatedBody.complete_stop_index;

    // 5. Fetch trip and verify driver ownership
    const { data: trip, error: tripError } = await serviceClient
      .from("trips")
      .select("id, rider_id, driver_id, status, current_stop_index")
      .eq("id", tripId)
      .single();

    if (tripError || !trip) {
      const { response, statusCode } = handleApiError(
        new NotFoundError("Trip not found."),
      );
      return NextResponse.json(response, { status: statusCode });
    }

    // Resolve driver_profiles.user_id → users.id mapping
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

    // 6. Handle multi-dropoff stop completion
    let stopCompletionMeta: {
      completedSequence: number;
      totalStops: number;
      tripFullyCompleted: boolean;
    } | null = null;

    if (
      completeStopIndex !== undefined &&
      status === "picked_up"
    ) {
      const stopSequence = completeStopIndex + 1;

      const { data: stopRow, error: stopFetchError } = await serviceClient
        .from("trip_stops")
        .select("id, sequence, status")
        .eq("trip_id", tripId)
        .eq("sequence", stopSequence)
        .maybeSingle();

      if (stopFetchError || !stopRow) {
        const { response, statusCode } = handleApiError(
          new NotFoundError(`Stop ${stopSequence} not found for this trip.`),
        );
        return NextResponse.json(response, { status: statusCode });
      }

      if (stopRow.status === "completed") {
        const { response, statusCode } = handleApiError(
          new Error(`Stop ${stopSequence} is already completed.`),
        );
        return NextResponse.json(response, { status: statusCode });
      }

      const completedAt = validatedBody.completed_at
        ? new Date(validatedBody.completed_at).toISOString()
        : new Date().toISOString();

      const stopUpdate: Record<string, unknown> = {
        status: "completed",
        completed_at: completedAt,
      };
      if (validatedBody.completed_latitude !== undefined) {
        stopUpdate.completed_latitude = validatedBody.completed_latitude;
      }
      if (validatedBody.completed_longitude !== undefined) {
        stopUpdate.completed_longitude = validatedBody.completed_longitude;
      }

      const { error: stopUpdateError } = await serviceClient
        .from("trip_stops")
        .update(stopUpdate)
        .eq("id", stopRow.id);

      if (stopUpdateError) {
        logger.error("Failed to complete trip stop", stopUpdateError, {
          tripId,
          stopSequence,
        });
        const { response, statusCode } = handleApiError(stopUpdateError);
        return NextResponse.json(response, { status: statusCode });
      }

      const { count: totalStops } = await serviceClient
        .from("trip_stops")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId);

      const { count: remainingPending } = await serviceClient
        .from("trip_stops")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "pending");

      const total = totalStops ?? 0;
      const isLastStop = (remainingPending ?? 0) === 0;

      stopCompletionMeta = {
        completedSequence: stopSequence,
        totalStops: total,
        tripFullyCompleted: isLastStop,
      };

      if (isLastStop) {
        status = "completed";
      }
    }

    // 7. Build updates object
    const updates: Record<string, unknown> = { status };

    if (completeStopIndex !== undefined) {
      const { count: completedStops } = await serviceClient
        .from("trip_stops")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "completed");

      updates.current_stop_index = completedStops ?? 0;
    }

    if (status === "picked_up" && completeStopIndex === undefined) {
      updates.picked_up_at = new Date().toISOString();
    } else if (status === "completed") {
      updates.completed_at = validatedBody.completed_at
        ? new Date(validatedBody.completed_at).toISOString()
        : new Date().toISOString();
      if (validatedBody.completed_latitude !== undefined) {
        updates.completed_latitude = validatedBody.completed_latitude;
      }
      if (validatedBody.completed_longitude !== undefined) {
        updates.completed_longitude = validatedBody.completed_longitude;
      }
      if (validatedBody.actual_distance_km !== undefined) {
        updates.actual_distance_km = validatedBody.actual_distance_km;
      }
      // if (validatedBody.actual_fare !== undefined) {
      //   updates.actual_fare = validatedBody.actual_fare;
      // }
    } else if (status === "cancelled") {
      updates.cancelled_at = new Date().toISOString();
      if (validatedBody.cancellation_reason !== undefined) {
        updates.cancellation_reason = validatedBody.cancellation_reason;
        updates.cancelled_by_user_id = user.id;
        updates.cancelled_at = new Date().toISOString();
      }
    }

    // 8. Update the trip
    const { error: updateError } = await serviceClient
      .from("trips")
      .update(updates)
      .eq("id", tripId);

    if (updateError) {
      logger.error("Failed to update trip status", updateError, {
        tripId,
        status,
      });
      const { response, statusCode } = handleApiError(updateError);
      return NextResponse.json(response, { status: statusCode });
    }

    logger.info("Trip status updated", { tripId, status });

    // 9. On cancellation, reset linked trip_request to 'requested' (fire-and-forget)
    if (status === "cancelled") {
      try {
        const { data: tripRow } = await serviceClient
          .from("trips")
          .select("*")
          .eq("id", tripId)
          .maybeSingle();

        const requestId = (tripRow as Record<string, unknown> | null)
          ?.request_id as string | undefined;
        if (requestId) {
          // check if the trip_request is expired
          const { data: tripRequest } = await serviceClient
            .from("trip_requests")
            .select("*")
            .eq("id", requestId)
            .maybeSingle();

          const isExpired =
            tripRequest?.expires_at &&
            new Date(tripRequest.expires_at) < new Date();
          // if not expired, update the trip_request to requested and calculate remaining time to be expired in 10 minutes
          const remainingTime =
            new Date(tripRequest.expires_at).getTime() - new Date().getTime();
          const expiresAt = new Date(Date.now() + remainingTime);

          if (!isExpired) {
            await serviceClient
              .from("trip_requests")
              .update({
                status: "requested",
                expires_at: expiresAt.toISOString(),
              })
              .eq("id", requestId);
          } else {
            // send notification to rider that the trip has been cancelled and is now available to be requested again
            await sendNotificationsToUsers(
              [tripRow?.rider_id as string],
              "Trip Cancelled",
              "Your trip has been cancelled and is now available to be requested again",
              "rider",
              { trip_id: tripId, notification_type: `trip_cancelled` },
            );
          }
          logger.info("Reset trip_request to requested", { requestId });
        }
      } catch (e) {
        logger.warn("Failed to reset trip_request status on cancellation", {
          tripId,
          error: e,
        });
      }
    }

    // 10. Send push notification to rider (fire-and-forget)
    const riderId = trip.rider_id;
    if (riderId) {
      let title: string;
      let notificationBody: string;

      if (stopCompletionMeta && !stopCompletionMeta.tripFullyCompleted) {
        title = "Stop Completed";
        notificationBody = `Stop ${stopCompletionMeta.completedSequence} of ${stopCompletionMeta.totalStops} completed.`;
      } else if (status === "picked_up") {
        title = "Driver Arrived";
        notificationBody = "Your driver has arrived at the pickup location";
      } else if (status === "completed") {
        title = "Trip Completed";
        notificationBody =
          "Your trip has been completed. Thank you for using Links!";
      } else {
        title = "Trip Cancelled";
        notificationBody = "Your trip has been cancelled by the driver";
      }

      // Resolve rider user_id from rider_profiles (fire-and-forget)
      Promise.resolve(
        serviceClient
          .from("rider_profiles")
          .select("user_id")
          .eq("id", riderId)
          .single(),
      )
        .then(({ data: riderProfile }) => {
          if (!riderProfile?.user_id) return;
          return sendNotificationsToUsers(
            [riderProfile.user_id],
            title,
            notificationBody,
            "rider",
            { trip_id: tripId, notification_type: `trip_${status}` },
          );
        })
        .catch((error) => {
          logger.warn("Failed to send trip status notification to rider", {
            tripId,
            status,
            error,
          });
        });
    }

    return NextResponse.json({ success: true, tripId }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error updating trip status", error);
    const { response, statusCode } = handleApiError(error);
    return NextResponse.json(response, { status: statusCode });
  }
}
