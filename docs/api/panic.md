# Panic (SOS) API

## Overview

The panic endpoints power the red SOS button that riders and drivers see on every screen during an active trip. A 3-second press-and-hold in the app calls `POST /api/panic`, which:

1. Creates an `incidents` row (`category = safety_concern`, `status = escalated`, `is_panic = true`) and a linked `panic_alerts` row atomically via the `create_panic_alert` RPC.
2. Sends an SMS via Twilio to Links support (both numbers) and, for riders, to the stored emergency contact.
3. Returns a public live-tracking link (`/track/<token>`) that the SMS also contains.

The admin portal shows a realtime banner for every active alert (see `components/admin/panic-alert-banner.tsx`).

**Recipient rules**

| Presser | Support numbers | Personal emergency contact |
|---------|-----------------|----------------------------|
| Rider   | yes             | yes, if `rider_profiles.emergency_contact_phone` is set and valid |
| Driver  | yes             | no |

Support receives both parties' phone numbers, trip id and an admin link. The personal contact receives the presser's name, the driver's name, vehicle and plate, the tracking link and the support number — never a phone number of the counterpart.

## Authentication

```
Authorization: Bearer <supabase access token>
Content-Type: application/json
```

`GET /api/panic/config` and `GET /api/track/<token>` are public.

## Configuration

| Source | Key | Value |
|--------|-----|-------|
| `system_config` | `panic_button_enabled` | `{"enabled": true}` — kill switch. Apps hide the button; `POST /api/panic` answers `403 PANIC_DISABLED`. |
| `system_config` | `panic_support_numbers` | `{"numbers": ["+5927641700", "+5926943827"], "display": "+592 764 1700"}` |
| `system_config` | `panic_test_mode` | `{"enabled": false, "test_number": null}` — route every SMS to `test_number`. |
| env | `PANIC_SUPPORT_NUMBERS` | Comma-separated fallback when the `system_config` row is missing. |
| env | `PANIC_TEST_MODE`, `PANIC_TEST_NUMBER` | Env equivalents of `panic_test_mode`. |
| env | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Twilio credentials. |
| env | `NEXT_PUBLIC_APP_URL` | Base for tracking and admin links in the SMS. |

All of these are editable in **Admin → Settings → Panic button**.

## `POST /api/panic`

Fire the button for the caller's active trip.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `trip_id` | uuid | yes | Must be a trip the caller is on, with status `accepted`, `arrived` or `picked_up`. |
| `idempotency_key` | uuid | yes | Generated once per press by the app and reused for every retry. |
| `latitude`, `longitude` | number | no | Press-time GPS fix. |
| `accuracy_meters` | number | no | |
| `pressed_at` | ISO-8601 | no | Informational (offline replays). |
| `role` | `rider` \| `driver` | no | Must match the signed-in user when given. |

### Responses

`201` when a new alert was created, `200` when the same `idempotency_key` was seen before (`outcome: "idempotent"`) or an active alert already exists on this trip for this user (`outcome: "already_active"`). The body is the same in all three cases:

```json
{
  "alert": {
    "id": "…", "trip_id": "…", "incident_id": "…",
    "status": "active", "role": "rider",
    "created_at": "…", "expires_at": "…", "resolved_at": null,
    "tracking_url": "https://portal…/track/<token>", "test_mode": false
  },
  "outcome": "created",
  "sms": {
    "sent": 2, "failed": 0, "skipped": 1,
    "recipients": [
      { "kind": "support", "status": "sent" },
      { "kind": "support", "status": "sent" },
      { "kind": "emergency_contact", "status": "skipped", "error": "no_emergency_contact" }
    ]
  },
  "support_phone": "+592 764 1700"
}
```

No recipient phone numbers are returned. If `sms.sent` is `0` the app offers its native SMS composer fallback.

### Errors

| Status | `code` | Meaning |
|--------|--------|---------|
| 400 | `VALIDATION_ERROR` / `INVALID_BODY` | Bad input. |
| 401 | `MISSING_TOKEN` / `INVALID_TOKEN` / `USER_NOT_FOUND` | Auth. |
| 403 | `PANIC_DISABLED` | Kill switch is off. |
| 403 | `AUTHORIZATION_ERROR` / `ROLE_MISMATCH` | Inactive user, admin, or wrong role. |
| 404 | `TRIP_NOT_FOUND` | Trip missing or caller not a participant. |
| 409 | `TRIP_NOT_ACTIVE` | Trip already completed/cancelled (`trip_status` included). |

Twilio being unconfigured is **not** an error: the alert and incident are still created and `sms.failed` reports it.

## `GET /api/panic?trip_id=<uuid>`

Returns the caller's most recent alert on that trip in the same envelope (or `{ "alert": null }`). Used by the apps to restore the "Alert active" state after a restart.

## `POST /api/panic/{id}/resolve`

"I'm safe / false alarm". Body: `{ "reason": "safe" | "false_alarm" }` (optional).

- Marks the alert `resolved` and the incident `resolved` (`resolved_by` = the reporter).
- Sends a "marked themselves SAFE" SMS to every recipient that received the original alert.
- The tracking link keeps working for 1 hour, then expires.
- `200 { outcome: "resolved" | "already_resolved", alert, sms, support_phone }`; `404 ALERT_NOT_FOUND`; `409 ALERT_EXPIRED`.

The user may press the button again on the same trip afterwards, creating a new alert.

## `GET /api/panic/config` (public)

```json
{ "enabled": true, "hold_ms": 3000, "support_numbers": ["+5927641700", "+5926943827"], "support_phone_display": "+592 764 1700", "test_mode": false }
```

`Cache-Control: no-store`. Apps call it on launch and whenever a trip becomes active, and cache `support_numbers` for the offline fallback.

## Idempotency and concurrency

- `panic_alerts.idempotency_key` is unique; retries return the existing alert.
- A partial unique index allows one `active` alert per `(trip_id, user_id)`.
- The SMS fan-out is claimed with a compare-and-set on `sms_dispatched_at`, so concurrent retries never double-send.
- Alerts expire 6 hours after the press (`expires_at`); `expire_stale_panic_alerts()` is called lazily by the routes.

## curl examples

```bash
TOKEN=… # rider or driver access token
KEY=$(uuidgen | tr A-Z a-z)

curl -s -X POST "$BASE/api/panic" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"trip_id\":\"<trip>\",\"idempotency_key\":\"$KEY\",\"latitude\":6.8013,\"longitude\":-58.1551,\"accuracy_meters\":12}"

curl -s "$BASE/api/panic?trip_id=<trip>" -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE/api/panic/<alert id>/resolve" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"safe"}'
```

Set `PANIC_TEST_MODE=true` and `PANIC_TEST_NUMBER=<your phone>` while testing so nothing reaches the real support numbers.
