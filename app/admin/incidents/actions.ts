'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import type { Database, IncidentStatus, PanicAlertStatus } from '@/types/database'

function createTypedServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getAdminUserId(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const authClient = createServerActionClient<Database>({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { ok: false, error: 'Not authenticated' }
  }

  const db = createTypedServiceClient()
  const { data: adminUser } = await db
    .from('users')
    .select('id, role')
    .eq('auth_id', authUser.id)
    .single()

  const u = adminUser as { id: string; role: string } | null
  if (!u || u.role !== 'admin') {
    return { ok: false, error: 'Forbidden' }
  }
  return { ok: true, id: u.id }
}

export interface IncidentActionResult {
  success: boolean
  error?: string
}

export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
): Promise<IncidentActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const db = createTypedServiceClient()
  const updates: Record<string, unknown> = { status }
  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = admin.id
  } else {
    updates.resolved_at = null
    updates.resolved_by = null
  }

  const { error } = await db.from('incidents').update(updates).eq('id', incidentId)

  if (error) {
    logger.error('Failed to update incident status', error, { incidentId })
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/incidents')
  revalidatePath(`/admin/incidents/${incidentId}`)
  return { success: true }
}

export async function assignAdmin(
  incidentId: string,
  assignedAdminId: string | null,
): Promise<IncidentActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const db = createTypedServiceClient()

  if (assignedAdminId !== null) {
    const { data: target } = await db
      .from('users')
      .select('id, role')
      .eq('id', assignedAdminId)
      .single()
    const t = target as { id: string; role: string } | null
    if (!t || t.role !== 'admin') {
      return { success: false, error: 'Invalid admin user.' }
    }
  }

  const { error } = await db
    .from('incidents')
    .update({ assigned_admin_id: assignedAdminId })
    .eq('id', incidentId)

  if (error) {
    logger.error('Failed to assign incident admin', error, { incidentId })
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/incidents')
  revalidatePath(`/admin/incidents/${incidentId}`)
  return { success: true }
}

export async function addAdminNote(
  incidentId: string,
  note: string,
): Promise<IncidentActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const trimmed = note.trim()
  if (trimmed.length === 0) {
    return { success: false, error: 'Note cannot be empty.' }
  }
  if (trimmed.length > 2000) {
    return { success: false, error: 'Note must be 2000 characters or less.' }
  }

  const db = createTypedServiceClient()
  const { data: row, error: fetchErr } = await db
    .from('incidents')
    .select('admin_notes')
    .eq('id', incidentId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: 'Incident not found.' }
  }

  const prev = row.admin_notes ?? ''
  const stamp = new Date().toISOString()
  const next = prev ? `${prev}\n\n--- ${stamp}\n${trimmed}` : trimmed

  const { error } = await db.from('incidents').update({ admin_notes: next }).eq('id', incidentId)

  if (error) {
    logger.error('Failed to append admin note', error, { incidentId })
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/incidents')
  revalidatePath(`/admin/incidents/${incidentId}`)
  return { success: true }
}

/**
 * Admin-side resolution of a panic alert. Marks the alert and its linked
 * incident resolved. Unlike the app's "I'm safe" flow this sends NO SMS.
 */
export async function resolvePanicAlertAsAdmin(alertId: string): Promise<IncidentActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(alertId)) {
    return { success: false, error: 'Invalid alert id.' }
  }

  const db = createTypedServiceClient()
  const { data: alert, error: fetchErr } = await db
    .from('panic_alerts')
    .select('id, incident_id, status')
    .eq('id', alertId)
    .maybeSingle()

  if (fetchErr || !alert) {
    return { success: false, error: 'Panic alert not found.' }
  }
  const current = alert as { id: string; incident_id: string; status: PanicAlertStatus }
  if (current.status === 'resolved') {
    return { success: false, error: 'This panic alert is already resolved.' }
  }

  const now = new Date().toISOString()
  const { error: alertErr } = await db
    .from('panic_alerts')
    .update({ status: 'resolved', resolved_at: now, resolved_by_user_id: admin.id })
    .eq('id', current.id)

  if (alertErr) {
    logger.error('Failed to resolve panic alert (admin)', alertErr, { alertId })
    return { success: false, error: alertErr.message }
  }

  const { data: incidentRow } = await db
    .from('incidents')
    .select('admin_notes, status')
    .eq('id', current.incident_id)
    .maybeSingle()

  const inc = incidentRow as { admin_notes: string | null; status: IncidentStatus } | null
  const note = `Panic alert resolved by admin from the portal at ${now} (no SMS sent).`
  const nextNotes = inc?.admin_notes ? `${inc.admin_notes}\n\n--- ${now}\n${note}` : note

  const { error: incErr } = await db
    .from('incidents')
    .update({
      status: 'resolved',
      resolved_at: now,
      resolved_by: admin.id,
      admin_notes: nextNotes,
    })
    .eq('id', current.incident_id)

  if (incErr) {
    logger.error('Panic alert resolved but incident update failed', incErr, {
      alertId,
      incidentId: current.incident_id,
    })
    return { success: false, error: `Alert resolved, but the incident could not be updated: ${incErr.message}` }
  }

  logger.info('Panic alert resolved by admin', { alertId, incidentId: current.incident_id, adminId: admin.id })
  revalidatePath('/admin/incidents')
  revalidatePath(`/admin/incidents/${current.incident_id}`)
  return { success: true }
}
