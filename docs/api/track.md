# Live Tracking API

## Overview

`/track/<token>` is the public page linked from every panic SMS. It shows the car's live position (from `location_history`, written by the driver app during the trip), a fixed marker where the rider pressed the button, the driver's name, vehicle and plate, and a tap-to-call support number. No login is required; the 192-bit token in the URL is the only credential.

The page polls `GET /api/track/<token>` every 5 seconds while the alert is live and every 30 seconds afterwards. Reads happen server-side with the service role — the browser never talks to Supabase directly for this page.

## Link lifetime

| State | Meaning |
|-------|---------|
| `live` | Alert is active and the trip is in progress. Positions keep updating. |
| `grace` | Alert was resolved, or the trip completed/cancelled. Last known positions stay visible for **1 hour**. |
| `expired` | Grace ended, or 6 hours passed since the press (`panic_alerts.expires_at`). The page shows "expired". |

## `GET /api/track/<token>`

`Cache-Control: no-store`.

- `404 { code: "NOT_FOUND" }` — malformed or unknown token.
- `410 { state: "expired", expires_at }` — link no longer valid.
- `200`:

```json
{
  "state": "live",
  "grace_ends_at": null,
  "alert": {
    "status": "active", "created_at": "…", "resolved_at": null, "role": "rider",
    "presser_first_name": "Jane",
    "press_location": { "lat": 6.8013, "lng": -58.1551 }
  },
  "trip_status": "picked_up",
  "driver": { "name": "John Smith", "vehicle": { "make": "Toyota", "model": "Allion", "color": "White", "plate": "PLL 1234" } },
  "support_phone_display": "+592 764 1700",
  "positions": [ { "lat": 6.80, "lng": -58.15, "recorded_at": "…", "speed_kmh": 32, "heading": 180 } ],
  "last_position": { "lat": 6.80, "lng": -58.15, "recorded_at": "…", "speed_kmh": 32, "heading": 180 },
  "generated_at": "…"
}
```

Deliberately excluded: phone numbers, full names, addresses, trip id, incident id, admin links.

`positions.recorded_at` is written by the driver app as Guyana wall time with a trailing `Z`; use `parseLocationHistoryRecordedAt` (`lib/guyana-time.ts`) when computing "updated X ago".
