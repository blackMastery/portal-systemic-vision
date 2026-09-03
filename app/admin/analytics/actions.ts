'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

/**
 * Analytics reads that the browser client cannot make.
 *
 * `driver_request_blocks` has RLS enabled with no policy at all,
 * `cost_estimate_landmarks` likewise, and `saved_places` is owner-scoped — so
 * PostgREST returns nothing (or only the admin's own rows) for those three.
 * They go through the service-role client behind an admin check here, the same
 * shape the cost-estimate landmarks admin page uses. Everything else in the
 * analytics page keeps reading directly from the browser client.
 */

function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(): Promise<
  | { ok: true; db: ReturnType<typeof createServiceClient> }
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
    return { ok: false, error: 'Only administrators can read analytics.' }
  }

  return { ok: true, db }
}

export type CountRow = { label: string; value: number }

export type DriverBlockStats = {
  /** Top drivers by number of post-acceptance cancellations. */
  topDrivers: CountRow[]
  total: number
}

export type DriverBlockResult =
  | { ok: true; stats: DriverBlockStats }
  | { ok: false; error: string }

/**
 * A `driver_request_blocks` row is written whenever a driver cancels after
 * accepting, barring them from re-accepting that request. Aggregated here so
 * the browser only receives the leaderboard, not every block row.
 */
export async function getDriverBlockStats(
  startIso: string | null,
  endIso: string
): Promise<DriverBlockResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  type NamedUser = { full_name: string | null }
  type BlockDriver = { user: NamedUser | NamedUser[] | null }
  type BlockRow = {
    blocked_at: string
    driver: BlockDriver | BlockDriver[] | null
  }

  // PostgREST returns to-one embeds as objects, but some client/generator
  // combinations still surface them as single-element arrays.
  const one = <T,>(value: T | T[] | null | undefined): T | null =>
    value == null ? null : Array.isArray(value) ? value[0] ?? null : value

  try {
    const rows = await fetchAllRows<BlockRow>(() => {
      let query = gate.db
        .from('driver_request_blocks')
        .select('blocked_at, driver:driver_id(user:user_id(full_name))')
        .lte('blocked_at', endIso)
        .order('blocked_at', { ascending: true })
      if (startIso) query = query.gte('blocked_at', startIso)
      return query
    })

    const counts: Record<string, number> = {}
    for (const row of rows) {
      const name = one(one(row.driver)?.user)?.full_name?.trim()
      const label = name && name.length > 0 ? name : 'Unknown driver'
      counts[label] = (counts[label] ?? 0) + 1
    }

    const topDrivers = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }))

    return { ok: true, stats: { topDrivers, total: rows.length } }
  } catch (error) {
    logger.error('getDriverBlockStats failed', { error })
    return { ok: false, error: 'Failed to load driver cancellation blocks.' }
  }
}

export type SavedPlaceResult =
  | { ok: true; counts: CountRow[] }
  | { ok: false; error: string }

/** Saved places are owner-scoped under RLS, so the platform-wide mix needs service role. */
export async function getSavedPlaceCounts(): Promise<SavedPlaceResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  try {
    const rows = await fetchAllRows<{ place_type: string | null }>(() =>
      gate.db.from('saved_places').select('place_type').order('id', { ascending: true })
    )

    const counts: Record<string, number> = {}
    for (const row of rows) {
      const key = row.place_type ?? 'other'
      counts[key] = (counts[key] ?? 0) + 1
    }

    return {
      ok: true,
      counts: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    }
  } catch (error) {
    logger.error('getSavedPlaceCounts failed', { error })
    return { ok: false, error: 'Failed to load saved places.' }
  }
}

export type AnalyticsLandmark = {
  name: string
  lat: number
  lng: number
  area: string
  zone_code: string
}

export type LandmarkResult =
  | { ok: true; landmarks: AnalyticsLandmark[] }
  | { ok: false; error: string }

/** Reference points used to name a pickup coordinate; small table, sent whole. */
export async function getAnalyticsLandmarks(): Promise<LandmarkResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  try {
    const landmarks = await fetchAllRows<AnalyticsLandmark>(() =>
      gate.db
        .from('cost_estimate_landmarks')
        .select('name, lat, lng, area, zone_code')
        .order('name', { ascending: true })
    )
    return { ok: true, landmarks }
  } catch (error) {
    logger.error('getAnalyticsLandmarks failed', { error })
    return { ok: false, error: 'Failed to load cost estimate landmarks.' }
  }
}
