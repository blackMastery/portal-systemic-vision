'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

// Typed client for the parts of the schema that are in generated types.
function createTypedServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Untyped client for tables/columns not yet reflected in generated types
// (rating_review_queue table, trips.rider_feedback column).
function createUntypedServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getAdminUserId(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const authClient = createServerActionClient({ cookies })
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

export interface ResolveResult {
  success: boolean
  error?: string
}

export async function resolveReviewItem(
  reviewId: string,
  action: 'resolved' | 'dismissed',
  note: string,
): Promise<ResolveResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const trimmedNote = note.trim()
  if (trimmedNote.length === 0) {
    return { success: false, error: 'Resolution note is required.' }
  }
  if (trimmedNote.length > 1000) {
    return {
      success: false,
      error: 'Resolution note must be less than 1000 characters.',
    }
  }

  const db = createUntypedServiceClient()
  const { error } = await db
    .from('rating_review_queue')
    .update({
      status: action,
      resolution_note: trimmedNote,
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .eq('status', 'open')

  if (error) {
    logger.error('Failed to resolve review queue item', error, { reviewId })
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/review-queue')
  revalidatePath(`/admin/review-queue/${reviewId}`)
  return { success: true }
}

export interface ManualFlagResult {
  success: boolean
  alreadyFlagged?: boolean
  error?: string
}

export async function manuallyFlagTrip(
  tripId: string,
): Promise<ManualFlagResult> {
  const admin = await getAdminUserId()
  if (!admin.ok) return { success: false, error: admin.error }

  const db = createUntypedServiceClient()

  const { data: trip, error: tripError } = await db
    .from('trips')
    .select('id, rider_id, rider_rating, rider_feedback')
    .eq('id', tripId)
    .single()

  const tripRow = trip as
    | {
        id: string
        rider_id: string | null
        rider_rating: number | null
        rider_feedback: string | null
      }
    | null

  if (tripError || !tripRow) {
    return { success: false, error: 'Trip not found.' }
  }

  if (!tripRow.rider_id) {
    return { success: false, error: 'Trip has no rider.' }
  }

  const { error: insertError } = await db.from('rating_review_queue').insert({
    trip_id: tripRow.id,
    rider_id: tripRow.rider_id,
    rating: tripRow.rider_rating ?? null,
    feedback: tripRow.rider_feedback ?? null,
    flag_source: 'manual',
    flagged_by_user_id: admin.id,
  })

  if (insertError) {
    // 23505 = unique_violation — already flagged manually for this trip.
    const code = (insertError as { code?: string }).code
    if (code === '23505') {
      return { success: false, alreadyFlagged: true }
    }
    logger.error('Failed to manually flag trip', insertError, { tripId })
    return { success: false, error: insertError.message }
  }

  revalidatePath('/admin/review-queue')
  return { success: true }
}
