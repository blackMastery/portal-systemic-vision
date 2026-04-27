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
  if (Math.abs(lat - 6.4986) < 0.05 && Math.abs(lng + 58.2541) < 0.05) return "AIRPORT";
  if (lng > -57.9) return "BERBICE";
  if (lng < -58.45 && lat > 6.9) return "ESSEQUIBO";
  if (lat < 5.5) return "INTERIOR";
  if (lat < 6.55) return "LINDEN";
  if (lat >= 6.795 && lat <= 6.828 && lng >= -58.17 && lng <= -58.13) return "CENTRAL";
  if (lng < -58.185) return lat >= 6.78 ? "WEST_COAST" : "WEST_BANK";
  if (lat < 6.795) return "EAST_BANK";
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
  if (pickupZone === "LINDEN" || dropoffZone === "LINDEN") {
    const total = roundFare(distanceKm * 130);
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: `${distanceKm}km × $130 (Linden highway) = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Berbice corridor — Matrix calibrated ──────────────
  if (pickupZone === "BERBICE" || dropoffZone === "BERBICE") {
    const total = roundFare(distanceKm * 180);
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: `${distanceKm}km × $180 (Berbice corridor) = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── Long East Coast (15km+) — rural highway rate ──────
  const touchesEastCoast = pickupZone === "EAST_COAST" || dropoffZone === "EAST_COAST";
  if (touchesEastCoast && distanceKm >= 15) {
    const total = roundFare(Math.max(2000, distanceKm * 160));
    return {
      status: "PRICED",
      total,
      message: null,
      breakdown: `Long East Coast: ${distanceKm}km × $160 = $${total.toLocaleString()}`,
      zones: { pickup: pickupZone, dropoff: dropoffZone },
      distanceKm,
    };
  }

  // ── East Bank (any distance) — original bracket formula ───
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

  // ── Default: East corridor (Central ↔ East Coast short) ───
  const total = roundFare(Math.max(MINIMUM_FARE, 1050 + (distanceKm - 3) * 220));
  return {
    status: "PRICED",
    total,
    message: null,
    breakdown:
      `$1,050 base + ${(distanceKm - 3).toFixed(2)}km × $220 = $${total.toLocaleString()}`,
    zones: { pickup: pickupZone, dropoff: dropoffZone },
    distanceKm,
  };
}
