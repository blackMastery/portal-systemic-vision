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
import { APP_VERSION_ROW_ORDER } from './constants'
import type {
  AppVersionConfigRow,
  AppVersionConfigInput,
  GetAppVersionConfigResult,
  GetTripRequestsConfigResult,
  SetTripRequestsEnabledResult,
  UpdateAppVersionConfigResult,
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

export async function setTripRequestsEnabled(
  enabled: boolean
): Promise<SetTripRequestsEnabledResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

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
  return { ok: true }
}
