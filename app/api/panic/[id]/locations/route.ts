import { NextRequest, NextResponse } from 'next/server'
import {
  handleApiError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { validate, panicLocationsSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

type PointInsert = Database['public']['Tables']['panic_location_points']['Insert']

/** Phone clocks drift; a fix outside this window is stamped with server time instead. */
const MAX_PAST_SKEW_MS = 5 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000

/**
 * POST /api/panic/[id]/locations — the presser's phone streams GPS points
 * while their alert is active. 409 ALERT_NOT_ACTIVE tells the app to stop.
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

    const alertId = params.id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alertId)) {
      const { response, statusCode } = handleApiError(new ValidationError('Invalid alert id.'))
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
    const input = validate(panicLocationsSchema, body)

    const service = createServiceRoleClient()
    const { data: alert } = await service
      .from('panic_alerts')
      .select('id, user_id, status, created_at, expires_at')
      .eq('id', alertId)
      .maybeSingle()
    if (!alert || alert.user_id !== user.id) {
      const { response, statusCode } = handleApiError(new NotFoundError('Alert not found.', 'ALERT_NOT_FOUND'))
      return NextResponse.json(response, { status: statusCode })
    }

    const now = Date.now()
    if (alert.status !== 'active' || new Date(alert.expires_at).getTime() <= now) {
      const { response, statusCode } = handleApiError(
        new ConflictError('This alert is no longer active.', 'ALERT_NOT_ACTIVE')
      )
      return NextResponse.json(
        { ...response, status: alert.status === 'active' ? 'expired' : alert.status },
        { status: statusCode }
      )
    }

    const earliest = new Date(alert.created_at).getTime() - MAX_PAST_SKEW_MS
    const latest = now + MAX_FUTURE_SKEW_MS
    const serverStamp = new Date(now).toISOString()
    let restamped = 0
    const rows: PointInsert[] = input.points.map((p) => {
      const t = new Date(p.recorded_at).getTime()
      const inWindow = Number.isFinite(t) && t >= earliest && t <= latest
      if (!inWindow) restamped++
      return {
        alert_id: alert.id,
        user_id: user.id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracy_meters ?? null,
        speed_mps: p.speed_mps ?? null,
        heading: p.heading ?? null,
        recorded_at: inWindow ? new Date(t).toISOString() : serverStamp,
      }
    })

    const { error: insErr } = await service.from('panic_location_points').insert(rows)
    if (insErr) {
      logger.error('panic location insert failed', { alertId, userId: user.id, error: insErr })
      const { response, statusCode } = handleApiError(insErr)
      return NextResponse.json(response, { status: statusCode })
    }

    if (restamped > 0) {
      logger.warn('panic location points restamped (clock skew)', { alertId, restamped })
    }
    return NextResponse.json({ accepted: rows.length, status: 'active' })
  } catch (error) {
    logger.error('Unexpected error storing panic locations', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
