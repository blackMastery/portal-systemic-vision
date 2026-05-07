import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleApiError, AuthenticationError, AuthorizationError, NotFoundError } from '@/lib/errors'
import { validate, adminUpdateIncidentSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient<Database>({
      cookies,
    }) as unknown as SupabaseClient<Database>
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Not authenticated.'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { data: adminRow, error: adminErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', authUser.id)
      .single()

    if (adminErr || !adminRow || adminRow.role !== 'admin') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Admin access required.'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      const { response, statusCode } = handleApiError(new Error('Invalid JSON in request body.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const validated = validate(adminUpdateIncidentSchema, body)

    if (
      validated.status === undefined &&
      validated.admin_notes === undefined &&
      validated.assigned_admin_id === undefined
    ) {
      return NextResponse.json(
        { error: 'No updatable fields provided.', code: 'VALIDATION_ERROR', statusCode: 400 },
        { status: 400 },
      )
    }

    const updates: Database['public']['Tables']['incidents']['Update'] = {}

    if (validated.status !== undefined) {
      updates.status = validated.status
      if (validated.status === 'resolved') {
        updates.resolved_at = new Date().toISOString()
        updates.resolved_by = adminRow.id
      } else {
        updates.resolved_at = null
        updates.resolved_by = null
      }
    }

    if (validated.admin_notes !== undefined) {
      updates.admin_notes = validated.admin_notes
    }

    if (validated.assigned_admin_id !== undefined) {
      updates.assigned_admin_id = validated.assigned_admin_id
    }

    const { data: updated, error: updateError } = await supabase
      .from('incidents')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (updateError) {
      const { response, statusCode } = handleApiError(updateError)
      return NextResponse.json(response, { status: statusCode })
    }

    if (!updated) {
      const { response, statusCode } = handleApiError(new NotFoundError('Incident not found.'))
      return NextResponse.json(response, { status: statusCode })
    }

    logger.info('Incident updated by admin', { incidentId: params.id, adminId: adminRow.id })
    return NextResponse.json(updated)
  } catch (error) {
    logger.error('Unexpected error patching incident', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
