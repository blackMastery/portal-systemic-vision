import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, PanicRecipientResult } from '@/types/database'
import { logger } from '@/lib/logger'
import { normalizeToE164Guyana, sendTwilioSms } from '@/lib/sms/twilio'
import type { PanicConfig } from './config'
import {
  buildAlertSmsForContact,
  buildAlertSmsForSupport,
  buildSafeSms,
  type PanicMessageContext,
} from './messages'
import type { PanicTripBundle } from './trip-bundle'

type PanicAlertRow = Database['public']['Tables']['panic_alerts']['Row']

type Recipient = {
  kind: PanicRecipientResult['kind']
  phone: string
  intendedPhone: string
  audience: 'support' | 'emergency_contact'
}

/**
 * Compare-and-set claim so the SMS fan-out runs exactly once even when the
 * client retries with the same idempotency key while a send is in flight.
 */
export async function claimDispatch(
  service: SupabaseClient<Database>,
  alertId: string,
  column: 'sms_dispatched_at' | 'resolved_sms_dispatched_at'
): Promise<boolean> {
  const { data, error } = await service
    .from('panic_alerts')
    .update({ [column]: new Date().toISOString() })
    .eq('id', alertId)
    .is(column, null)
    .select('id')
  if (error) {
    logger.error('claimDispatch failed', { alertId, column, error })
    return false
  }
  return (data?.length ?? 0) > 0
}

export function parseRecipients(raw: Json | null | undefined): PanicRecipientResult[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (r): r is PanicRecipientResult =>
      !!r && typeof r === 'object' && !Array.isArray(r) && 'kind' in r && 'status' in r
  ) as PanicRecipientResult[]
}

export function buildMessageContext(
  alert: PanicAlertRow,
  bundle: PanicTripBundle,
  cfg: PanicConfig
): PanicMessageContext {
  const presser = alert.role === 'rider' ? bundle.rider : bundle.driver
  return {
    role: alert.role,
    presserName: presser?.fullName ?? (alert.role === 'rider' ? 'A Links rider' : 'A Links driver'),
    presserPhone: presser?.phone ?? null,
    tripId: alert.trip_id,
    pickupAddress: bundle.trip.pickup_address,
    destinationAddress: bundle.trip.destination_address,
    riderName: bundle.rider?.fullName ?? null,
    riderPhone: bundle.rider?.phone ?? null,
    driverName: bundle.driver?.fullName ?? null,
    driverPhone: bundle.driver?.phone ?? null,
    vehicleColor: bundle.vehicle?.color ?? null,
    vehicleMake: bundle.vehicle?.make ?? null,
    vehicleModel: bundle.vehicle?.model ?? null,
    vehiclePlate: bundle.vehicle?.licensePlate ?? null,
    latitude: alert.latitude,
    longitude: alert.longitude,
    accuracyMeters: alert.accuracy_meters,
    trackingToken: alert.tracking_token,
    incidentId: alert.incident_id,
    supportDisplay: cfg.supportDisplay,
    pressedAt: new Date(alert.created_at),
  }
}

function buildRecipients(
  alert: PanicAlertRow,
  bundle: PanicTripBundle,
  cfg: PanicConfig,
  purpose: 'alert' | 'resolved'
): { recipients: Recipient[]; skipped: PanicRecipientResult[] } {
  const now = new Date().toISOString()
  const recipients: Recipient[] = []
  const skipped: PanicRecipientResult[] = []

  const wantContact = alert.role === 'rider'
  let contactPhone: string | null = null
  if (wantContact) {
    const raw = bundle.rider?.emergencyContactPhone
    if (!raw || !raw.trim()) {
      skipped.push({ kind: 'emergency_contact', purpose, phone: '', status: 'skipped', error: 'no_emergency_contact', at: now })
    } else {
      contactPhone = normalizeToE164Guyana(raw)
      if (!contactPhone) {
        skipped.push({ kind: 'emergency_contact', purpose, phone: raw, status: 'skipped', error: 'invalid_phone', at: now })
      }
    }
  }

  if (purpose === 'resolved') {
    // Only the recipients that actually received the alert.
    const sentBefore = parseRecipients(alert.recipients).filter(
      (r) => r.purpose === 'alert' && r.status === 'sent'
    )
    for (const r of sentBefore) {
      const audience = r.kind === 'emergency_contact' ? 'emergency_contact' : 'support'
      recipients.push({ kind: r.kind, phone: r.intended_phone ?? r.phone, intendedPhone: r.intended_phone ?? r.phone, audience })
    }
  } else {
    for (const n of cfg.supportNumbers) {
      recipients.push({ kind: 'support', phone: n, intendedPhone: n, audience: 'support' })
    }
    if (contactPhone) {
      recipients.push({ kind: 'emergency_contact', phone: contactPhone, intendedPhone: contactPhone, audience: 'emergency_contact' })
    }
  }

  if (cfg.testMode) {
    if (!cfg.testNumber) {
      for (const r of recipients) {
        skipped.push({ kind: r.kind, purpose, phone: '', intended_phone: r.intendedPhone, status: 'skipped', error: 'test_mode_no_number', at: now })
      }
      return { recipients: [], skipped }
    }
    for (const r of recipients) r.phone = cfg.testNumber
  }

  return { recipients, skipped }
}

/**
 * Sends the alert / resolved SMS to every recipient in parallel, logs each
 * attempt to `message_logs`, and appends the outcomes to
 * `panic_alerts.recipients`. Must be awaited inside the request (Vercel).
 */
export async function dispatchPanicSms(
  service: SupabaseClient<Database>,
  alert: PanicAlertRow,
  bundle: PanicTripBundle,
  cfg: PanicConfig,
  purpose: 'alert' | 'resolved'
): Promise<PanicRecipientResult[]> {
  const ctx = buildMessageContext(alert, bundle, cfg)
  const { recipients, skipped } = buildRecipients(alert, bundle, cfg, purpose)
  const resolvedAt = alert.resolved_at ? new Date(alert.resolved_at) : new Date()

  const settled = await Promise.all(
    recipients.map(async (r): Promise<PanicRecipientResult> => {
      const body =
        purpose === 'resolved'
          ? buildSafeSms(ctx, r.audience, resolvedAt)
          : r.audience === 'emergency_contact'
            ? buildAlertSmsForContact(ctx)
            : buildAlertSmsForSupport(ctx)
      const result = await sendTwilioSms(r.phone, body, { timeoutMs: 10_000 })
      const at = new Date().toISOString()
      const { data: logRow } = await service
        .from('message_logs')
        .insert({
          channel: 'sms',
          recipient_phone: r.phone,
          message: body,
          status: result.ok ? 'sent' : 'failed',
          sent_by_user_id: alert.user_id,
          external_id: result.ok ? result.sid : null,
          notification_type: purpose === 'alert' ? 'panic_alert' : 'panic_resolved',
          audience: r.kind,
          metadata: {
            panic_alert_id: alert.id,
            incident_id: alert.incident_id,
            trip_id: alert.trip_id,
            role: alert.role,
            test_mode: cfg.testMode,
            intended_phone: r.intendedPhone,
            twilio_error: result.ok ? null : result.message,
            twilio_code: result.ok ? null : (result.code ?? null),
          },
        })
        .select('id')
        .maybeSingle()
      return {
        kind: cfg.testMode ? 'test' : r.kind,
        purpose,
        phone: r.phone,
        intended_phone: r.intendedPhone,
        status: result.ok ? 'sent' : 'failed',
        sid: result.ok ? result.sid : undefined,
        error: result.ok ? undefined : result.message,
        message_log_id: logRow?.id,
        at,
      }
    })
  )

  const results = [...settled, ...skipped]
  const existing = parseRecipients(alert.recipients)
  const merged = [...existing, ...results]
  const { error } = await service
    .from('panic_alerts')
    .update({ recipients: merged as unknown as Json })
    .eq('id', alert.id)
  if (error) logger.error('Failed to store panic recipients', { alertId: alert.id, error })

  logger.info('panic sms dispatched', {
    alertId: alert.id,
    purpose,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  })
  return results
}

/** Public-safe summary for API responses (no phone numbers). */
export function summarizeRecipients(results: PanicRecipientResult[], purpose: 'alert' | 'resolved') {
  const scoped = results.filter((r) => r.purpose === purpose)
  return {
    sent: scoped.filter((r) => r.status === 'sent').length,
    failed: scoped.filter((r) => r.status === 'failed').length,
    skipped: scoped.filter((r) => r.status === 'skipped').length,
    recipients: scoped.map((r) => ({
      kind: r.kind === 'test' ? inferKind(r) : r.kind,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
  }
}

function inferKind(r: PanicRecipientResult): PanicRecipientResult['kind'] {
  return r.kind
}
