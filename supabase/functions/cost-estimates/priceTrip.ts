import { resolveLocation, type ResolvedLocation } from "./parseTrip.ts";
import { calculateFare, classifyZoneFromCoords } from "./pricing.ts";

export async function distanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<number | null> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set");

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${destination.lat},${destination.lng}` +
    `&region=gy&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Distance Matrix API error: ${response.status}`);

  const data = (await response.json()) as {
    rows?: Array<{ elements?: Array<{ status: string; distance?: { value: number } }> }>;
  };
  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;

  return element.distance!.value / 1000;
}

export type PickupCoords = { lat: number; lng: number };

export async function priceTrip({
  pickup,
  dropoff,
}: {
  pickup: PickupCoords;
  dropoff: string;
}) {
  if (!pickup || pickup.lat == null || pickup.lng == null) {
    throw new Error("priceTrip: pickup.lat and pickup.lng are required");
  }
  if (typeof dropoff !== "string" || !dropoff.trim()) {
    throw new Error("priceTrip: dropoff must be a non-empty string");
  }

  const pickupResolved: ResolvedLocation = {
    raw: null,
    address: null,
    formatted: null,
    lat: pickup.lat,
    lng: pickup.lng,
    placeId: null,
    source: "gps",
  };

  const dropoffResolved = await resolveLocation(dropoff);

  const dropLat = dropoffResolved.lat;
  const dropLng = dropoffResolved.lng;
  if (dropLat == null || dropLng == null) {
    return {
      pickup: pickupResolved,
      dropoff: dropoffResolved,
      fare: {
        status: "NEGOTIATE",
        total: null,
        message: "Could not resolve the dropoff location. Please confirm the fare with your driver before the ride.",
      },
    };
  }

  const km = await distanceKm(
    { lat: pickup.lat, lng: pickup.lng },
    { lat: dropLat, lng: dropLng },
  );
  const pickupZone = classifyZoneFromCoords(pickup.lat, pickup.lng);
  const dropoffZone = classifyZoneFromCoords(dropLat, dropLng);

  const fare = calculateFare({ distanceKm: km, pickupZone, dropoffZone });

  return {
    pickup: pickupResolved,
    dropoff: dropoffResolved,
    distanceKm: km,
    pickupZone,
    dropoffZone,
    fare,
  };
}
