# Authentication Login API

## Overview

The Login API endpoint allows users to authenticate and receive access tokens for subsequent API requests. This endpoint is designed for use by mobile applications and other clients that need programmatic access to the system.

**Use Case**: Mobile apps (rider, driver) and external services use this endpoint to authenticate users and obtain session tokens for making authenticated API requests.

## Endpoint Details

- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Headers

```
Content-Type: application/json
```

## Request Body

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `email` | string | User's email address | `"user@example.com"` |
| `password` | string | User's password | `"password123"` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `role` | string | Optional role verification. If provided, the user must have this role. Must be one of: `admin`, `rider`, `driver` | `"rider"` |

## Response Formats

### Success Response (200 OK)

Returns authentication tokens and user information.

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "v1.MQo8Z3JhbW1hci...",
  "expires_in": 3600,
  "expires_at": 1705320000,
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "auth_id": "660e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "phone_number": "+5926XXXXXXX",
    "full_name": "John Doe",
    "role": "rider",
    "profile_photo_url": "https://example.com/photo.jpg"
  }
}
```

### Error Responses

#### 400 Bad Request

Invalid request data.

```json
{
  "error": "Email and password are required."
}
```

```json
{
  "error": "Invalid JSON in request body."
}
```

#### 401 Unauthorized

Invalid credentials.

```json
{
  "error": "Invalid email or password."
}
```

```json
{
  "error": "Authentication failed. No session created."
}
```

#### 403 Forbidden

User does not have the required role (when `role` parameter is provided).

```json
{
  "error": "Access denied. admin role required.",
  "user_role": "rider"
}
```

#### 404 Not Found

User profile not found in database.

```json
{
  "error": "User profile not found."
}
```

#### 500 Internal Server Error

Server error during authentication.

```json
{
  "error": "An unexpected error occurred during login.",
  "details": "Error message"
}
```

## Code Examples

### JavaScript/TypeScript

#### Basic Login

```typescript
async function login(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Login failed')
  }

  const data = await response.json()
  
  // Store tokens securely
  await storeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  })

  return data
}

// Usage
try {
  const loginData = await login('user@example.com', 'password123')
  console.log('Logged in as:', loginData.user.full_name)
  console.log('Role:', loginData.user.role)
} catch (error) {
  console.error('Login error:', error.message)
}
```

#### Login with Role Verification

```typescript
async function loginAsRider(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      role: 'rider', // Verify user is a rider
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    if (response.status === 403) {
      throw new Error(`Access denied. User is a ${error.user_role}, not a rider.`)
    }
    throw new Error(error.error || 'Login failed')
  }

  return await response.json()
}
```

#### Login with Error Handling

```typescript
async function loginWithErrorHandling(
  email: string,
  password: string,
  role?: 'admin' | 'rider' | 'driver'
) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        ...(role && { role }),
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      switch (response.status) {
        case 400:
          throw new Error(`Validation error: ${data.error}`)
        case 401:
          throw new Error('Invalid email or password')
        case 403:
          throw new Error(
            `Access denied. ${role} role required. User is a ${data.user_role}.`
          )
        case 404:
          throw new Error('User profile not found')
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

#### Basic Login

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

#### Login with Role Verification

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "rider@example.com",
    "password": "password123",
    "role": "rider"
  }'
```

#### Login for Admin

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@links.gy",
    "password": "admin123",
    "role": "admin"
  }'
```

## Using the Tokens

After receiving the tokens, you should:

1. **Store tokens securely** (e.g., secure storage, encrypted keychain)
2. **Use the access token** in subsequent API requests:

```typescript
// Include access token in Authorization header
const response = await fetch('/api/trip-requests', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestData),
})
```

3. **Handle token expiration**: The `expires_at` field indicates when the access token expires. You should refresh the token before it expires using the refresh token.

## Token Information

### Access Token

- **Type**: JWT (JSON Web Token)
- **Usage**: Include in `Authorization: Bearer <access_token>` header for authenticated requests
- **Expiration**: Typically 3600 seconds (1 hour)
- **Scope**: Grants access to user's resources based on their role

### Refresh Token

- **Type**: Opaque token
- **Usage**: Use to obtain a new access token when it expires
- **Expiration**: Typically longer-lived (days/weeks)
- **Storage**: Store securely, never expose in client-side code

### Token Expiration

The response includes:
- `expires_in`: Number of seconds until the access token expires
- `expires_at`: Unix timestamp (seconds since epoch) when the token expires

```typescript
function isTokenExpired(expiresAt: number): boolean {
  return Date.now() / 1000 >= expiresAt
}

// Check before making requests
if (isTokenExpired(tokenData.expires_at)) {
  // Refresh the token
  await refreshAccessToken(tokenData.refresh_token)
}
```

## Security Best Practices

### 1. Store Tokens Securely

**Mobile Apps:**
- Use secure storage (iOS Keychain, Android Keystore)
- Never store tokens in plain text
- Use encrypted storage libraries

```typescript
// Example: React Native Secure Store
import * as SecureStore from 'expo-secure-store'

async function storeTokens(tokens: {
  accessToken: string
  refreshToken: string
  expiresAt: number
}) {
  await SecureStore.setItemAsync('access_token', tokens.accessToken)
  await SecureStore.setItemAsync('refresh_token', tokens.refreshToken)
  await SecureStore.setItemAsync('expires_at', tokens.expiresAt.toString())
}
```

### 2. Never Log Tokens

Avoid logging tokens in console, logs, or error messages:

```typescript
// ❌ Bad
console.log('Token:', accessToken)

// ✅ Good
console.log('Token received successfully')
```

### 3. Use HTTPS Only

Always use HTTPS in production. Never send credentials over unencrypted connections.

### 4. Handle Token Refresh

Implement automatic token refresh before expiration:

```typescript
async function getValidAccessToken(): Promise<string> {
  const storedToken = await getStoredAccessToken()
  const expiresAt = await getStoredExpiresAt()

  // Check if token is expired or will expire soon (within 5 minutes)
  const fiveMinutesFromNow = Date.now() / 1000 + 300
  if (!storedToken || expiresAt < fiveMinutesFromNow) {
    const refreshToken = await getStoredRefreshToken()
    const newTokens = await refreshAccessToken(refreshToken)
    await storeTokens(newTokens)
    return newTokens.access_token
  }

  return storedToken
}
```

### 5. Implement Logout

Clear tokens when user logs out:

```typescript
async function logout() {
  // Clear stored tokens
  await SecureStore.deleteItemAsync('access_token')
  await SecureStore.deleteItemAsync('refresh_token')
  await SecureStore.deleteItemAsync('expires_at')
  
  // Optionally call a logout endpoint to invalidate tokens server-side
  // await fetch('/api/auth/logout', { method: 'POST' })
}
```

## Error Handling

### Invalid Credentials

If login fails with 401, the user should be prompted to re-enter their credentials:

```typescript
try {
  await login(email, password)
} catch (error) {
  if (error.message.includes('Invalid email or password')) {
    showError('Invalid email or password. Please try again.')
    clearPasswordField()
  }
}
```

### Role Mismatch

If role verification fails (403), inform the user:

```typescript
try {
  await loginAsRider(email, password)
} catch (error) {
  if (error.message.includes('Access denied')) {
    showError('This account is not authorized for the rider app.')
    redirectToDriverApp() // or show appropriate message
  }
}
```

### Network Errors

Handle network failures gracefully:

```typescript
try {
  await login(email, password)
} catch (error) {
  if (error instanceof TypeError) {
    showError('Network error. Please check your internet connection.')
  } else {
    showError('Login failed. Please try again.')
  }
}
```

## Rate Limiting

Currently, there are no explicit rate limits on this endpoint. However, best practices suggest:

- Implement client-side throttling to prevent brute force attacks
- Show appropriate error messages after failed attempts
- Consider implementing account lockout after multiple failed attempts (server-side)

## Additional Notes

- The endpoint does not set cookies or manage sessions server-side
- Tokens must be managed client-side
- The `role` parameter is optional - if not provided, any authenticated user can login
- User profile information is returned along with tokens for convenience
- All timestamps are Unix timestamps (seconds since epoch)

## Support

For issues or questions regarding this API, please contact the development team or refer to the main API documentation.

