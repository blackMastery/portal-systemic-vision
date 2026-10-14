# Rider trip location recording API

## Overview

The rider app records the rider's own phone location for every trip, from the driver accepting until the trip ends. It is safety evidence for admins only: drivers cannot see it, and the public panic tracking page shows only a short, clipped part of it (see [Panic integration](#panic-integration)).

- **Rate:** about one fix every 10 s before pickup and one every 60 s after pickup. During an SOS alert the phone streams to `POST /api/panic/{id}/locations` instead, and the trip trail gets at most one point per minute.
- **Not recorded:** proxy rides (`trips.rider_is_passenger = false`, "Someone else" at booking), riders who have not seen the one-time disclosure, and riders who deny location permission (the trip then shows `none` coverage).
- **Storage:** the `trip_rider_locations` table. It has RLS with no client policies, so it is readable only through the audited admin endpoint below.
- **Retention:** kept forever. Raw for 30 days; after that the nightly pg_cron job `downsample_trip_rider_locations()` keeps about one point per minute (plus the first and last point of the trip). Trips with an incident or a panic alert are never downsampled.

## `POST /api/trips/{id}/rider-locations`

Bearer auth (rider). The caller must be the rider on the trip, otherwise `404 TRIP_NOT_FOUND`.

```json
{ "points": [ { "latitude": 6.8013, "longitude": -58.1551, "accuracy_meters": 8.5, "speed_mps": 1.2, "heading": 270, "recorded_at": "2026-10-14T12:00:05.000Z" } ] }
```

- 1–100 points per call, same point shape as the panic endpoint.
- `recorded_at` outside the trip window (allowing 5 min of phone clock skew in the past and 2 min in the future) is replaced with server time.
- Points before `accepted_at` or after the trip ended are **dropped**, so the trail never shows where the rider went afterwards.
- `phase` (`pre_pickup` | `in_trip`) is set by the server from `trips.picked_up_at`.
- Points are accepted while the trip is `accepted | arrived | picked_up`, and for **15 minutes** after it completes or is cancelled (late uploads from a phone that was offline). Late points trigger a coverage recompute.

Responses:

- `200 { accepted, recording: true }`: keep recording.
- `200 { accepted, recording: false }`: stop recording (trip over). `accepted: 0` with `recording: false` means the late-upload window has closed; discard what is left.
- `200 { accepted: 0, recording: false, reason: "not_passenger" }`: proxy ride.

## `GET /api/admin/trips/{id}/rider-trail`

Admin session (cookie). **Writes a `rider_location_access_log` row before reading.** If that write fails, no trail is returned.

```json
{
  "trip_id": "…", "trip_status": "completed", "rider_is_passenger": true,
  "coverage": "partial",
  "accepted_at": "…", "picked_up_at": "…", "ended_at": "…",
  "points": [ { "lat": 6.80, "lng": -58.15, "recorded_at": "…", "accuracy_meters": 8, "speed_kmh": 4.3, "heading": 270, "phase": "pre_pickup" } ],
  "gaps": [ { "from": "…", "to": "…", "minutes": 7, "phase": "in_trip" } ],
  "truncated": false
}
```

A gap is a stretch with no fix longer than 3 min before pickup or 5 min after pickup (the same thresholds the database uses for coverage). It includes the stretch from accept to the first fix and from the last fix to the end. At most 5,000 points are returned (`truncated`).

The admin trip page loads this only when the **Rider trail** tab is opened, so only deliberate views are logged.

## Coverage (`trips.rider_location_coverage`)

Set by `compute_rider_location_coverage()` when a trip becomes completed or cancelled, and again after late uploads.

| Value | Meaning |
|---|---|
| `full` | ≥ 90% of accepted → ended covered |
| `partial` | ≥ 20% covered |
| `none` | less, or no points at all |
| `not_applicable` | proxy ride |

The trips list filter "Flagged" shows `partial` and `none`.

## Panic integration

When a rider presses SOS, the public tracking link also shows the rider's trip trail for **up to 15 minutes before the press, never earlier than pickup**, so the pickup point (often the rider's home) is not exposed. Presses before pickup show no pre-press segment. Proxy rides show no phone trail at all.
