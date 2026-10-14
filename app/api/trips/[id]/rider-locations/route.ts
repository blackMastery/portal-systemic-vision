import { NextRequest, NextResponse } from 'next/server'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { validate, tripRiderLocationsSchema } from '@/lib/validation'
import { assertUserIsTripParticipant } from '@/lib/incidents/verify-trip-participant'
import { isActiveTripStatus } from '@/lib/panic/tracking'
import { MAX_FUTURE_SKEW_MS, MAX_PAST_SKEW_MS, stampRecordedAt } from '@/lib/location-points'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

type PointInsert = Database['public']['Tables']['trip_rider_locations']['Insert']

/** Late uploads (phone was offline) are accepted this long after the trip ends. */
const LATE_UPLOAD_WINDOW_MS = 15 * 60 * 1000

/**
 * POST /api/trips/[id]/rider-locations — the rider app records its own GPS
 * for the whole trip (safety evidence, admin-only). `recording: false` in
 * the response tells the app to stop: trip over, or a proxy ride.
 *
 * Points recorded before the trip was accepted or after it ended are
 * dropped, so the trail never includes where the rider went afterwards.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resolved = await resolveUserFromBearerRequest(request)
    if (!resolved.ok) {
      const msg =
        resolved.error === 'missing_token'
          ? 'Missing or invalid Authorization header. Expected: Bearer <token>'
          : resolved.error === 'invalid_token'
            ? 'Invalid or expired token.'
            : 'User not found.'
      const { response, statusCode } = handleApiError(
        new AuthenticationError(msg, resolved.error.toUpperCase())
      )
      return NextResponse.json(response, { status: statusCode })
    }
    const { user } = resolved
    if (user.role !== 'rider') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Only riders record trip location.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const tripId = params.id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
      const { response, statusCode } = handleApiError(new ValidationError('Invalid trip id.'))
      return NextResponse.json(response, { status: statusCode })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid JSON in request body.', 'INVALID_BODY')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    const input = validate(tripRiderLocationsSchema, body)

    const service = createServiceRoleClient()
    const participant = await assertUserIsTripParticipant(service, tripId, user.id, 'rider')
    if (!participant) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('Trip not found or you are not the rider on this trip.', 'TRIP_NOT_FOUND')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { data: trip, error: tripErr } = await service
      .from('trips')
      .select('id, status, rider_is_passenger, accepted_at, picked_up_at, completed_at, cancelled_at')
      .eq('id', tripId)
      .maybeSingle()
    if (tripErr || !trip) {
      const { response, statusCode } = handleApiError(
        tripErr ?? new NotFoundError('Trip not found.', 'TRIP_NOT_FOUND')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!trip.rider_is_passenger) {
      return NextResponse.json({ accepted: 0, recording: false, reason: 'not_passenger' })
    }

    const now = Date.now()
    const active = isActiveTripStatus(trip.status)
    const endedAtIso = trip.completed_at ?? trip.cancelled_at
    const endedAt = endedAtIso ? new Date(endedAtIso).getTime() : null
    const inLateWindow = !active && endedAt != null && now - endedAt <= LATE_UPLOAD_WINDOW_MS
    if (!active && !inLateWindow) {
      return NextResponse.json({ accepted: 0, recording: false, reason: 'trip_not_active' })
    }

    const acceptedAt = trip.accepted_at ? new Date(trip.accepted_at).getTime() : null
    const pickedUpAt = trip.picked_up_at ? new Date(trip.picked_up_at).getTime() : null
    const serverStamp = new Date(now).toISOString()
    const earliest = (acceptedAt ?? now) - MAX_PAST_SKEW_MS
    const latest = now + MAX_FUTURE_SKEW_MS

    let restamped = 0
    let dropped = 0
    const rows: PointInsert[] = []
    for (const p of input.points) {
      const stamp = stampRecordedAt(p.recorded_at, earliest, latest, serverStamp)
      if (stamp.restamped) restamped++
      const t = new Date(stamp.iso).getTime()
      // Strictly inside the trip: nothing before accept, nothing after the end.
      if ((acceptedAt != null && t < acceptedAt) || (endedAt != null && t > endedAt)) {
        dropped++
        continue
      }
      rows.push({
        trip_id: trip.id,
        user_id: user.id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracy_meters ?? null,
        speed_mps: p.speed_mps ?? null,
        heading: p.heading ?? null,
        recorded_at: stamp.iso,
        phase: pickedUpAt != null && t >= pickedUpAt ? 'in_trip' : 'pre_pickup',
      })
    }

    if (rows.length > 0) {
      const { error: insErr } = await service.from('trip_rider_locations').insert(rows)
      if (insErr) {
        logger.error('trip rider location insert failed', { tripId, userId: user.id, error: insErr })
        const { response, statusCode } = handleApiError(insErr)
        return NextResponse.json(response, { status: statusCode })
      }
    }

    // Late points after the trip ended change its coverage; recompute.
    if (!active && rows.length > 0) {
      const { error: covErr } = await service.rpc('compute_rider_location_coverage', { p_trip_id: trip.id })
      if (covErr) logger.warn('rider location coverage recompute failed', { tripId, error: covErr })
    }

    if (restamped > 0 || dropped > 0) {
      logger.info('trip rider locations adjusted', { tripId, restamped, dropped })
    }
    return NextResponse.json({ accepted: rows.length, recording: active })
  } catch (error) {
    logger.error('Unexpected error storing trip rider locations', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
