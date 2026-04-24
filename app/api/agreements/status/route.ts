import { NextRequest, NextResponse } from 'next/server'
import { AuthenticationError, AuthorizationError } from '@/lib/errors'
import { handleApiError } from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import {
  getCurrentPublishedVersion,
  getLastAcceptanceForAudience,
  hasUserAcceptedVersion,
} from '@/lib/agreements'
import { agreementAudienceParamSchema, validate } from '@/lib/validation'
import type { AgreementAudience } from '@/types/database'

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
      return NextResponse.json(
        { error: aud.message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    if (gate.user.role !== aud.audience) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('The audience does not match your account role.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const db = createServiceRoleClient()
    const { data: current, error: curError } = await getCurrentPublishedVersion(
      db,
      aud.audience
    )
    if (curError) {
      const { response, statusCode } = handleApiError(curError)
      return NextResponse.json(response, { status: statusCode })
    }
    if (!current?.id) {
      return NextResponse.json({
        current_version_id: null,
        current_version_label: null,
        requires_acceptance: false,
        last_accepted_at: null,
        last_accepted_version_id: null,
      })
    }

    const accepted = await hasUserAcceptedVersion(db, gate.user.id, current.id)
    const last = await getLastAcceptanceForAudience(db, gate.user.id, aud.audience)

    return NextResponse.json({
      current_version_id: current.id,
      current_version_label: current.version_label,
      requires_acceptance: !accepted,
      last_accepted_at: last?.accepted_at ?? null,
      last_accepted_version_id: last?.agreement_version_id ?? null,
    })
  } catch (error) {
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
