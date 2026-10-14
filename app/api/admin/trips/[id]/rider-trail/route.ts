import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { logger } from '@/lib/logger'
import { findTrailGaps, type RiderTrail, type RiderTrailPoint } from '@/lib/admin/rider-trail'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

/** Hard cap per response (a 2h trip at 10s pre-pickup is far below this). */
const MAX_POINTS = 5000

/**
 * GET /api/admin/trips/[id]/rider-trail — the rider's recorded phone trail
 * for one trip. Admin only. Every successful call first writes a
 * `rider_location_access_log` row; if that write fails, no trail is returned.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient<Database>({
      cookies,
    }) as unknown as SupabaseClient<Database>
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !authUser) {
      const { response, statusCode } = handleApiError(new AuthenticationError('Not authenticated.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const { data: adminRow, error: adminErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', authUser.id)
      .single()
    if (adminErr || !adminRow || adminRow.role !== 'admin') {
      const { response, statusCode } = handleApiError(new AuthorizationError('Admin access required.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const tripId = params.id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
      const { response, statusCode } = handleApiError(new ValidationError('Invalid trip id.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const service = createServiceRoleClient()
    const { data: trip } = await service
      .from('trips')
      .select(
        'id, status, rider_id, rider_is_passenger, rider_location_coverage, accepted_at, picked_up_at, completed_at, cancelled_at'
      )
      .eq('id', tripId)
      .maybeSingle()
    if (!trip) {
      const { response, statusCode } = handleApiError(new NotFoundError('Trip not found.', 'TRIP_NOT_FOUND'))
      return NextResponse.json(response, { status: statusCode })
    }

    let riderUserId: string | null = null
    if (trip.rider_id) {
      const { data: rp } = await service
        .from('rider_profiles')
        .select('user_id')
        .eq('id', trip.rider_id)
        .maybeSingle()
      riderUserId = rp?.user_id ?? null
    }

    // Audit first: no log row, no trail.
    const { error: logErr } = await service.from('rider_location_access_log').insert({
      admin_user_id: adminRow.id,
      trip_id: trip.id,
      rider_user_id: riderUserId,
    })
    if (logErr) {
      logger.error('rider trail access log failed; refusing to return trail', { tripId, error: logErr })
      const { response, statusCode } = handleApiError(new Error('Could not record this access. Try again.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const { data: rows, error: ptsErr } = await service
      .from('trip_rider_locations')
      .select('latitude, longitude, recorded_at, accuracy_meters, speed_mps, heading, phase')
      .eq('trip_id', trip.id)
      .order('recorded_at', { ascending: true })
      .limit(MAX_POINTS + 1)
    if (ptsErr) {
      const { response, statusCode } = handleApiError(ptsErr)
      return NextResponse.json(response, { status: statusCode })
    }

    const truncated = (rows?.length ?? 0) > MAX_POINTS
    const points: RiderTrailPoint[] = (rows ?? [])
      .slice(0, MAX_POINTS)
      .map((r) => ({
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        recorded_at: r.recorded_at,
        accuracy_meters: r.accuracy_meters == null ? null : Number(r.accuracy_meters),
        speed_kmh: r.speed_mps == null ? null : Number(r.speed_mps) * 3.6,
        heading: r.heading == null ? null : Number(r.heading),
        phase: r.phase,
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

    const endedAt = trip.completed_at ?? trip.cancelled_at
    const trail: RiderTrail = {
      trip_id: trip.id,
      trip_status: trip.status,
      rider_is_passenger: trip.rider_is_passenger,
      coverage: trip.rider_location_coverage,
      accepted_at: trip.accepted_at,
      picked_up_at: trip.picked_up_at,
      ended_at: endedAt,
      points,
      gaps: trip.rider_is_passenger
        ? findTrailGaps(points, { acceptedAt: trip.accepted_at, pickedUpAt: trip.picked_up_at, endedAt })
        : [],
      truncated,
    }

    logger.info('rider trail viewed', { tripId, adminUserId: adminRow.id, points: points.length })
    return NextResponse.json(trail, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error('Unexpected error loading rider trail', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
