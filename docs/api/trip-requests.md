# Trip Requests API

## Overview

The Trip Requests API allows authenticated riders to create trip requests in the system. A trip request represents a rider's intent to book a ride, which can then be matched with available drivers.

**Use Case**: Riders use this endpoint to request a trip by providing pickup location (required) and optionally a destination. The request expires after 10 minutes if not accepted by a driver.

## Authentication

All requests must include a valid Supabase session token in the Authorization header.

```
Authorization: Bearer <supabase_session_token>
```

The session token is obtained after a rider successfully authenticates with Supabase Auth. The token should be included in all API requests.

## Endpoint Details

- **URL**: `/api/trip-requests`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Headers

```
Authorization: Bearer <supabase_session_token>
Content-Type: application/json
```

## Request Body

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `pickup_latitude` | number | Latitude of pickup location | `6.8013` |
| `pickup_longitude` | number | Longitude of pickup location | `-58.1551` |
| `pickup_address` | string | Human-readable pickup address | `"Georgetown City Mall"` |
| `trip_type` | string | Type of trip. Must be one of: `airport`, `short_drop`, `market`, `other` | `"short_drop"` |

### Optional Fields

| Field | Type | Description | Default | Example |
|-------|------|-------------|---------|---------|
| `destination_latitude` | number | Latitude of destination location | - | `6.8100` |
| `destination_longitude` | number | Longitude of destination location | - | `-58.1600` |
| `destination_address` | string | Human-readable destination address | - | `"Sheriff Street, Georgetown"` |
| `estimated_distance_km` | number | Estimated distance in kilometers | - | `2.5` |
| `estimated_duration_minutes` | integer | Estimated duration in minutes | - | `15` |
| `estimated_fare` | number | Estimated fare amount | - | `800` |
| `notes` | string | Additional notes for the driver | - | `"Please call when you arrive"` |
| `passenger_count` | integer | Number of passengers (minimum 1) | `1` | `2` |

### Important Notes

1. **Destination Fields**: If any destination field (`destination_latitude`, `destination_longitude`, `destination_address`) is provided, all three must be provided together. If none are provided, the trip request will be created without a destination.

2. **Trip Types**:
   - `airport`: Trips to/from the airport
   - `short_drop`: Short distance trips within the city
   - `market`: Trips to/from markets
   - `other`: Any other type of trip

3. **Coordinates**: Latitude and longitude should be in decimal degrees (WGS84 format). For Guyana, latitude ranges approximately from 1.0 to 8.5, and longitude ranges approximately from -61.0 to -56.0.

## Response Formats

### Success Response (201 Created)

Returns the created trip request object.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "rider_id": "660e8400-e29b-41d4-a716-446655440000",
  "pickup_latitude": 6.8013,
  "pickup_longitude": -58.1551,
  "pickup_address": "Georgetown City Mall",
  "pickup_location": "POINT(-58.1551 6.8013)",
  "destination_latitude": 6.8100,
  "destination_longitude": -58.1600,
  "destination_address": "Sheriff Street, Georgetown",
  "destination_location": "POINT(-58.1600 6.8100)",
  "trip_type": "short_drop",
  "estimated_distance_km": 2.5,
  "estimated_duration_minutes": 15,
  "estimated_fare": 800,
  "notes": "Please call when you arrive",
  "passenger_count": 1,
  "status": "requested",
  "expires_at": "2024-01-15T10:20:00.000Z",
  "created_at": "2024-01-15T10:10:00.000Z",
  "updated_at": "2024-01-15T10:10:00.000Z"
}
```

### Error Responses

#### 400 Bad Request

Invalid request data or validation errors.

```json
{
  "error": "Missing required fields: pickup_latitude, pickup_longitude, and pickup_address are required."
}
```

```json
{
  "error": "Invalid trip_type. Must be one of: airport, short_drop, market, other"
}
```

```json
{
  "error": "Destination fields must be provided together: destination_latitude, destination_longitude, and destination_address."
}
```

#### 401 Unauthorized

Missing or invalid authentication token.

```json
{
  "error": "Unauthorized. Please log in."
}
```

```json
{
  "error": "User not found."
}
```

#### 403 Forbidden

User is not a rider or subscription is not active.

```json
{
  "error": "Forbidden. Only riders can create trip requests."
}
```

```json
{
  "error": "Subscription required. Please activate your subscription to create trip requests.",
  "subscription_status": "expired"
}
```

#### 404 Not Found

Rider profile not found.

```json
{
  "error": "Rider profile not found."
}
```

#### 500 Internal Server Error

Server error during request processing.

```json
{
  "error": "Failed to create trip request.",
  "details": "Database error message"
}
```

## Code Examples

### JavaScript/TypeScript

#### Basic Request with Destination

```typescript
async function createTripRequest(
  sessionToken: string,
  pickup: { lat: number; lng: number; address: string },
  destination: { lat: number; lng: number; address: string },
  tripType: 'airport' | 'short_drop' | 'market' | 'other'
) {
  const response = await fetch('/api/trip-requests', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_latitude: pickup.lat,
      pickup_longitude: pickup.lng,
      pickup_address: pickup.address,
      destination_latitude: destination.lat,
      destination_longitude: destination.lng,
      destination_address: destination.address,
      trip_type: tripType,
      passenger_count: 1,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create trip request')
  }

  return await response.json()
}

// Usage
try {
  const tripRequest = await createTripRequest(
    sessionToken,
    {
      lat: 6.8013,
      lng: -58.1551,
      address: 'Georgetown City Mall',
    },
    {
      lat: 6.8100,
      lng: -58.1600,
      address: 'Sheriff Street, Georgetown',
    },
    'short_drop'
  )
  console.log('Trip request created:', tripRequest.id)
} catch (error) {
  console.error('Error:', error.message)
}
```

#### Request Without Destination

```typescript
async function createTripRequestWithoutDestination(
  sessionToken: string,
  pickup: { lat: number; lng: number; address: string },
  tripType: 'airport' | 'short_drop' | 'market' | 'other'
) {
  const response = await fetch('/api/trip-requests', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_latitude: pickup.lat,
      pickup_longitude: pickup.lng,
      pickup_address: pickup.address,
      trip_type: tripType,
      notes: 'Please call when you arrive',
      passenger_count: 2,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create trip request')
  }

  return await response.json()
}
```

#### With Error Handling

```typescript
async function createTripRequestWithErrorHandling(
  sessionToken: string,
  requestData: any
) {
  try {
    const response = await fetch('/api/trip-requests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    })

    const data = await response.json()

    if (!response.ok) {
      switch (response.status) {
        case 400:
          throw new Error(`Validation error: ${data.error}`)
        case 401:
          throw new Error('Please log in again')
        case 403:
          if (data.subscription_status) {
            throw new Error(
              `Subscription required. Current status: ${data.subscription_status}`
            )
          }
          throw new Error('Access denied')
        case 404:
          throw new Error('Rider profile not found')
        case 500:
          throw new Error('Server error. Please try again later.')
        default:
          throw new Error(data.error || 'Unknown error')
      }
    }

    return data
  } catch (error) {
    if (error instanceof TypeError) {
      // Network error
      throw new Error('Network error. Please check your connection.')
    }
    throw error
  }
}
```

### cURL Examples

#### Basic Request

```bash
curl -X POST https://your-domain.com/api/trip-requests \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_latitude": 6.8013,
    "pickup_longitude": -58.1551,
    "pickup_address": "Georgetown City Mall",
    "destination_latitude": 6.8100,
    "destination_longitude": -58.1600,
    "destination_address": "Sheriff Street, Georgetown",
    "trip_type": "short_drop",
    "passenger_count": 1
  }'
```

#### Request Without Destination

```bash
curl -X POST https://your-domain.com/api/trip-requests \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_latitude": 6.8013,
    "pickup_longitude": -58.1551,
    "pickup_address": "Georgetown City Mall",
    "trip_type": "short_drop",
    "notes": "Please call when you arrive"
  }'
```

#### With Estimated Values

```bash
curl -X POST https://your-domain.com/api/trip-requests \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_latitude": 6.8013,
    "pickup_longitude": -58.1551,
    "pickup_address": "Georgetown City Mall",
    "destination_latitude": 6.8100,
    "destination_longitude": -58.1600,
    "destination_address": "Sheriff Street, Georgetown",
    "trip_type": "airport",
    "estimated_distance_km": 25.5,
    "estimated_duration_minutes": 30,
    "estimated_fare": 2500,
    "passenger_count": 2,
    "notes": "Have luggage"
  }'
```

## Common Scenarios

### Scenario 1: Creating a Request with Destination

This is the most common scenario where a rider knows both pickup and destination locations.

```typescript
const tripRequest = await createTripRequest(
  sessionToken,
  {
    lat: 6.8013,
    lng: -58.1551,
    address: 'Georgetown City Mall',
  },
  {
    lat: 6.8100,
    lng: -58.1600,
    address: 'Sheriff Street, Georgetown',
  },
  'short_drop'
)
```

### Scenario 2: Creating a Request Without Destination

Use this when a rider wants to be picked up but will provide the destination later, or for "drive around" type trips.

```typescript
const tripRequest = await createTripRequestWithoutDestination(
  sessionToken,
  {
    lat: 6.8013,
    lng: -58.1551,
    address: 'Georgetown City Mall',
  },
  'other'
)
```

### Scenario 3: Airport Trip

For trips to or from the airport, use the `airport` trip type.

```typescript
const airportTrip = await createTripRequest(
  sessionToken,
  {
    lat: 6.8013,
    lng: -58.1551,
    address: 'Cheddi Jagan International Airport',
  },
  {
    lat: 6.8100,
    lng: -58.1600,
    address: 'Georgetown City Center',
  },
  'airport'
)
```

### Scenario 4: Market Trip

For trips to or from markets.

```typescript
const marketTrip = await createTripRequest(
  sessionToken,
  {
    lat: 6.8013,
    lng: -58.1551,
    address: 'Bourda Market',
  },
  {
    lat: 6.8100,
    lng: -58.1600,
    address: 'Home Address',
  },
  'market'
)
```

## Error Handling

### Handling Authentication Errors

If you receive a 401 error, the session token may have expired. You should:

1. Prompt the user to log in again
2. Obtain a new session token
3. Retry the request

```typescript
if (response.status === 401) {
  // Redirect to login or refresh token
  await refreshSession()
  // Retry request
}
```

### Handling Subscription Errors

If you receive a 403 error with `subscription_status`, the rider's subscription is not active. You should:

1. Display a message to the user
2. Redirect them to the subscription/payment page
3. Do not retry the request automatically

```typescript
if (response.status === 403 && data.subscription_status) {
  // Show subscription required message
  showSubscriptionRequiredModal(data.subscription_status)
  // Redirect to payment page
  navigateToPaymentPage()
}
```

### Handling Validation Errors

For 400 errors, display the validation message to the user and allow them to correct the input.

```typescript
if (response.status === 400) {
  const error = await response.json()
  // Display error message in UI
  showError(error.error)
  // Highlight invalid fields
}
```

## Rate Limiting

Currently, there are no explicit rate limits on this endpoint. However, best practices suggest:

- Implement client-side throttling to prevent rapid successive requests
- Wait for a response before allowing the user to create another request
- Consider implementing exponential backoff for retries

## Best Practices for Mobile App Integration

### 1. Validate Input Before Sending

Validate coordinates and addresses on the client side before making the API call:

```typescript
function validateCoordinates(lat: number, lng: number): boolean {
  // Guyana coordinates range
  return lat >= 1.0 && lat <= 8.5 && lng >= -61.0 && lng <= -56.0
}

function validateAddress(address: string): boolean {
  return address.trim().length >= 5 && address.trim().length <= 200
}
```

### 2. Handle Network Errors

Implement proper network error handling and retry logic:

```typescript
async function createTripRequestWithRetry(
  sessionToken: string,
  data: any,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await createTripRequest(sessionToken, data)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

### 3. Show Loading States

Display loading indicators while the request is being processed:

```typescript
const [loading, setLoading] = useState(false)

async function handleCreateRequest() {
  setLoading(true)
  try {
    const request = await createTripRequest(sessionToken, data)
    // Handle success
  } catch (error) {
    // Handle error
  } finally {
    setLoading(false)
  }
}
```

### 4. Cache Session Token

Store the session token securely and refresh it when needed:

```typescript
// Store token securely (e.g., using secure storage)
await SecureStore.setItemAsync('session_token', sessionToken)

// Retrieve when needed
const token = await SecureStore.getItemAsync('session_token')
```

### 5. Handle Request Expiration

Trip requests expire after 10 minutes. Your app should:

- Display the expiration time to the user
- Poll for request status updates
- Handle expired requests gracefully

```typescript
function checkRequestExpiration(expiresAt: string) {
  const expirationTime = new Date(expiresAt).getTime()
  const now = Date.now()
  const timeUntilExpiration = expirationTime - now

  if (timeUntilExpiration <= 0) {
    return 'expired'
  }

  return timeUntilExpiration // milliseconds until expiration
}
```

### 6. Optimize Request Payload

Only send fields that are actually needed:

```typescript
const requestData: any = {
  pickup_latitude: pickup.lat,
  pickup_longitude: pickup.lng,
  pickup_address: pickup.address,
  trip_type: tripType,
}

// Only add destination if provided
if (destination) {
  requestData.destination_latitude = destination.lat
  requestData.destination_longitude = destination.lng
  requestData.destination_address = destination.address
}

// Only add optional fields if they have values
if (estimatedDistance) {
  requestData.estimated_distance_km = estimatedDistance
}
```

### 7. Implement Request Cancellation

Allow users to cancel a request if needed (implement a separate cancel endpoint):

```typescript
// After creating a request, store the ID
const tripRequest = await createTripRequest(sessionToken, data)
storeRequestId(tripRequest.id)

// Later, allow cancellation
async function cancelRequest(requestId: string) {
  // Call cancel endpoint
  await fetch(`/api/trip-requests/${requestId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  })
}
```

## Additional Notes

- Trip requests automatically expire 10 minutes after creation if not accepted by a driver
- The `status` field will be set to `'requested'` initially
- PostGIS geography points are automatically created from the provided coordinates
- All timestamps are in ISO 8601 format (UTC)
- The `passenger_count` defaults to 1 if not provided

## Support

For issues or questions regarding this API, please contact the development team or refer to the main API documentation.

