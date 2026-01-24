# Push Notifications API

## Overview

The Push Notifications API allows authenticated users to send Firebase Cloud Messaging (FCM) push notifications to drivers or riders. The API provides two separate endpoints to ensure type safety and proper role validation.

**Important**: This implementation supports **two separate Firebase projects** - one for the driver app and one for the rider app. Each endpoint automatically uses the correct Firebase project based on the target audience (drivers or riders).

**Use Case**: Send push notifications to specific drivers or riders for various purposes such as trip updates, promotions, system announcements, etc.

## Authentication

All requests must include a valid Supabase session token in the Authorization header.

```
Authorization: Bearer <access_token>
```

The access token is obtained from the `/api/auth/login` endpoint after successful authentication. The token should be included in all API requests.

## Endpoints

### Send Notifications to Drivers

- **URL**: `/api/notifications/send/drivers`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Send Notifications to Riders

- **URL**: `/api/notifications/send/riders`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

## Request Body

Both endpoints use the same request body structure.

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `user_ids` | array[string] | Array of user UUIDs to send notifications to. Must contain at least one UUID. All UUIDs must belong to users with the correct role (driver or rider). | `["550e8400-e29b-41d4-a716-446655440000"]` |
| `title` | string | Notification title (max 100 characters) | `"New Trip Request"` |
| `body` | string | Notification body/message (max 500 characters) | `"You have a new trip request nearby"` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `data` | object | Custom data payload (key-value pairs, all values must be strings). This data is sent with the notification and can be used by the app for deep linking or custom handling. | `{"trip_id": "123", "type": "trip_request"}` |
| `notification_type` | string | Type/category of notification. Used for tracking and filtering in the app. | `"trip_request"` |

### Important Notes

1. **Role Validation**: 
   - The `/drivers` endpoint validates that ALL provided `user_ids` belong to users with role `driver`
   - The `/riders` endpoint validates that ALL provided `user_ids` belong to users with role `rider`
   - If any user_id doesn't match the expected role, the request will fail with a validation error

2. **FCM Tokens**: 
   - Only users with valid FCM tokens stored in the database will receive notifications
   - Users without FCM tokens are silently skipped (not counted as failures)
   - Invalid or expired FCM tokens are automatically removed from the database

3. **Batching**: 
   - The API automatically batches notifications for large recipient lists (FCM supports up to 500 tokens per batch)
   - All batches are processed in parallel for optimal performance

4. **Data Payload**: 
   - All values in the `data` object must be strings (Firebase requirement)
   - The data payload is sent alongside the notification and can be used for deep linking or custom app logic

## Response Formats

### Success Response (200 OK)

Returns a summary of the notification sending operation.

```json
{
  "success": true,
  "message": "Notifications sent successfully",
  "requestedCount": 5,
  "successCount": 4,
  "failureCount": 1,
  "invalidTokensRemoved": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful requests |
| `message` | string | Success message |
| `requestedCount` | number | Number of user_ids provided in the request |
| `successCount` | number | Number of notifications successfully sent |
| `failureCount` | number | Number of notifications that failed to send |
| `invalidTokensRemoved` | number | Number of invalid FCM tokens that were removed from the database |

### Error Responses

#### 400 Bad Request - Validation Error

```json
{
  "error": "The following user_ids do not belong to drivers: 550e8400-e29b-41d4-a716-446655440000",
  "code": "VALIDATION_ERROR",
  "statusCode": 400
}
```

Common validation errors:
- Missing or invalid `user_ids` array
- Empty `user_ids` array
- Invalid UUID format in `user_ids`
- User IDs that don't belong to the expected role (driver/rider)
- Missing or invalid `title` or `body`
- `title` or `body` exceeds maximum length

#### 401 Unauthorized - Authentication Error

```json
{
  "error": "Invalid or expired token.",
  "code": "AUTHENTICATION_ERROR",
  "statusCode": 401
}
```

Occurs when:
- Missing Authorization header
- Invalid Bearer token format
- Expired or invalid access token
- User not found in database

#### 500 Internal Server Error

```json
{
  "error": "An unexpected error occurred. Please try again later.",
  "code": "INTERNAL_ERROR",
  "statusCode": 500
}
```

Occurs when:
- Firebase service is unavailable
- Database connection issues
- Unexpected server errors

## Example Requests

### Send Notification to Drivers

```bash
curl -X POST https://portal-systemic-vision.vercel.app//api/notifications/send/drivers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": [
      "550e8400-e29b-41d4-a716-446655440000",
      "660e8400-e29b-41d4-a716-446655440001"
    ],
    "title": "New Trip Available",
    "body": "A new trip request is available near your location",
    "data": {
      "trip_id": "123",
      "type": "trip_request"
    },
    "notification_type": "trip_request"
  }'
```

### Send Notification to Riders

```bash
curl -X POST https://portal-systemic-vision.vercel.app//api/notifications/send/riders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": [
      "770e8400-e29b-41d4-a716-446655440002"
    ],
    "title": "Trip Accepted",
    "body": "Your trip request has been accepted by a driver",
    "data": {
      "trip_id": "456",
      "driver_id": "880e8400-e29b-41d4-a716-446655440003"
    },
    "notification_type": "trip_update"
  }'
```

## Firebase Setup Guide

### Prerequisites

1. **Two Firebase projects** - one for the driver app and one for the rider app
2. Cloud Messaging enabled in both projects
3. Service account credentials with appropriate permissions for both projects

### Step 1: Create Firebase Projects

You need to create two separate Firebase projects:

1. **Driver App Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" or select an existing project
   - Name it something like "Links Driver App" or "YourApp-Driver"
   - Follow the setup wizard

2. **Rider App Project**:
   - Create a second project in Firebase Console
   - Name it something like "Links Rider App" or "YourApp-Rider"
   - Follow the setup wizard

### Step 2: Enable Cloud Messaging API

For **each project** (driver and rider):

1. In Firebase Console, select the project
2. Go to Project Settings
3. Navigate to the "Cloud Messaging" tab
4. Ensure Cloud Messaging API is enabled
5. Note your project's Sender ID (you'll need this for the respective mobile apps)

### Step 3: Generate Service Account Keys

For **each project** (driver and rider):

1. In Firebase Console, select the project
2. Go to Project Settings
3. Navigate to the "Service accounts" tab
4. Click "Generate new private key"
5. Save the JSON file securely with a descriptive name:
   - `driver-service-account-key.json` for driver app
   - `rider-service-account-key.json` for rider app

**Important**: These files contain sensitive credentials - keep them secure!

### Step 4: Configure Environment Variables

You have two options for providing service account credentials for each project:

#### Option 1: JSON String (Recommended for Production)

Add both service account JSONs as strings to your `.env.local` file:

```env
# Driver App Firebase Configuration
FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"driver-project-id",...}'

# Rider App Firebase Configuration
FIREBASE_RIDER_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"rider-project-id",...}'
```

**Note**: In production, use your platform's secure environment variable storage (e.g., Vercel Environment Variables, AWS Secrets Manager, etc.)

#### Option 2: File Path (Alternative)

If you prefer to use file paths:

```env
# Driver App Firebase Configuration
FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH=/path/to/driver-service-account-key.json

# Rider App Firebase Configuration
FIREBASE_RIDER_SERVICE_ACCOUNT_PATH=/path/to/rider-service-account-key.json
```

**Security Notes**:
- Never commit service account keys to version control
- Always use environment variables or secure secret management
- Store files outside your project directory if using file paths
- Use absolute paths for better security

### Step 5: Verify Setup

After configuring the environment variables:

1. Restart your Next.js server
2. The Firebase Admin SDK will initialize automatically on first use
3. Each endpoint (`/drivers` and `/riders`) will use its respective Firebase project
4. Check server logs to confirm both projects initialized successfully

### Environment Variable Reference

| Variable | Description | Required For |
|----------|-------------|-------------|
| `FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY` | JSON string of driver app service account | Driver notifications |
| `FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH` | File path to driver app service account | Driver notifications (alternative) |
| `FIREBASE_RIDER_SERVICE_ACCOUNT_KEY` | JSON string of rider app service account | Rider notifications |
| `FIREBASE_RIDER_SERVICE_ACCOUNT_PATH` | File path to rider app service account | Rider notifications (alternative) |

**Note**: For each project (driver/rider), you only need to set either the `_KEY` or `_PATH` variable, not both.

## Database Integration

### FCM Token Storage

FCM tokens are stored in the `users.fcm_token` column. The migration file `004_add_fcm_token_to_users.sql` adds this column if it doesn't exist.

### Notification Records

When notifications are successfully sent, records are automatically created in the `notifications` table with:
- `user_id`: The recipient user ID
- `title`: Notification title
- `body`: Notification body
- `notification_type`: Type of notification (if provided)
- `push_sent`: `true`
- `push_sent_at`: Timestamp of when notification was sent

These records can be used for:
- Notification history in the app
- Tracking notification delivery
- User notification preferences

### Invalid Token Cleanup

The API automatically removes invalid or expired FCM tokens from the database when detected. This ensures:
- Clean database state
- Better performance (no attempts to send to invalid tokens)
- Accurate token counts

## Best Practices

### 1. Batch Notifications

When sending to many users, consider batching requests to avoid overwhelming the API. The API handles internal batching for FCM, but you may want to batch your API calls as well.

### 2. Error Handling

Always check the `successCount` and `failureCount` in the response. A partial success (some notifications sent, some failed) is still considered a successful API call (200 status).

### 3. Rate Limiting

Be mindful of rate limits:
- Firebase Cloud Messaging has quotas based on your plan
- Consider implementing client-side rate limiting for high-volume scenarios
- Monitor your Firebase usage in the Firebase Console

### 4. Notification Content

- Keep titles concise and actionable
- Use clear, descriptive body text
- Include relevant data in the `data` payload for deep linking
- Use `notification_type` for categorizing notifications

### 5. Testing

Before sending to production users:
- Test with a small group first
- Verify FCM tokens are properly stored
- Check notification delivery in Firebase Console
- Monitor error logs for issues

## Troubleshooting

### "Firebase service account credentials not found for driver/rider app"

**Solution**: 
- For driver notifications: Ensure `FIREBASE_DRIVER_SERVICE_ACCOUNT_KEY` or `FIREBASE_DRIVER_SERVICE_ACCOUNT_PATH` is set
- For rider notifications: Ensure `FIREBASE_RIDER_SERVICE_ACCOUNT_KEY` or `FIREBASE_RIDER_SERVICE_ACCOUNT_PATH` is set
- Verify the environment variable names match exactly (case-sensitive)
- Restart your server after adding environment variables

### "No users with FCM tokens found"

**Solution**: 
- Verify users have FCM tokens stored in the `users.fcm_token` column
- Ensure mobile apps are properly registering FCM tokens
- Check that tokens are being saved to the database

### "Invalid or expired token" errors

**Solution**:
- Verify your access token is valid and not expired
- Check that the token was obtained from `/api/auth/login`
- Ensure the Authorization header format is correct: `Bearer <token>`

### Notifications not received

**Possible causes**:
1. User's FCM token is invalid or expired (check `invalidTokensRemoved` in response)
2. User has disabled notifications on their device
3. App is not properly configured to receive FCM notifications
4. Firebase project configuration issues

**Debugging steps**:
- Check Firebase Console for delivery statistics
- Verify FCM token is valid using Firebase Admin SDK
- Test with Firebase Console's test notification feature
- Check mobile app logs for FCM errors

## Security Considerations

1. **Authentication**: All endpoints require valid authentication tokens
2. **Role Validation**: Each endpoint validates that user_ids belong to the correct role
3. **Token Security**: Service account keys should never be committed to version control
4. **Rate Limiting**: Consider implementing rate limiting for production use
5. **Audit Logging**: All notification attempts are logged for audit purposes

## Related Documentation

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Supabase Authentication Documentation](https://supabase.com/docs/guides/auth)





