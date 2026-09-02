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
import { validate, panicResolveSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { loadPanicConfig } from '@/lib/panic/config'
import { loadPanicTripBundle } from '@/lib/panic/trip-bundle'
import { computeTrackingState } from '@/lib/panic/tracking'
import {
  claimDispatch,
  dispatchPanicSms,
  parseRecipients,
  summarizeRecipients,
} from '@/lib/panic/service'
import { publicAlert } from '@/lib/panic/api-shapes'

export const dynamic = 'force-dynamic'

/**
 * POST /api/panic/[id]/resolve — "I'm safe / false alarm".
 * Marks the alert and its incident resolved and sends a follow-up SMS to
 * every recipient that received the original alert.
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

    let body: unknown = {}
    try {
      const text = await request.text()
      body = text.trim() ? JSON.parse(text) : {}
    } catch {
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid JSON in request body.', 'INVALID_BODY')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    const input = validate(panicResolveSchema, body)

    const service = createServiceRoleClient()
    const { data: alert } = await service.from('panic_alerts').select('*').eq('id', alertId).maybeSingle()
    if (!alert || alert.user_id !== user.id) {
      const { response, statusCode } = handleApiError(new NotFoundError('Alert not found.', 'ALERT_NOT_FOUND'))
      return NextResponse.json(response, { status: statusCode })
    }

    const cfg = await loadPanicConfig(service)
    const bundle = await loadPanicTripBundle(service, alert.trip_id)

    if (alert.status === 'resolved') {
      return NextResponse.json({
        alert: publicAlert(alert),
        outcome: 'already_resolved',
        sms: summarizeRecipients(parseRecipients(alert.recipients), 'resolved'),
        support_phone: cfg.supportDisplay,
      })
    }
    if (alert.status === 'expired' || new Date(alert.expires_at).getTime() <= Date.now()) {
      const { response, statusCode } = handleApiError(
        new ConflictError('This alert has already expired.', 'ALERT_EXPIRED')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const now = new Date().toISOString()
    const { data: updated, error: updErr } = await service
      .from('panic_alerts')
      .update({ status: 'resolved', resolved_at: now, resolved_by_user_id: user.id })
      .eq('id', alert.id)
      .eq('status', 'active')
      .select('*')
      .maybeSingle()
    if (updErr) {
      const { response, statusCode } = handleApiError(updErr)
      return NextResponse.json(response, { status: statusCode })
    }
    const current = updated ?? alert

    const { error: incErr } = await service
      .from('incidents')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolved_by: user.id,
        admin_notes: `Resolved by reporter (${input.reason}) via the app at ${now}.`,
      })
      .eq('id', alert.incident_id)
      .neq('status', 'resolved')
    if (incErr) logger.warn('Failed to resolve linked incident', { incidentId: alert.incident_id, error: incErr })

    let results = parseRecipients(current.recipients)
    if (bundle && (await claimDispatch(service, current.id, 'resolved_sms_dispatched_at'))) {
      results = await dispatchPanicSms(service, { ...current, resolved_at: now }, bundle, cfg, 'resolved')
    }

    const tracking = bundle ? computeTrackingState({ ...current, resolved_at: now, status: 'resolved' }, bundle.trip) : null
    logger.info('panic alert resolved', { alertId: current.id, userId: user.id, reason: input.reason })
    return NextResponse.json({
      alert: { ...publicAlert({ ...current, status: 'resolved', resolved_at: now }), tracking_grace_until: tracking?.graceEndsAt?.toISOString() ?? null },
      outcome: 'resolved',
      sms: summarizeRecipients(results, 'resolved'),
      support_phone: cfg.supportDisplay,
    })
  } catch (error) {
    logger.error('Unexpected error resolving panic alert', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
