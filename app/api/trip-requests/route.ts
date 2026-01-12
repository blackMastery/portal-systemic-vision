import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TripType } from '@/types/database'

interface TripRequestBody {
  pickup_latitude: number
  pickup_longitude: number
  pickup_address: string
  destination_latitude?: number
  destination_longitude?: number
  destination_address?: string
  trip_type: TripType
  estimated_distance_km?: number
  estimated_duration_minutes?: number
  estimated_fare?: number
  notes?: string
  passenger_count?: number
}

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
      return NextResponse.json(
        {
          error: 'Unauthorized. Missing or invalid Authorization header. Expected: Bearer <token>',
        },
        { status: 401 }
      )
    }

    // 2. Create Supabase client with token
    const supabase = createSupabaseClientWithToken(accessToken)

    // 3. Verify token and get user session
    // The token is already in the Authorization header, so getUser() will use it
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or expired token.' },
        { status: 401 }
      )
    }

    // 4. Verify user exists in database and get user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 401 }
      )
    }

    if (user.role !== 'rider') {
      return NextResponse.json(
        { error: 'Forbidden. Only riders can create trip requests.' },
        { status: 403 }
      )
    }

    // 5. Get rider profile and validate subscription
    const { data: riderProfile, error: riderError } = await supabase
      .from('rider_profiles')
      .select('id, subscription_status')
      .eq('user_id', user.id)
      .single()

    if (riderError || !riderProfile) {
      return NextResponse.json(
        { error: 'Rider profile not found.' },
        { status: 404 }
      )
    }

    // 6. Validate subscription status
    if (
      riderProfile.subscription_status !== 'active' &&
      riderProfile.subscription_status !== 'trial'
    ) {
      return NextResponse.json(
        {
          error: 'Subscription required. Please activate your subscription to create trip requests.',
          subscription_status: riderProfile.subscription_status,
        },
        { status: 403 }
      )
    }

    // 7. Parse and validate request body
    let body: TripRequestBody
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 }
      )
    }

    // 8. Validate required fields
    if (
      typeof body.pickup_latitude !== 'number' ||
      typeof body.pickup_longitude !== 'number' ||
      !body.pickup_address ||
      typeof body.pickup_address !== 'string'
    ) {
      return NextResponse.json(
        {
          error: 'Missing required fields: pickup_latitude, pickup_longitude, and pickup_address are required.',
        },
        { status: 400 }
      )
    }

    // Validate trip_type
    const validTripTypes: TripType[] = ['airport', 'short_drop', 'market', 'other']
    if (!body.trip_type || !validTripTypes.includes(body.trip_type)) {
      return NextResponse.json(
        {
          error: `Invalid trip_type. Must be one of: ${validTripTypes.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate destination fields - all or none
    const hasDestinationLat = body.destination_latitude !== undefined
    const hasDestinationLng = body.destination_longitude !== undefined
    const hasDestinationAddress = body.destination_address !== undefined

    if (hasDestinationLat || hasDestinationLng || hasDestinationAddress) {
      if (
        !hasDestinationLat ||
        !hasDestinationLng ||
        !hasDestinationAddress ||
        typeof body.destination_latitude !== 'number' ||
        typeof body.destination_longitude !== 'number' ||
        typeof body.destination_address !== 'string'
      ) {
        return NextResponse.json(
          {
            error:
              'Destination fields must be provided together: destination_latitude, destination_longitude, and destination_address.',
          },
          { status: 400 }
        )
      }
    }

    // Validate optional numeric fields
    if (
      body.estimated_distance_km !== undefined &&
      typeof body.estimated_distance_km !== 'number'
    ) {
      return NextResponse.json(
        { error: 'estimated_distance_km must be a number.' },
        { status: 400 }
      )
    }

    if (
      body.estimated_duration_minutes !== undefined &&
      (typeof body.estimated_duration_minutes !== 'number' ||
        !Number.isInteger(body.estimated_duration_minutes))
    ) {
      return NextResponse.json(
        { error: 'estimated_duration_minutes must be an integer.' },
        { status: 400 }
      )
    }

    if (
      body.estimated_fare !== undefined &&
      typeof body.estimated_fare !== 'number'
    ) {
      return NextResponse.json(
        { error: 'estimated_fare must be a number.' },
        { status: 400 }
      )
    }

    if (
      body.passenger_count !== undefined &&
      (typeof body.passenger_count !== 'number' ||
        !Number.isInteger(body.passenger_count) ||
        body.passenger_count < 1)
    ) {
      return NextResponse.json(
        { error: 'passenger_count must be a positive integer.' },
        { status: 400 }
      )
    }

    // 9. Prepare data for insertion
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10) // 10 minutes from now

    const insertData: any = {
      rider_id: riderProfile.id,
      pickup_latitude: body.pickup_latitude,
      pickup_longitude: body.pickup_longitude,
      pickup_address: body.pickup_address.trim(),
      pickup_location: `POINT(${body.pickup_longitude} ${body.pickup_latitude})`,
      trip_type: body.trip_type,
      status: 'requested',
      expires_at: expiresAt.toISOString(),
      passenger_count: body.passenger_count || 1,
    }

    // Add destination fields if provided
    if (
      body.destination_latitude !== undefined &&
      body.destination_longitude !== undefined &&
      body.destination_address
    ) {
      insertData.destination_latitude = body.destination_latitude
      insertData.destination_longitude = body.destination_longitude
      insertData.destination_address = body.destination_address.trim()
      insertData.destination_location = `POINT(${body.destination_longitude} ${body.destination_latitude})`
    }

    // Add optional fields
    if (body.estimated_distance_km !== undefined) {
      insertData.estimated_distance_km = body.estimated_distance_km
    }

    if (body.estimated_duration_minutes !== undefined) {
      insertData.estimated_duration_minutes = body.estimated_duration_minutes
    }

    if (body.estimated_fare !== undefined) {
      insertData.estimated_fare = body.estimated_fare
    }

    if (body.notes !== undefined) {
      insertData.notes = body.notes.trim()
    }

    // 10. Insert trip request
    const { data: tripRequest, error: insertError } = await supabase
      .from('trip_requests')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting trip request:', insertError)
      return NextResponse.json(
        {
          error: 'Failed to create trip request.',
          details: insertError.message,
        },
        { status: 500 }
      )
    }

    // 11. Return success response
    return NextResponse.json(tripRequest, { status: 201 })
  } catch (error: any) {
    console.error('Unexpected error creating trip request:', error)
    return NextResponse.json(
      {
        error: 'An unexpected error occurred.',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

