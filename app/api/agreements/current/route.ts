import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { getCurrentPublishedVersion } from '@/lib/agreements'
import { agreementAudienceParamSchema, validate } from '@/lib/validation'
import type { AgreementAudience } from '@/types/database'

export const dynamic = 'force-dynamic'

function parseAudience(
  sp: URLSearchParams
): { ok: true; audience: AgreementAudience } | { ok: false; message: string } {
  const raw = sp.get('audience')
  if (!raw) {
    return { ok: false, message: 'Query parameter audience is required (driver or rider).' }
  }
  try {
    const audience = validate(agreementAudienceParamSchema, raw) as AgreementAudience
    return { ok: true, audience }
  } catch {
    return { ok: false, message: 'audience must be "driver" or "rider".' }
  }
}

export async function GET(request: NextRequest) {
  try {
    const gate = await resolveUserFromBearerRequest(request)
    if (!gate.ok) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Missing or invalid Authorization: Bearer <token>.')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (!gate.user.is_active) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('User account is inactive.')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (gate.user.role === 'admin') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('This endpoint is for driver and rider accounts only.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const aud = parseAudience(request.nextUrl.searchParams)
    if (!aud.ok) {
      const { response, statusCode } = handleApiError(
        new ValidationError(aud.message, 'VALIDATION_ERROR')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (gate.user.role !== aud.audience) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('The audience does not match your account role.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const db = createServiceRoleClient()
    const { data: current, error } = await getCurrentPublishedVersion(db, aud.audience)
    if (error) {
      const { response, statusCode } = handleApiError(error)
      return NextResponse.json(response, { status: statusCode })
    }
    if (!current?.id) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('No published agreement is available for this app yet.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    return NextResponse.json({
      id: current.id,
      version_label: current.version_label,
      title: current.title,
      body: current.body,
      content_sha256: current.content_sha256,
      published_at: current.published_at,
    })
  } catch (error) {
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
