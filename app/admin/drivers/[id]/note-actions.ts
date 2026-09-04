'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import { NOTE_MAX_LENGTH } from '@/lib/admin/driver-notes'
import type { Database } from '@/types/database'

// Typed service role client — same local-copy convention as every other admin actions file.
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

function validateNote(note: string): { ok: true; note: string } | { ok: false; error: string } {
  const trimmed = note.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Note cannot be empty.' }
  }
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Note must be ${NOTE_MAX_LENGTH} characters or less.` }
  }
  return { ok: true, note: trimmed }
}

export interface DriverNoteActionResult {
  success: boolean
  error?: string
}

/** Message shown whenever an admin tries to change a note they did not write. */
const NOT_YOURS = 'You can only edit or delete your own notes.'

export async function addDriverNote(
  driverId: string,
  note: string,
): Promise<DriverNoteActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const validated = validateNote(note)
  if (!validated.ok) return { success: false, error: validated.error }

  const db = createTypedServiceClient()

  // Turns an opaque FK violation into a readable error.
  const { data: driver } = await db
    .from('driver_profiles')
    .select('id')
    .eq('id', driverId)
    .maybeSingle()

  if (!driver) return { success: false, error: 'Driver not found.' }

  const { error } = await db
    .from('driver_admin_notes')
    .insert({ driver_id: driverId, admin_id: admin.id, note: validated.note })

  if (error) {
    logger.error('Failed to add driver admin note', error, { driverId })
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/drivers')
  revalidatePath(`/admin/drivers/${driverId}`)
  return { success: true }
}

export async function updateDriverNote(
  noteId: string,
  note: string,
): Promise<DriverNoteActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const validated = validateNote(note)
  if (!validated.ok) return { success: false, error: validated.error }

  const db = createTypedServiceClient()

  // Read first, only so a note that exists but belongs to someone else gets a precise
  // message rather than "not found" — and so we know which driver page to revalidate.
  const { data: existing } = await db
    .from('driver_admin_notes')
    .select('id, driver_id, admin_id')
    .eq('id', noteId)
    .maybeSingle()

  if (!existing) return { success: false, error: 'Note not found.' }
  if (existing.admin_id !== admin.id) return { success: false, error: NOT_YOURS }

  // Ownership is re-asserted in the WHERE clause: the service role bypasses RLS, so
  // this filter — not the check above — is what actually enforces the rule, atomically.
  // `edited_at` is stamped by the DB guard trigger; never send it from here.
  const { data: updated, error } = await db
    .from('driver_admin_notes')
    .update({ note: validated.note })
    .eq('id', noteId)
    .eq('admin_id', admin.id)
    .select('id')

  if (error) {
    logger.error('Failed to update driver admin note', error, { noteId })
    return { success: false, error: error.message }
  }
  if (!updated?.length) return { success: false, error: NOT_YOURS }

  revalidatePath('/admin/drivers')
  revalidatePath(`/admin/drivers/${existing.driver_id}`)
  return { success: true }
}

export async function deleteDriverNote(noteId: string): Promise<DriverNoteActionResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const db = createTypedServiceClient()

  const { data: existing } = await db
    .from('driver_admin_notes')
    .select('id, driver_id, admin_id')
    .eq('id', noteId)
    .maybeSingle()

  if (!existing) return { success: false, error: 'Note not found.' }
  if (existing.admin_id !== admin.id) return { success: false, error: NOT_YOURS }

  // Same atomic ownership filter as the update path.
  const { data: deleted, error } = await db
    .from('driver_admin_notes')
    .delete()
    .eq('id', noteId)
    .eq('admin_id', admin.id)
    .select('id')

  if (error) {
    logger.error('Failed to delete driver admin note', error, { noteId })
    return { success: false, error: error.message }
  }
  if (!deleted?.length) return { success: false, error: NOT_YOURS }

  revalidatePath('/admin/drivers')
  revalidatePath(`/admin/drivers/${existing.driver_id}`)
  return { success: true }
}
