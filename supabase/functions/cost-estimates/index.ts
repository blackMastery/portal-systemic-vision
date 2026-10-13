/// <reference path="./env.d.ts" />
// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { priceTrip } from "./priceTrip.ts";

/** CORS — https://supabase.com/docs/guides/functions/cors */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Secrets: GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY — `supabase secrets set ...` */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** POST JSON: `{ pickup: { lat, lng }, dropoff: string, dropOffLat?, dropOffLng? }` */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Expected JSON object" }, 400);
  }

  const { pickup, dropoff, dropOffLat, dropOffLng } = body as Record<string, unknown>;

  if (!pickup || typeof pickup !== "object") {
    return jsonResponse({ error: "pickup is required (object with lat, lng)" }, 400);
  }

  const p = pickup as Record<string, unknown>;
  const lat = p.lat;
  const lng = p.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return jsonResponse({ error: "pickup.lat and pickup.lng must be numbers" }, 400);
  }

  if (typeof dropoff !== "string" || !dropoff.trim()) {
    return jsonResponse({ error: "dropoff must be a non-empty string" }, 400);
  }

  try {
    const result = await priceTrip({
      pickup: { lat, lng },
      dropoff,
      dropOffLat: dropOffLat !== undefined ? Number(dropOffLat) : undefined,
      dropOffLng: dropOffLng !== undefined ? Number(dropOffLng) : undefined,
    });
    return jsonResponse(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (
      msg.includes("priceTrip:") ||
      msg.includes("pickup.lat") ||
      msg.includes("dropoff must")
    ) {
      return jsonResponse({ error: msg }, 400);
    }

    if (
      msg.includes("environment variable is not set") ||
      msg.includes("GOOGLE_MAPS_API_KEY") ||
      msg.includes("ANTHROPIC_API_KEY")
    ) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    if (msg.includes("API error")) {
      return jsonResponse({ error: "Upstream service unavailable" }, 502);
    }

    console.error("cost-estimates:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
