'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'
import {
  isValidAppVersionString,
  parseBuildNumber,
} from '@/lib/app-version'
import { sendTripRequestsPausedNotificationToRidersAndDrivers } from '@/lib/firebase/notifications'
import { loadPanicConfig, PANIC_CONFIG_KEYS } from '@/lib/panic/config'
import { isTwilioConfigured, normalizeToE164Guyana, sendTwilioSms } from '@/lib/sms/twilio'
import { formatGuyana } from '@/lib/guyana-time'
import { APP_VERSION_ROW_ORDER } from './constants'
import type {
  AppVersionConfigRow,
  AppVersionConfigInput,
  GetAppVersionConfigResult,
  GetTripRequestsConfigResult,
  SetTripRequestsEnabledResult,
  UpdateAppVersionConfigResult,
  GetPanicSettingsResult,
  PanicSettings,
  PanicSettingsInput,
  SetPanicSettingsResult,
  SendPanicTestSmsResult,
} from './types'

const TRIP_REQUESTS_CONFIG_KEY = 'trip_requests' as const

function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(): Promise<
  | { ok: true; db: ReturnType<typeof createServiceClient>; adminUserId: string }
  | { ok: false; error: string }
> {
  const authClient = createServerActionClient({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { ok: false, error: 'Not authenticated' }
  }

  const db = createServiceClient()
  const { data: userRow, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('auth_id', authUser.id)
    .single()

  if (userError || !userRow || userRow.role !== 'admin') {
    return { ok: false, error: 'Only administrators can manage app versions.' }
  }

  return { ok: true, db, adminUserId: userRow.id }
}

function sortRows(rows: AppVersionConfigRow[]): AppVersionConfigRow[] {
  const rank = (r: AppVersionConfigRow) =>
    APP_VERSION_ROW_ORDER.findIndex(
      (k) => k.app_type === r.app_type && k.platform === r.platform
    )
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

export async function getAppVersionConfig(): Promise<GetAppVersionConfigResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data, error } = await gate.db
    .from('app_version_config')
    .select('app_type, platform, version_string, build_number, mandatory_update, updated_at')
    .order('app_type')
    .order('platform')

  if (error) {
    logger.error('getAppVersionConfig failed', { error })
    return { ok: false, error: 'Failed to load app version settings.' }
  }

  const rows = (data ?? []) as AppVersionConfigRow[]
  return { ok: true, rows: sortRows(rows) }
}

export async function updateAppVersionConfig(
  inputs: AppVersionConfigInput[]
): Promise<UpdateAppVersionConfigResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  if (inputs.length !== APP_VERSION_ROW_ORDER.length) {
    return { ok: false, error: 'Invalid payload: expected four app/platform rows.' }
  }

  const normalized: {
    app_type: AppVersionConfigInput['app_type']
    platform: AppVersionConfigInput['platform']
    version_string: string
    build_number: number
    mandatory_update: boolean
  }[] = []

  for (const input of inputs) {
    const version = input.version_string.trim()
    if (!isValidAppVersionString(version)) {
      return {
        ok: false,
        error: `Invalid version for ${input.app_type} ${input.platform}. Use digits and dots (e.g. 1.0.5).`,
      }
    }
    const build = parseBuildNumber(String(input.build_number))
    if (build === null || build < 0) {
      return {
        ok: false,
        error: `Invalid build for ${input.app_type} ${input.platform}. Use a non-negative integer.`,
      }
    }
    normalized.push({
      app_type: input.app_type,
      platform: input.platform,
      version_string: version,
      build_number: build,
      mandatory_update: Boolean(input.mandatory_update),
    })
  }

  for (const expected of APP_VERSION_ROW_ORDER) {
    const found = normalized.some(
      (n) => n.app_type === expected.app_type && n.platform === expected.platform
    )
    if (!found) {
      return { ok: false, error: 'Missing row for driver/rider and ios/android.' }
    }
  }

  const now = new Date().toISOString()
  const db = gate.db

  for (const row of normalized) {
    const { error } = await db
      .from('app_version_config')
      .update({
        version_string: row.version_string,
        build_number: row.build_number,
        mandatory_update: row.mandatory_update,
        updated_at: now,
      })
      .eq('app_type', row.app_type)
      .eq('platform', row.platform)

    if (error) {
      logger.error('updateAppVersionConfig row failed', {
        error,
        app_type: row.app_type,
        platform: row.platform,
      })
      return { ok: false, error: 'Failed to save app version settings.' }
    }
  }

  logger.info('App version config updated by admin')
  return { ok: true }
}

export async function getTripRequestsConfig(): Promise<GetTripRequestsConfigResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data, error } = await gate.db
    .from('system_config')
    .select('value')
    .eq('key', TRIP_REQUESTS_CONFIG_KEY)
    .maybeSingle()

  if (error) {
    logger.error('getTripRequestsConfig failed', { error })
    return { ok: false, error: 'Failed to load trip request settings.' }
  }

  if (!data?.value || typeof data.value !== 'object' || data.value === null) {
    return { ok: true, enabled: true }
  }
  const raw = 'enabled' in data.value ? (data.value as { enabled: unknown }).enabled : undefined
  if (typeof raw === 'boolean') {
    return { ok: true, enabled: raw }
  }
  return { ok: true, enabled: true }
}

function parseTripRequestsEnabledFromValue(value: unknown): boolean {
  if (!value || typeof value !== 'object' || value === null) {
    return true
  }
  const raw = 'enabled' in value ? (value as { enabled: unknown }).enabled : undefined
  if (typeof raw === 'boolean') {
    return raw
  }
  return true
}

export async function setTripRequestsEnabled(
  enabled: boolean
): Promise<SetTripRequestsEnabledResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data: priorRow } = await gate.db
    .from('system_config')
    .select('value')
    .eq('key', TRIP_REQUESTS_CONFIG_KEY)
    .maybeSingle()

  const previousEnabled = parseTripRequestsEnabledFromValue(priorRow?.value)

  const now = new Date().toISOString()
  const { error } = await gate.db
    .from('system_config')
    .upsert(
      {
        key: TRIP_REQUESTS_CONFIG_KEY,
        value: { enabled },
        description:
          'When enabled is false, POST /api/trip-requests returns 403 until an admin re-enables it.',
        updated_at: now,
        updated_by: gate.adminUserId,
      },
      { onConflict: 'key' }
    )

  if (error) {
    logger.error('setTripRequestsEnabled failed', { error, enabled })
    return { ok: false, error: 'Failed to save trip request setting.' }
  }

  logger.info('Trip requests config updated by admin', { enabled })

  if (!enabled && previousEnabled) {
    try {
      await sendTripRequestsPausedNotificationToRidersAndDrivers(gate.adminUserId)
    } catch (pushErr) {
      logger.error('Trip pause push or message_logs failed after config save', pushErr)
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Panic button
// ---------------------------------------------------------------------------

const MAX_PANIC_SUPPORT_NUMBERS = 10

async function readPanicSettings(db: ReturnType<typeof createServiceClient>): Promise<PanicSettings> {
  const cfg = await loadPanicConfig(db)
  return {
    enabled: cfg.enabled,
    numbers: cfg.supportNumbers,
    display: cfg.supportDisplay,
    testMode: cfg.testMode,
    testNumber: cfg.testNumber,
    envTestModeForced: (process.env.PANIC_TEST_MODE ?? '').toLowerCase() === 'true',
    twilioConfigured: isTwilioConfigured(),
  }
}

export async function getPanicSettings(): Promise<GetPanicSettingsResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }
  try {
    return { ok: true, settings: await readPanicSettings(gate.db) }
  } catch (err) {
    logger.error('getPanicSettings failed', { err })
    return { ok: false, error: 'Failed to load panic button settings.' }
  }
}

export async function setPanicSettings(input: PanicSettingsInput): Promise<SetPanicSettingsResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const rawNumbers = Array.isArray(input.numbers) ? input.numbers : []
  if (rawNumbers.length > MAX_PANIC_SUPPORT_NUMBERS) {
    return { ok: false, error: `At most ${MAX_PANIC_SUPPORT_NUMBERS} support numbers are allowed.` }
  }
  const numbers: string[] = []
  for (const raw of rawNumbers) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const n = normalizeToE164Guyana(raw)
    if (!n) {
      return { ok: false, error: `"${raw}" is not a valid phone number. Use +592XXXXXXX or 7 local digits.` }
    }
    if (!numbers.includes(n)) numbers.push(n)
  }
  if (numbers.length === 0) {
    return { ok: false, error: 'Add at least one support number that will receive panic alerts.' }
  }

  const display = typeof input.display === 'string' ? input.display.trim().slice(0, 40) : ''

  const testMode = Boolean(input.testMode)
  let testNumber: string | null = null
  if (typeof input.testNumber === 'string' && input.testNumber.trim()) {
    testNumber = normalizeToE164Guyana(input.testNumber)
    if (!testNumber) {
      return { ok: false, error: 'The test number is not a valid phone number.' }
    }
  }
  if (testMode && !testNumber) {
    return { ok: false, error: 'Test mode needs a test number, otherwise every alert SMS would be skipped.' }
  }

  const now = new Date().toISOString()
  const rows = [
    {
      key: PANIC_CONFIG_KEYS.enabled,
      value: { enabled: Boolean(input.enabled) },
      description: 'Panic button kill switch. When enabled is false, POST /api/panic returns 403 PANIC_DISABLED.',
    },
    {
      key: PANIC_CONFIG_KEYS.supportNumbers,
      value: { numbers, display: display || numbers[0] },
      description: 'E.164 support numbers that receive panic SMS, plus the display number shown to users.',
    },
    {
      key: PANIC_CONFIG_KEYS.testMode,
      value: { enabled: testMode, test_number: testNumber },
      description: 'When enabled, every panic SMS is redirected to test_number instead of real recipients.',
    },
  ]

  for (const row of rows) {
    const { error } = await gate.db
      .from('system_config')
      .upsert({ ...row, updated_at: now, updated_by: gate.adminUserId }, { onConflict: 'key' })
    if (error) {
      logger.error('setPanicSettings upsert failed', { error, key: row.key })
      return { ok: false, error: 'Failed to save panic button settings.' }
    }
  }

  logger.info('Panic settings updated by admin', {
    enabled: input.enabled,
    numbers: numbers.length,
    testMode,
    adminUserId: gate.adminUserId,
  })

  try {
    return { ok: true, settings: await readPanicSettings(gate.db) }
  } catch (err) {
    logger.error('setPanicSettings reload failed', { err })
    return { ok: false, error: 'Saved, but reloading the settings failed. Refresh the page.' }
  }
}

/**
 * Sends a one-off SMS to the configured test number so admins can verify
 * Twilio credentials and delivery. Logged to message_logs as `panic_test`.
 */
export async function sendPanicTestSms(): Promise<SendPanicTestSmsResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  if (!isTwilioConfigured()) {
    return { ok: false, error: 'Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).' }
  }

  const cfg = await loadPanicConfig(gate.db)
  if (!cfg.testNumber) {
    return { ok: false, error: 'Save a test number first.' }
  }

  const body = `LINKS PANIC TEST ${formatGuyana(new Date(), 'd MMM HH:mm')}: this is a test of the Links panic alert SMS. No action needed.`
  const result = await sendTwilioSms(cfg.testNumber, body, { timeoutMs: 10_000 })

  const { error: logErr } = await gate.db.from('message_logs').insert({
    channel: 'sms',
    recipient_phone: cfg.testNumber,
    message: body,
    status: result.ok ? 'sent' : 'failed',
    sent_by_user_id: gate.adminUserId,
    external_id: result.ok ? result.sid : null,
    notification_type: 'panic_test',
    audience: 'test',
    metadata: {
      test_mode: cfg.testMode,
      twilio_error: result.ok ? null : result.message,
      twilio_code: result.ok ? null : (result.code ?? null),
    },
  })
  if (logErr) logger.error('panic_test message_logs insert failed', { error: logErr })

  if (!result.ok) {
    return { ok: false, error: `Twilio rejected the message: ${result.message}` }
  }
  logger.info('Panic test SMS sent', { to: cfg.testNumber, sid: result.sid, adminUserId: gate.adminUserId })
  return { ok: true, sid: result.sid, to: cfg.testNumber }
}
