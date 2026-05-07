import { NextRequest, NextResponse } from 'next/server'
import {
  handleApiError,
  AuthenticationError,
  NotFoundError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { logger } from '@/lib/logger'

const SIGNED_URL_TTL = 60 * 60 // 60 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

    const { supabase, user } = resolved
    const incidentId = params.id

    const { data: row, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', incidentId)
      .maybeSingle()

    if (error) {
      const { response, statusCode } = handleApiError(error)
      return NextResponse.json(response, { status: statusCode })
    }

    if (!row || row.reporter_user_id !== user.id) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('Incident not found.'),
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const evidenceSignedUrls: Record<string, string> = {}
    if (row.evidence_paths?.length) {
      const service = createServiceRoleClient()
      for (const path of row.evidence_paths) {
        const { data: signed, error: signErr } = await service.storage
          .from('incident_evidence')
          .createSignedUrl(path, SIGNED_URL_TTL)
        if (!signErr && signed?.signedUrl) {
          evidenceSignedUrls[path] = signed.signedUrl
        } else {
          logger.warn('Failed to sign evidence URL', { path, error: signErr })
        }
      }
    }

    return NextResponse.json({
      ...row,
      evidence_signed_urls: evidenceSignedUrls,
    })
  } catch (error) {
    logger.error('Unexpected error fetching incident', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
