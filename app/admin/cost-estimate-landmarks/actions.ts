'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

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
    return { ok: false, error: 'Only administrators can manage cost estimate landmarks.' }
  }

  return { ok: true, db }
}

export type CostEstimateZoneRow = Database['public']['Tables']['cost_estimate_zones']['Row']
export type CostEstimateLandmarkRow = Database['public']['Tables']['cost_estimate_landmarks']['Row']

export type ListZonesResult =
  | { ok: true; rows: CostEstimateZoneRow[] }
  | { ok: false; error: string }

export async function listCostEstimateZones(): Promise<ListZonesResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { data, error } = await gate.db
    .from('cost_estimate_zones')
    .select('code, label, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })

  if (error) {
    logger.error('listCostEstimateZones failed', { error })
    return { ok: false, error: 'Failed to load zones.' }
  }
  return { ok: true, rows: data ?? [] }
}

const ZONE_CODE_RE = /^[A-Z][A-Z0-9_]*$/

function normalizeZoneCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_')
}

export type CreateZoneResult =
  | { ok: true; row: CostEstimateZoneRow }
  | { ok: false; error: string }

export async function createCostEstimateZone(input: {
  code: string
  label: string
  sort_order: number
}): Promise<CreateZoneResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const code = normalizeZoneCode(input.code)
  if (!code || !ZONE_CODE_RE.test(code)) {
    return {
      ok: false,
      error: 'Zone code must be uppercase letters, digits, or underscores (e.g. CENTRAL, EAST_BANK).',
    }
  }
  const label = input.label.trim()
  if (!label) {
    return { ok: false, error: 'Label is required.' }
  }
  if (!Number.isFinite(input.sort_order)) {
    return { ok: false, error: 'Sort order must be a number.' }
  }

  const { data, error } = await gate.db
    .from('cost_estimate_zones')
    .insert({
      code,
      label,
      sort_order: Math.trunc(input.sort_order),
    })
    .select('code, label, sort_order, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A zone with this code already exists.' }
    }
    logger.error('createCostEstimateZone failed', { error })
    return { ok: false, error: 'Failed to create zone.' }
  }
  return { ok: true, row: data }
}

export type UpdateZoneResult = { ok: true } | { ok: false; error: string }

export async function updateCostEstimateZone(
  code: string,
  input: { label: string; sort_order: number }
): Promise<UpdateZoneResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const label = input.label.trim()
  if (!label) {
    return { ok: false, error: 'Label is required.' }
  }
  if (!Number.isFinite(input.sort_order)) {
    return { ok: false, error: 'Sort order must be a number.' }
  }

  const { error } = await gate.db
    .from('cost_estimate_zones')
    .update({
      label,
      sort_order: Math.trunc(input.sort_order),
    })
    .eq('code', code)

  if (error) {
    logger.error('updateCostEstimateZone failed', { error, code })
    return { ok: false, error: 'Failed to update zone.' }
  }
  return { ok: true }
}

export type DeleteZoneResult = { ok: true } | { ok: false; error: string }

export async function deleteCostEstimateZone(code: string): Promise<DeleteZoneResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { error } = await gate.db.from('cost_estimate_zones').delete().eq('code', code)

  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error: 'Cannot delete this zone while landmarks still reference it. Reassign or delete those landmarks first.',
      }
    }
    logger.error('deleteCostEstimateZone failed', { error, code })
    return { ok: false, error: 'Failed to delete zone.' }
  }
  return { ok: true }
}

export type ListLandmarksResult =
  | { ok: true; rows: CostEstimateLandmarkRow[] }
  | { ok: false; error: string }

export async function listCostEstimateLandmarks(): Promise<ListLandmarksResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { data, error } = await gate.db
    .from('cost_estimate_landmarks')
    .select('id, name, aliases, lat, lng, area, zone_code, created_at, updated_at')
    .order('name', { ascending: true })

  if (error) {
    logger.error('listCostEstimateLandmarks failed', { error })
    return { ok: false, error: 'Failed to load landmarks.' }
  }
  return { ok: true, rows: data ?? [] }
}

function parseAliases(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export type CreateLandmarkResult =
  | { ok: true; row: CostEstimateLandmarkRow }
  | { ok: false; error: string }

export async function createCostEstimateLandmark(input: {
  name: string
  aliases: string
  lat: number
  lng: number
  area: string
  zone_code: string
}): Promise<CreateLandmarkResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: 'Name is required.' }
  }
  const area = input.area.trim()
  if (!area) {
    return { ok: false, error: 'Area is required.' }
  }
  const zone_code = input.zone_code.trim()
  if (!zone_code) {
    return { ok: false, error: 'Zone is required.' }
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, error: 'Latitude and longitude must be valid numbers.' }
  }

  const aliases = parseAliases(input.aliases)

  const { data, error } = await gate.db
    .from('cost_estimate_landmarks')
    .insert({
      name,
      aliases,
      lat: input.lat,
      lng: input.lng,
      area,
      zone_code,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A landmark with this name already exists.' }
    }
    if (error.code === '23503') {
      return { ok: false, error: 'Unknown zone code. Create the zone first.' }
    }
    logger.error('createCostEstimateLandmark failed', { error })
    return { ok: false, error: 'Failed to create landmark.' }
  }
  return { ok: true, row: data }
}

export type UpdateLandmarkResult = { ok: true } | { ok: false; error: string }

export async function updateCostEstimateLandmark(
  id: string,
  input: {
    name: string
    aliases: string
    lat: number
    lng: number
    area: string
    zone_code: string
  }
): Promise<UpdateLandmarkResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: 'Name is required.' }
  }
  const area = input.area.trim()
  if (!area) {
    return { ok: false, error: 'Area is required.' }
  }
  const zone_code = input.zone_code.trim()
  if (!zone_code) {
    return { ok: false, error: 'Zone is required.' }
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, error: 'Latitude and longitude must be valid numbers.' }
  }

  const aliases = parseAliases(input.aliases)

  const { error } = await gate.db
    .from('cost_estimate_landmarks')
    .update({
      name,
      aliases,
      lat: input.lat,
      lng: input.lng,
      area,
      zone_code,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Another landmark already uses this name.' }
    }
    if (error.code === '23503') {
      return { ok: false, error: 'Unknown zone code.' }
    }
    logger.error('updateCostEstimateLandmark failed', { error, id })
    return { ok: false, error: 'Failed to update landmark.' }
  }
  return { ok: true }
}

export type DeleteLandmarkResult = { ok: true } | { ok: false; error: string }

export async function deleteCostEstimateLandmark(id: string): Promise<DeleteLandmarkResult> {
  const gate = await requireAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { error } = await gate.db.from('cost_estimate_landmarks').delete().eq('id', id)

  if (error) {
    logger.error('deleteCostEstimateLandmark failed', { error, id })
    return { ok: false, error: 'Failed to delete landmark.' }
  }
  return { ok: true }
}
