import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '@/lib/errors'
import { validate, tripRequestSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'

// Create a Supabase client with Bearer token authentication
function createSupabaseClientWithToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Extract Bearer token from Authorization header
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

export async function POST(request: NextRequest) {
  try {
    // 1. Extract and validate Bearer token
    const accessToken = extractBearerToken(request)

    if (!accessToken) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Missing or invalid Authorization header. Expected: Bearer <token>')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 2. Create Supabase client with token
    const supabase = createSupabaseClientWithToken(accessToken)

    // 3. Verify token and get user session
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      logger.warn('Invalid or expired token', { error: authError })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Invalid or expired token.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 4. Verify user exists in database and get user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (userError || !user) {
      logger.warn('User not found', { authId: authUser.id, error: userError })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('User not found.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 5. Get rider profile and validate subscription
    const { data: riderProfile, error: riderError } = await supabase
      .from('rider_profiles')
      .select('id, subscription_status')
      .eq('user_id', user.id)
      .single()

    if (riderError || !riderProfile) {
      logger.warn('Rider profile not found', { userId: user.id, error: riderError })
      const { response, statusCode } = handleApiError(
        new NotFoundError('Rider profile not found.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 6. Validate subscription status
    if (
      riderProfile.subscription_status !== 'active' &&
      riderProfile.subscription_status !== 'trial'
    ) {
      logger.warn('Subscription required', {
        userId: user.id,
        subscriptionStatus: riderProfile.subscription_status,
      })
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Subscription required. Please activate your subscription to create trip requests.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 7. Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.error('Failed to parse request body', error)
      const { response, statusCode } = handleApiError(
        new Error('Invalid JSON in request body.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 8. Validate request body with Zod schema
    const validatedBody = validate(tripRequestSchema, body)

    // 9. Prepare data for insertion
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10) // 10 minutes from now

    const insertData: Record<string, unknown> = {
      rider_id: riderProfile.id,
      pickup_latitude: validatedBody.pickup_latitude,
      pickup_longitude: validatedBody.pickup_longitude,
      pickup_address: validatedBody.pickup_address.trim(),
      pickup_location: `POINT(${validatedBody.pickup_longitude} ${validatedBody.pickup_latitude})`,
      trip_type: validatedBody.trip_type,
      status: 'requested',
      expires_at: expiresAt.toISOString(),
      passenger_count: validatedBody.passenger_count || 1,
    }

    // Add destination address (always required)
    insertData.destination_address = validatedBody.destination_address.trim()

    // Add destination coordinates and location point if provided
    if (
      validatedBody.destination_latitude !== undefined &&
      validatedBody.destination_longitude !== undefined
    ) {
      insertData.destination_latitude = validatedBody.destination_latitude
      insertData.destination_longitude = validatedBody.destination_longitude
      insertData.destination_location = `POINT(${validatedBody.destination_longitude} ${validatedBody.destination_latitude})`
    }

    // Add optional fields
    if (validatedBody.estimated_distance_km !== undefined) {
      insertData.estimated_distance_km = validatedBody.estimated_distance_km
    }

    if (validatedBody.estimated_duration_minutes !== undefined) {
      insertData.estimated_duration_minutes = validatedBody.estimated_duration_minutes
    }

    if (validatedBody.estimated_fare !== undefined) {
      insertData.estimated_fare = validatedBody.estimated_fare
    }

    if (validatedBody.notes !== undefined) {
      insertData.notes = validatedBody.notes.trim()
    }

    // 10. Insert trip request
    const { data: tripRequest, error: insertError } = await supabase
      .from('trip_requests')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      logger.error('Error inserting trip request', insertError, { riderId: riderProfile.id })
      const { response, statusCode } = handleApiError(insertError)
      return NextResponse.json(response, { status: statusCode })
    }

    // 11. Return success response
    logger.info('Trip request created successfully', { tripRequestId: tripRequest.id, riderId: riderProfile.id })
    return NextResponse.json(tripRequest, { status: 201 })
  } catch (error) {
    logger.error('Unexpected error creating trip request', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}

