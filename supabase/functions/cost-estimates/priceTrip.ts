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

async function reverseGeocode(
  coords: PickupCoords,
): Promise<{ address: string | null; formatted: string | null; placeId: string | null }> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set");

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}` +
    `&region=gy&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) return { address: null, formatted: null, placeId: null };

  const data = (await response.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
    }>;
  };

  if (data.status !== "OK" || !data.results?.length) {
    return { address: null, formatted: null, placeId: null };
  }

  const top = data.results[0];
  return {
    address: top.formatted_address,
    formatted: top.formatted_address,
    placeId: top.place_id,
  };
}

function isFiniteCoordPair(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng);
}

export async function priceTrip({
  pickup,
  dropoff,
  dropOffLat,
  dropOffLng,
}: {
  pickup: PickupCoords;
  dropoff: string;
  dropOffLat?: number;
  dropOffLng?: number;
}) {
  if (!pickup || pickup.lat == null || pickup.lng == null) {
    throw new Error("priceTrip: pickup.lat and pickup.lng are required");
  }
  if (typeof dropoff !== "string" || !dropoff.trim()) {
    throw new Error("priceTrip: dropoff must be a non-empty string");
  }

  const usingDropOffGps = dropOffLat !== undefined || dropOffLng !== undefined;
  if (usingDropOffGps && !isFiniteCoordPair(dropOffLat, dropOffLng)) {
    throw new Error(
      "priceTrip: dropOffLat and dropOffLng must both be finite numbers when either is provided",
    );
  }

  const pickupAddress = await reverseGeocode(pickup);

  const pickupResolved: ResolvedLocation = {
    raw: null,
    address: pickupAddress.address,
    formatted: pickupAddress.formatted,
    lat: pickup.lat,
    lng: pickup.lng,
    placeId: pickupAddress.placeId,
    source: "gps",
  };

  const dropoffResolved = await resolveLocation(dropoff);

  const dropLat = usingDropOffGps ? dropOffLat! : dropoffResolved.lat;
  const dropLng = usingDropOffGps ? dropOffLng! : dropoffResolved.lng;

  const dropoffForResponse: ResolvedLocation = usingDropOffGps
    ? {
      ...dropoffResolved,
      lat: dropLat,
      lng: dropLng,
      source: dropoffResolved.lat != null && dropoffResolved.lng != null
        ? `${dropoffResolved.source}+gps`
        : "gps",
    }
    : dropoffResolved;

  if (dropLat == null || dropLng == null) {
    return {
      pickup: pickupResolved,
      dropoff: dropoffForResponse,
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
    dropoff: dropoffForResponse,
    distanceKm: km,
    pickupZone,
    dropoffZone,
    fare,
  };
}
