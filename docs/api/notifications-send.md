# Push Notifications API

## Overview

The Push Notifications API allows authenticated users to send Firebase Cloud Messaging (FCM) push notifications in two ways:

1. **Targeted send** — provide a device `fcm_token` and payload via `/api/notifications/send/drivers` or `/api/notifications/send/riders` (correct project per app).
2. **Broadcast** — send the same payload to **all users** of a role who have an `fcm_token` stored, via `POST /api/notifications/broadcast`.

**Important**: This implementation uses **two separate Firebase projects**—one for the driver app and one for the rider app. For targeted sends, choose `/send/drivers` or `/send/riders` based on which app registered the token. For broadcast, set `audience` to `driver` or `rider` so the server uses the matching Firebase project and user list.

**Use cases**: Per-device messages (trip updates, rider→driver or driver→rider), or announcements to every driver or every rider with a registered token.

## Authentication

All requests must include a valid Supabase session token in the Authorization header.

```
Authorization: Bearer <access_token>
```

The access token is obtained from the `/api/auth/login` endpoint after successful authentication. The token should be included in all API requests. The API verifies the session and that the user exists in the `users` table before sending.

## Endpoints

### Send notification (driver Firebase project)

- **URL**: `/api/notifications/send/drivers`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Send notification (rider Firebase project)

- **URL**: `/api/notifications/send/riders`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Broadcast to all drivers or riders (by role)

- **URL**: `/api/notifications/broadcast`
- **Method**: `POST`
- **Content-Type**: `application/json`

Looks up every row in `users` with the given `role` (`driver` or `rider`) and a non-null `fcm_token`, then sends via `sendNotificationsToUsers` in `lib/firebase/notifications.ts` (correct Firebase project, batching, default sound, invalid-token cleanup on `users.fcm_token`).

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

## Request body (targeted: `/send/drivers`, `/send/riders`)

These two endpoints accept the same JSON shape.

### Required fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `fcm_token` | string | Non-empty FCM registration token for the target device (from the client SDK for the matching app). | `"dK3x..."` |
| `title` | string | Notification title (max 100 characters). | `"New trip request"` |
| `body` | string | Notification body (max 500 characters). | `"You have a new trip nearby."` |

### Optional fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `data` | object | Custom data payload (keys and values must be strings—Firebase requirement). Used for deep linking or app logic. | `{"trip_id": "123", "type": "trip_request"}` |
| `notification_type` | string | Category or type label (accepted for compatibility; not required for FCM delivery). | `"trip_request"` |

### Important notes

1. **Endpoint vs token**  
   Use `/drivers` only for tokens issued by the **driver** Firebase project, and `/riders` only for tokens from the **rider** project. Mismatched project and token typically results in send failures.

2. **No server-side role check on the token**  
   The API does not verify that the token belongs to a driver or rider user record. The split between endpoints is which Firebase Admin project sends the message. Callers are responsible for passing the correct token for the intended app.

3. **Direct send**  
   The server does **not** look up `users.fcm_token` by user id. You pass the token in the body.

4. **Invalid tokens**  
   FCM may report invalid or unregistered tokens in the response. For this direct-send path, those tokens are **not** automatically cleared from the `users` table (there is no guaranteed mapping from the request body to a user row). Handle cleanup in your own flows if you store tokens per user.

5. **Data payload**  
   All values in `data` must be strings. They are forwarded to FCM as string key-value pairs.

## Request body (broadcast: `/broadcast`)

### Required fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `audience` | string | Must be `driver` or `rider`. Selects `users.role` and the Firebase project used to send. | `"driver"` |
| `title` | string | Notification title (max 100 characters). | `"Maintenance tonight"` |
| `body` | string | Notification body (max 500 characters). | `"The service will be unavailable 2–4am."` |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | object | String keys and string values only (same as targeted send). |
| `notification_type` | string | Logged server-side with the broadcast; not required for FCM. |

### Authorization

Only users with `users.role === 'admin'` may call `/api/notifications/broadcast`. Others receive **403** with `AUTHORIZATION_ERROR`. The admin web app uses this from **Admin → Notifications** with the signed-in admin session.

### Example

```bash
curl -X POST https://portal-systemic-vision.vercel.app/api/notifications/broadcast \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audience": "rider",
    "title": "App update",
    "body": "Please update to the latest version.",
    "notification_type": "announcement"
  }'
```

If no users match (no tokens), the API returns **200** with `requestedCount: 0` and a message explaining there were no recipients.

## Response formats

### Success response (200 OK)

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "requestedCount": 1,
  "successCount": 1,
  "failureCount": 0,
  "invalidTokensRemoved": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` when the HTTP handler completed without error. |
| `message` | string | Short status message. |
| `requestedCount` | number | For **targeted** sends, always `1`. For **broadcast**, number of users with an FCM token that were included in the send. |
| `successCount` | number | FCM success deliveries in this request (for broadcast, can be up to `requestedCount`). |
| `failureCount` | number | FCM failures for this send. |
| `invalidTokensRemoved` | number | For **targeted** send: count of invalid tokens per FCM (tokens are **not** cleared in DB for that path). For **broadcast**: invalid tokens reported by FCM; matching rows **are** cleared in `users.fcm_token` via `sendNotificationsToUsers`. |

Partial FCM failure (for example bad token) can still return **200** with `successCount: 0` and `failureCount: 1`; check counts for delivery outcome.

### Error responses

#### 400 Bad Request — validation error

```json
{
  "error": "fcm_token is required",
  "code": "VALIDATION_ERROR",
  "statusCode": 400
}
```

Common causes:

- Missing or empty `fcm_token` (targeted sends)
- Missing or invalid `audience` (broadcast)
- Missing or invalid `title` / `body`
- `title` or `body` over max length
- `data` values that are not strings

#### 401 Unauthorized — authentication error

```json
{
  "error": "Invalid or expired token.",
  "code": "AUTHENTICATION_ERROR",
  "statusCode": 401
}
```

Occurs when:

- Authorization header is missing or not `Bearer <token>`
- Expired or invalid access token
- Authenticated user has no matching row in `users`

#### 500 Internal Server Error

```json
{
  "error": "An unexpected error occurred. Please try again later.",
  "code": "INTERNAL_ERROR",
  "statusCode": 500
}
```

Occurs when:

- Firebase Admin / FCM misconfiguration or runtime errors
- Unexpected server errors

## Example requests

### Driver app token

```bash
curl -X POST https://portal-systemic-vision.vercel.app/api/notifications/send/drivers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcm_token": "YOUR_DRIVER_APP_FCM_TOKEN",
    "title": "New trip available",
    "body": "A new trip request is available near your location",
    "data": {
      "trip_id": "123",
      "type": "trip_request"
    },
    "notification_type": "trip_request"
  }'
```

### Rider app token

```bash
curl -X POST https://portal-systemic-vision.vercel.app/api/notifications/send/riders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcm_token": "YOUR_RIDER_APP_FCM_TOKEN",
    "title": "Trip accepted",
    "body": "Your trip request has been accepted by a driver",
    "data": {
      "trip_id": "456",
      "driver_id": "880e8400-e29b-41d4-a716-446655440003"
    },
    "notification_type": "trip_update"
  }'
```

## Firebase setup guide

### Prerequisites

1. **Two Firebase projects** — one for the driver app and one for the rider app  
2. Cloud Messaging enabled in both  
3. Service account credentials with appropriate permissions for both  

### Step 1: Create Firebase projects

1. **Driver app project** — e.g. “YourApp-Driver”  
2. **Rider app project** — e.g. “YourApp-Rider”  

Use [Firebase Console](https://console.firebase.google.com/) to create or select projects.

### Step 2: Enable Cloud Messaging API

For each project:

1. Open Project Settings  
2. Open the **Cloud Messaging** tab  
3. Ensure the API is enabled  
4. Note the Sender ID for the matching mobile app  

### Step 3: Generate service account keys

For each project:

1. Project Settings → **Service accounts**  
2. **Generate new private key**  
3. Store securely, e.g. `driver-service-account-key.json` and `rider-service-account-key.json`  

Do not commit these files.

### Step 4: Configure environment variables

#### Option 1: JSON string (typical for production)

```env
FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"driver-project-id",...}'
FIREBASE_RIDER_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"rider-project-id",...}'
```

#### Option 2: File path

```env
FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH=/path/to/driver-service-account-key.json
FIREBASE_RIDER_SERVICE_ACCOUNT_PATH=/path/to/rider-service-account-key.json
```

Use your host’s secret storage in production (e.g. Vercel env vars).

### Step 5: Verify setup

1. Restart the Next.js server  
2. Admin SDK initializes on first use  
3. `/drivers` and `/riders` each use their own project  
4. Check logs for initialization errors  

### Environment variable reference

| Variable | Description |
|----------|-------------|
| `FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY` | Driver project service account JSON string |
| `FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH` | Path to driver service account JSON |
| `FIREBASE_RIDER_SERVICE_ACCOUNT_KEY` | Rider project service account JSON string |
| `FIREBASE_RIDER_SERVICE_ACCOUNT_PATH` | Path to rider service account JSON |

For each app, set either `_KEY` or `_PATH`, not both.

## Database integration

### FCM token storage

Mobile clients often persist the device token in `users.fcm_token` (see your migrations). This API **does not** read that column for sending; you supply `fcm_token` in the request. Keeping `users.fcm_token` updated is still useful so your backend knows which token to pass into this API.

### Notification history table

Earlier versions inserted rows into `notifications` per `user_id` after a send. The direct token + payload endpoints **do not** insert into `notifications`, because the request does not include a recipient `user_id`. If you need history, record it in your own service using the user id you already resolved when building the request.

### Invalid token cleanup

Sends that resolve users by id and load tokens from the database may still clear bad tokens from `users` in other code paths. **These two endpoints** do not clear `users.fcm_token` based on the send result.

## Best practices

1. **Resolve user, then token** — Look up the correct `fcm_token` (and ensure it matches driver vs rider app) before calling the API.  
2. **Check FCM counts** — Use `successCount` / `failureCount` even when status is 200.  
3. **Quotas** — Respect [FCM quotas](https://firebase.google.com/docs/cloud-messaging) for your Firebase plan.  
4. **Content** — Short titles, clear bodies, string-only `data` for deep links.  
5. **Testing** — Test with real tokens from debug builds; confirm project (driver vs rider) matches the endpoint.

## Troubleshooting

### "Firebase service account credentials not found for driver/rider app"

- Set the correct `FIREBASE_DRIVER_*` or `FIREBASE_RIDER_*` variable.  
- Restart the server after changes.  

### Send returns success but device gets nothing

- Wrong endpoint for the token (driver token on `/riders` or the reverse).  
- Token rotated or app reinstalled—refresh stored token.  
- OS notification permissions disabled.  

### `failureCount: 1` or high `invalidTokensRemoved`

- Token expired, unregistered, or from a different Firebase project.  
- Replace token from the client and update your datastore.  

### "Invalid or expired token" (401)

- Supabase **access** token issue, not FCM: refresh login, correct `Authorization: Bearer ...` header.  

## Security considerations

1. **Authentication** — Valid Supabase session and `users` row required.  
2. **Token targeting** — An authenticated caller can send to any FCM token they supply; restrict who can call this API and audit usage if needed.  
3. **Broadcast** — `/api/notifications/broadcast` is **admin-only** and messages an entire driver or rider cohort; use the admin Notifications page or a trusted server process with an admin token.  
4. **Service accounts** — Never commit keys; use secrets management.  
5. **Rate limiting** — Consider rate limits at the edge or API layer for production.  

## Related documentation

- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)  
- [Firebase Admin SDK setup](https://firebase.google.com/docs/admin/setup)  
- [Supabase Auth](https://supabase.com/docs/guides/auth)  
