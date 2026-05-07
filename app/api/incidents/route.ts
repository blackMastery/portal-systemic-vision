import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { validate, createIncidentFieldsSchema, incidentStatusSchema } from '@/lib/validation'
import { assertUserIsTripParticipant } from '@/lib/incidents/verify-trip-participant'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

const MAX_EVIDENCE_FILES = 5
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

function allowedEvidenceMime(type: string): boolean {
  if (!type) return false
  if (type.startsWith('image/')) return true
  if (type === 'video/mp4' || type === 'video/quicktime') return true
  return false
}

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200)
}

function formString(v: FormDataEntryValue | null): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return ''
}

function parseReporterRole(
  rawRole: string
): Database['public']['Tables']['incidents']['Insert']['reporter_role'] | null {
  if (!rawRole) return null
  if (rawRole === 'driver' || rawRole === 'rider') return rawRole
  return null
}

export async function POST(request: NextRequest) {
  let insertedIncidentId: string | null = null
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
        new AuthenticationError(msg, resolved.error.toUpperCase()),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { user } = resolved
    if (!user.is_active) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('User account is inactive.'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (user.role !== 'driver' && user.role !== 'rider') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Only drivers and riders can file incident reports.'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      const { response, statusCode } = handleApiError(
        new ValidationError('Content-Type must be multipart/form-data.', 'INVALID_CONTENT_TYPE'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (e) {
      logger.error('Failed to parse multipart body', e)
      const { response, statusCode } = handleApiError(
        new ValidationError('Invalid multipart body.', 'INVALID_BODY'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const fields = validate(createIncidentFieldsSchema, {
      category: formString(formData.get('category')),
      trip_id: formString(formData.get('trip_id')) || undefined,
      description: formString(formData.get('description')),
      subject_user_id: formString(formData.get('subject_user_id')) || undefined,
    })

    const requestedRoleRaw = formString(formData.get('role')).trim().toLowerCase()
    const requestedRole = parseReporterRole(requestedRoleRaw)
    if (requestedRoleRaw && !requestedRole) {
      const { response, statusCode } = handleApiError(
        new ValidationError('role must be either "driver" or "rider".', 'INVALID_ROLE'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const reporterRole: Database['public']['Tables']['incidents']['Insert']['reporter_role'] =
      requestedRole ?? (user.role === 'driver' ? 'driver' : 'rider')

    const evidenceEntries = formData.getAll('evidence').filter((e): e is File => e instanceof File)
    if (evidenceEntries.length > MAX_EVIDENCE_FILES) {
      const { response, statusCode } = handleApiError(
        new ValidationError(`At most ${MAX_EVIDENCE_FILES} evidence files allowed.`, 'TOO_MANY_FILES'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    for (const f of evidenceEntries) {
      if (f.size > MAX_EVIDENCE_BYTES) {
        const { response, statusCode } = handleApiError(
          new ValidationError('Each evidence file must be 10MB or smaller.', 'FILE_TOO_LARGE'),
        )
        return NextResponse.json(response, { status: statusCode })
      }
      if (!allowedEvidenceMime(f.type)) {
        const { response, statusCode } = handleApiError(
          new ValidationError(
            'Evidence must be an image or video/mp4 or video/quicktime.',
            'INVALID_FILE_TYPE',
          ),
        )
        return NextResponse.json(response, { status: statusCode })
      }
    }

    const service = createServiceRoleClient()

    if (fields.trip_id) {
      const ok = await assertUserIsTripParticipant(
        service,
        fields.trip_id,
        user.id,
        reporterRole,
      )
      if (!ok) {
        const { response, statusCode } = handleApiError(
          new NotFoundError('Trip not found or you are not a participant on this trip.'),
        )
        return NextResponse.json(response, { status: statusCode })
      }
    }

    const insertRow: Database['public']['Tables']['incidents']['Insert'] = {
      trip_id: fields.trip_id ?? null,
      reporter_user_id: user.id,
      reporter_role: reporterRole,
      subject_user_id: fields.subject_user_id ?? null,
      category: fields.category,
      description: fields.description.trim(),
    }

    const { data: inserted, error: insertError } = await service
      .from('incidents')
      .insert(insertRow)
      .select()
      .single()

    if (insertError || !inserted) {
      logger.error('Failed to insert incident', insertError)
      const { response, statusCode } = handleApiError(insertError ?? new Error('Insert failed'))
      return NextResponse.json(response, { status: statusCode })
    }

    insertedIncidentId = inserted.id
    const paths: string[] = []

    for (const file of evidenceEntries) {
      const buf = Buffer.from(await file.arrayBuffer())
      const objectPath = `${user.id}/${inserted.id}/${randomUUID()}-${safeFileName(file.name)}`
      const { error: upErr } = await service.storage
        .from('incident_evidence')
        .upload(objectPath, buf, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
      if (upErr) {
        logger.error('Evidence upload failed', upErr, { incidentId: inserted.id })
        await service.from('incidents').delete().eq('id', inserted.id)
        const { response, statusCode } = handleApiError(
          new Error('Failed to upload evidence. Please try again.'),
        )
        return NextResponse.json(response, { status: statusCode })
      }
      paths.push(objectPath)
    }

    if (paths.length > 0) {
      const { error: pathErr } = await service
        .from('incidents')
        .update({ evidence_paths: paths })
        .eq('id', inserted.id)

      if (pathErr) {
        logger.error('Failed to update evidence_paths', pathErr, { incidentId: inserted.id })
        for (const p of paths) {
          await service.storage.from('incident_evidence').remove([p])
        }
        await service.from('incidents').delete().eq('id', inserted.id)
        const { response, statusCode } = handleApiError(pathErr)
        return NextResponse.json(response, { status: statusCode })
      }
    }

    const { data: finalRow, error: fetchErr } = await service
      .from('incidents')
      .select()
      .eq('id', inserted.id)
      .single()

    if (fetchErr || !finalRow) {
      logger.warn('Incident created but final fetch failed', { error: fetchErr, id: inserted.id })
      return NextResponse.json(inserted, { status: 201 })
    }

    logger.info('Incident created', { incidentId: finalRow.id, reporter: user.id })
    return NextResponse.json(finalRow, { status: 201 })
  } catch (error) {
    if (insertedIncidentId) {
      try {
        const svc = createServiceRoleClient()
        await svc.from('incidents').delete().eq('id', insertedIncidentId)
      } catch (e) {
        logger.warn('Failed to rollback incident after error', { insertedIncidentId, e })
      }
    }
    logger.error('Unexpected error creating incident', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}

export async function GET(request: NextRequest) {
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
        new AuthenticationError(msg, resolved.error.toUpperCase()),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { supabase } = resolved
    const { searchParams } = new URL(request.url)
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0)
    const limitRaw = parseInt(searchParams.get('limit') || '20', 10) || 20
    const limit = Math.min(100, Math.max(1, limitRaw))
    const from = page * limit
    const to = from + limit - 1

    const statusParam = searchParams.get('status')
    let query = supabase
      .from('incidents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusParam && statusParam !== 'all') {
      const parsed = incidentStatusSchema.safeParse(statusParam)
      if (parsed.success) {
        query = query.eq('status', parsed.data)
      }
    }

    const { data, error, count } = await query

    if (error) {
      const { response, statusCode } = handleApiError(error)
      return NextResponse.json(response, { status: statusCode })
    }

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      page,
      limit,
    })
  } catch (error) {
    logger.error('Unexpected error listing incidents', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
