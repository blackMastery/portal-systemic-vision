// ───────────────────────────────────────────────────────────
//  Links 592 — Fare Calculation Engine (v4 — Hybrid)
//  Currency: GYD
//  Town / East Coast formulas = original confirmed calibration
//  West side / Airport / Linden / Berbice = Matrix-derived data
// ───────────────────────────────────────────────────────────

export const PRICED_ZONES = [
  "CENTRAL",
  "EAST_BANK",
  "EAST_COAST",
  "WEST_COAST",
  "WEST_BANK",
  "AIRPORT",
  "LINDEN",
  "BERBICE",
] as const;

export const UNPRICED_ZONES = ["ESSEQUIBO", "INTERIOR"] as const;

export const MINIMUM_FARE = 540; // minimum fare for any trip
const SHORT_DROP_KM = 3; // short-drop threshold
const SHORT_DROP_RATE = 350; // $/km for short drops (all zones)

// ── Rounding — nearest $100, preserve $X50 values ──
export function roundFare(amount: number): number {
  const rounded = Math.round(amount);
  if (rounded % 100 === 50) return rounded;
  return Math.round(rounded / 100) * 100;
}

// ── Zone classification from coordinates (fallback) ──
export function classifyZoneFromCoords(lat: number, lng: number): string {
  // Airport (CJIA) — specific location
  if (Math.abs(lat - 6.4986) < 0.05 && Math.abs(lng + 58.2541) < 0.05) return "AIRPORT";

  // Deep interior (Lethem, Mahdia) — far south
  if (lat < 5.5) return "INTERIOR";

  // Essequibo Coast — west of Essequibo River
  if (lng < -58.45 && lat > 6.9) return "ESSEQUIBO";

  // Berbice — east of Mahaica River (lng > -57.75)
  // Checked BEFORE lat-based LINDEN rule so east-side villages don't fall into LINDEN
  if (lng > -57.75) return "BERBICE";

  // Linden corridor — south of Soesdyke on the EB highway (south-west of GT)
  // Only trigger when BOTH south of 6.55 AND still west of Berbice longitude band
  if (lat < 6.55 && lng < -58.0) return "LINDEN";

  // Central Georgetown polygon
  if (lat >= 6.785 && lat <= 6.828 && lng >= -58.175 && lng <= -58.125) return "CENTRAL";

  // West of Demerara River
  if (lng < -58.185) return lat >= 6.78 ? "WEST_COAST" : "WEST_BANK";

  // East Bank corridor: anywhere west of central polygon (lng < -58.175) AND east of river
  // Catches Houston, McDoom, Agricola — strip between central GT and the river
  if (lng < -58.175) return "EAST_BANK";

  // South of Central polygon — East Bank corridor
  // But only when still close to central (lng > -58.0) — further east is East Coast
  if (lat < 6.785 && lng < -58.0) return "EAST_BANK";

  // Default: East Coast Demerara
  return "EAST_COAST";
}

export function crossesDemeraraRiver(zoneA: string, zoneB: string): boolean {
  const westSide = ["WEST_COAST", "WEST_BANK"];
  return westSide.includes(zoneA) !== westSide.includes(zoneB);
}

// ── East Bank bracket pricing (from original confirmed calibration) ──
// Matches: Camp→Diamond 14km = $3,500, Soesdyke 25km, Airport-adjacent routes
function eastBankBrackets(distanceKm: number): number {
  const brackets = [
    { upToKm: 4, rate: 350 }, // first 4km
    { upToKm: 9, rate: 300 }, // km 5-9
    { upToKm: 20, rate: 120 }, // km 10-20 (highway entry)
    { upToKm: 30, rate: 200 }, // km 21-30 (climbing)
    { upToKm: Infinity, rate: 380 }, // km 31+
  ];
  let remaining = distanceKm,
    charge = 0,
    prev = 0;
  for (const { upToKm, rate } of brackets) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, upToKm - prev);
    charge += used * rate;
    remaining -= used;
    prev = upToKm;
  }
  return charge;
}

// ── Haversine (straight-line) distance in km ──────────────
// Used as a sanity check against Google's driving distance.
// Normal road routing produces 1.1x–1.5x the straight-line distance.
// If Google returns something much higher, likely GPS error or routing anomaly.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Distance sanity check ─────────────────────────────────
// Takes the Google-reported distance and the straight-line distance,
// returns a sanity-checked distance plus a flag if adjustment was needed.
// Rules:
//   - If Google distance ≤ 1.5× straight-line → use Google as-is (normal routing)
//   - If Google distance > 1.5× straight-line → likely GPS/routing anomaly,
//     cap at 1.5× straight-line (passengers shouldn't pay for routing errors)
//   - If Google distance < straight-line → use straight-line (impossible otherwise)
export const SANITY_MULTIPLIER = 1.5;

export function sanityCheckDistance(
  googleKm: number,
  straightLineKm: number | null,
): { km: number; adjusted: boolean; reason: string | null } {
  if (straightLineKm == null || straightLineKm <= 0) {
    return { km: googleKm, adjusted: false, reason: null };
  }
  const maxExpected = straightLineKm * SANITY_MULTIPLIER;
  if (googleKm > maxExpected) {
    return {
      km: maxExpected,
      adjusted: true,
      reason: `Google distance (${googleKm.toFixed(2)}km) exceeded ${SANITY_MULTIPLIER}× straight-line (${
        straightLineKm.toFixed(2)
      }km); capped at ${maxExpected.toFixed(2)}km`,
    };
  }
  if (googleKm < straightLineKm) {
    return {
      km: straightLineKm,
      adjusted: true,
      reason: `Google distance (${googleKm.toFixed(2)}km) less than straight-line (${
        straightLineKm.toFixed(2)
      }km); using straight-line`,
    };
  }
  return { km: googleKm, adjusted: false, reason: null };
}

// ───────────────────────────────────────────────────────────
//  MAIN FUNCTION
// ───────────────────────────────────────────────────────────
export function calculateFare({
  distanceKm,
  pickupZone,
  dropoffZone,
}: {
  distanceKm: number | null;
  pickupZone: string;
  dropoffZone: string;
}) {
  // Validate
  if (distanceKm == null || distanceKm < 0) {
    return {
      status: "NEGOTIATE",
      total: null,
      message:
        "We couldn't calculate the route distance. Please confirm the fare with your driver before the ride.",
      breakdown: null,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm: null,
    };
  }

  // Absurdly long distance — likely coordinate error or trip to deep interior
  // Max realistic coastal road distance in Guyana is ~300km (GT → Corriverton border)
  // Georgetown → Lethem via Linden-Lethem road is ~560km but should route via INTERIOR zone
  if (distanceKm > 300) {
    return {
      status: "NEGOTIATE",
      total: null,
      message:
        "This route is too long for automatic pricing. Please agree on a fare directly with your driver.",
      breakdown: null,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // Essequibo / Interior → NEGOTIATE
  if (UNPRICED_ZONES.includes(pickupZone as (typeof UNPRICED_ZONES)[number]) ||
    UNPRICED_ZONES.includes(dropoffZone as (typeof UNPRICED_ZONES)[number])) {
    return {
      status: "NEGOTIATE",
      total: null,
      message:
        "We don't have pricing data for this route yet. Please agree on a fare directly with your driver.",
      breakdown: null,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // Unknown zones
  if (!PRICED_ZONES.includes(pickupZone as (typeof PRICED_ZONES)[number]) ||
    !PRICED_ZONES.includes(dropoffZone as (typeof PRICED_ZONES)[number])) {
    return {
      status: "NEGOTIATE",
      total: null,
      message:
        "We couldn't identify the location for this route. Please agree on a fare directly with your driver.",
      breakdown: null,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  PRICED PATHS
  // ═══════════════════════════════════════════════════════

  // ── Airport flat rate ─────────────────────────────────
  if (pickupZone === "AIRPORT" || dropoffZone === "AIRPORT") {
    return {
      status: "PRICED",
      total: roundFare(9500),
      message: null,
      breakdown: "Airport flat rate $9,500",
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Short drop (<3km) — original $350/km rate ─────────
  if (distanceKm < SHORT_DROP_KM) {
    const raw = Math.max(MINIMUM_FARE, Math.round(distanceKm * SHORT_DROP_RATE));
    const total = Math.max(MINIMUM_FARE, roundFare(raw));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: total === MINIMUM_FARE
        ? `Minimum fare $${MINIMUM_FARE}`
        : `${distanceKm}km × $${SHORT_DROP_RATE} = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Cross-river (West ↔ East) — Matrix calibrated ─────
  if (crossesDemeraraRiver(pickupZone, dropoffZone)) {
    const total = roundFare(2000 + distanceKm * 160);
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: `$2,000 base + ${distanceKm}km × $160 = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Both Central — original confirmed formula ──────────
  if (pickupZone === "CENTRAL" && dropoffZone === "CENTRAL") {
    const total = roundFare(Math.max(MINIMUM_FARE, 1050 + (distanceKm - 3) * 100));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown:
        `$1,050 base + ${(distanceKm - 3).toFixed(2)}km × $100 = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── West side internal — Matrix calibrated ────────────
  const bothWest = ["WEST_COAST", "WEST_BANK"].includes(pickupZone) &&
    ["WEST_COAST", "WEST_BANK"].includes(dropoffZone);
  if (bothWest) {
    const total = roundFare(Math.max(2000, distanceKm * 160));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: total === 2000
        ? `Minimum West side fare $2,000`
        : `${distanceKm}km × $160 = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Linden corridor — Matrix calibrated ───────────────
  // Floor at $2,000 so short trips never go below city rates
  if (pickupZone === "LINDEN" || dropoffZone === "LINDEN") {
    const total = roundFare(Math.max(2000, distanceKm * 130));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: total === 2000
        ? `Minimum Linden fare $2,000`
        : `${distanceKm}km × $130 (Linden highway) = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Berbice corridor — Matrix calibrated ──────────────
  // Floor at $2,000 so short trips never go below city rates
  if (pickupZone === "BERBICE" || dropoffZone === "BERBICE") {
    const total = roundFare(Math.max(2000, distanceKm * 180));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: total === 2000
        ? `Minimum Berbice fare $2,000`
        : `${distanceKm}km × $180 (Berbice corridor) = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── East Bank (any distance) — original bracket formula ───
  // Used for CENTRAL ↔ EAST_BANK specifically, where we have strong
  // calibration (Camp→Diamond 14km = $3,500 etc.)
  const touchesEastCoast = pickupZone === "EAST_COAST" || dropoffZone === "EAST_COAST";
  const isEastBankRoute =
    (pickupZone === "EAST_BANK" || dropoffZone === "EAST_BANK") &&
    !touchesEastCoast;
  if (isEastBankRoute) {
    const charge = eastBankBrackets(distanceKm);
    const total = roundFare(Math.max(MINIMUM_FARE, charge));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: `East Bank bracket pricing = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Default: East corridor (CENTRAL ↔ EAST_COAST, any distance) ───
  // Two-bracket smooth curve, no cliffs:
  //   3km base:        $1,050
  //   3km → 7km:       +$220/km (steep town-adjacent rate)
  //   7km+:            +$130/km (flatter highway rate)
  // Monotonic: longer trips always cost more.
  const charge = distanceKm <= 7
    ? 1050 + (distanceKm - 3) * 220
    : 1050 + 4 * 220 + (distanceKm - 7) * 130;
  const total = roundFare(Math.max(MINIMUM_FARE, charge));
  return {
    status: "PRICED",
    total,
    message: null,
    breakdown: distanceKm <= 7
      ? `$1,050 base + ${(distanceKm - 3).toFixed(2)}km × $220 = $${total.toLocaleString()}`
      : `$1,930 (@ 7km) + ${(distanceKm - 7).toFixed(2)}km × $130 = $${total.toLocaleString()}`,
    zones: { pickup: pickupZone, dropoff: dropoffZone },
    distanceKm,
  };
}
