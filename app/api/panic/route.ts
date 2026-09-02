import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { validate, panicTriggerSchema } from '@/lib/validation'
import { assertUserIsTripParticipant } from '@/lib/incidents/verify-trip-participant'
import { logger } from '@/lib/logger'
import { loadPanicConfig } from '@/lib/panic/config'
import { loadPanicTripBundle } from '@/lib/panic/trip-bundle'
import { buildIncidentDescription } from '@/lib/panic/messages'
import { isActiveTripStatus } from '@/lib/panic/tracking'
import {
  claimDispatch,
  dispatchPanicSms,
  parseRecipients,
  summarizeRecipients,
} from '@/lib/panic/service'
import { publicAlert } from '@/lib/panic/api-shapes'

export const dynamic = 'force-dynamic'

function authFailure(error: 'missing_token' | 'invalid_token' | 'user_not_found') {
  const msg =
    error === 'missing_token'
      ? 'Missing or invalid Authorization header. Expected: Bearer <token>'
      : error === 'invalid_token'
        ? 'Invalid or expired token.'
        : 'User not found.'
  const { response, statusCode } = handleApiError(
    new AuthenticationError(msg, error.toUpperCase())
  )
  return NextResponse.json(response, { status: statusCode })
}

/**
 * POST /api/panic — fire the panic button for an active trip.
 * Creates an incident + panic_alert atomically (idempotent on
 * `idempotency_key`, one active alert per trip/user) and sends the SMS
 * fan-out before responding.
 */
export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveUserFromBearerRequest(request)
    if (!resolved.ok) return authFailure(resolved.error)
    const { user } = resolved

    if (!user.is_active) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('User account is inactive.')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (user.role !== 'driver' && user.role !== 'rider') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Only drivers and riders can raise a panic alert.')
      )
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
    const input = validate(panicTriggerSchema, body)
    const role = input.role ?? (user.role === 'driver' ? 'driver' : 'rider')
    if (role !== user.role) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('role does not match the signed-in user.', 'ROLE_MISMATCH')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const service = createServiceRoleClient()
    const cfg = await loadPanicConfig(service)
    if (!cfg.enabled) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Emergency alerts are currently disabled.', 'PANIC_DISABLED')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const participant = await assertUserIsTripParticipant(service, input.trip_id, user.id, role)
    if (!participant) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('Trip not found or you are not a participant on this trip.', 'TRIP_NOT_FOUND')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const bundle = await loadPanicTripBundle(service, input.trip_id)
    if (!bundle) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('Trip not found.', 'TRIP_NOT_FOUND')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (!isActiveTripStatus(bundle.trip.status)) {
      const { response, statusCode } = handleApiError(
        new ConflictError('This trip is not active.', 'TRIP_NOT_ACTIVE')
      )
      return NextResponse.json(
        { ...response, trip_status: bundle.trip.status },
        { status: statusCode }
      )
    }

    const presserName =
      (role === 'rider' ? bundle.rider?.fullName : bundle.driver?.fullName) ?? user.full_name
    const subjectUserId = role === 'rider' ? bundle.driver?.userId ?? null : bundle.rider?.userId ?? null
    const pressedAt = new Date()
    const description = buildIncidentDescription({
      role,
      presserName,
      tripId: input.trip_id,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracyMeters: input.accuracy_meters ?? null,
      pressedAt,
    })

    const { data: rpcRows, error: rpcError } = await service.rpc('create_panic_alert', {
      p_trip_id: input.trip_id,
      p_user_id: user.id,
      p_role: role,
      p_subject_user_id: subjectUserId,
      p_description: description,
      p_idempotency_key: input.idempotency_key,
      p_tracking_token: randomBytes(24).toString('base64url'),
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_accuracy_meters: input.accuracy_meters ?? null,
      p_test_mode: cfg.testMode,
    })
    const row = Array.isArray(rpcRows) ? rpcRows[0] : null
    if (rpcError || !row) {
      logger.error('create_panic_alert failed', { error: rpcError, userId: user.id, tripId: input.trip_id })
      const { response, statusCode } = handleApiError(rpcError ?? new Error('Failed to create panic alert.'))
      return NextResponse.json(response, { status: statusCode })
    }
    let alert = row.alert
    const outcome = row.outcome

    let results = parseRecipients(alert.recipients)
    if (await claimDispatch(service, alert.id, 'sms_dispatched_at')) {
      results = await dispatchPanicSms(service, alert, bundle, cfg, 'alert')
    } else {
      // Another request already dispatched (or is dispatching); re-read.
      const { data: fresh } = await service.from('panic_alerts').select('*').eq('id', alert.id).maybeSingle()
      if (fresh) {
        alert = fresh
        results = parseRecipients(fresh.recipients)
      }
    }

    logger.info('panic alert', { alertId: alert.id, outcome, userId: user.id, role })
    return NextResponse.json(
      {
        alert: publicAlert(alert),
        outcome,
        sms: summarizeRecipients(results, 'alert'),
        support_phone: cfg.supportDisplay,
      },
      { status: outcome === 'created' ? 201 : 200 }
    )
  } catch (error) {
    logger.error('Unexpected error creating panic alert', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}

/**
 * GET /api/panic?trip_id=<uuid> — the caller's most recent alert on a trip,
 * so the app can restore its "Alert active" state after a restart.
 */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveUserFromBearerRequest(request)
    if (!resolved.ok) return authFailure(resolved.error)
    const { user } = resolved

    const tripId = new URL(request.url).searchParams.get('trip_id') ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
      const { response, statusCode } = handleApiError(
        new ValidationError('trip_id must be a valid UUID.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const service = createServiceRoleClient()
    await service.rpc('expire_stale_panic_alerts').then(() => undefined, () => undefined)
    const { data: alert, error } = await service
      .from('panic_alerts')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      const { response, statusCode } = handleApiError(error)
      return NextResponse.json(response, { status: statusCode })
    }
    if (!alert) return NextResponse.json({ alert: null }, { status: 200 })

    const cfg = await loadPanicConfig(service)
    return NextResponse.json({
      alert: publicAlert(alert),
      outcome: alert.status,
      sms: summarizeRecipients(parseRecipients(alert.recipients), 'alert'),
      support_phone: cfg.supportDisplay,
    })
  } catch (error) {
    logger.error('Unexpected error reading panic alert', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
