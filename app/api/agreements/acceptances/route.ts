import { NextRequest, NextResponse } from 'next/server'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/errors'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { AGREEMENT_PDFS_BUCKET } from '@/lib/agreements'
import { agreementAudienceParamSchema, validate } from '@/lib/validation'
import { logger } from '@/lib/logger'
import type { AgreementAudience } from '@/types/database'

export const dynamic = 'force-dynamic'

/** Short-lived signed URLs for the user to open their own PDFs from the app. */
const PDF_SIGNED_URL_SECS = 300

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

    const aud = parseAudience(request.nextUrl.searchParams)
    if (!aud.ok) {
      const { response, statusCode } = handleApiError(
        new ValidationError(aud.message, 'VALIDATION_ERROR')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const db = createServiceRoleClient()
    const { data: versionRows, error: vErr } = await db
      .from('agreement_versions')
      .select('id')
      .eq('audience', aud.audience)
    if (vErr) {
      const { response, statusCode } = handleApiError(vErr)
      return NextResponse.json(response, { status: statusCode })
    }
    const versionIds = (versionRows ?? []).map((r) => r.id)
    if (versionIds.length === 0) {
      return NextResponse.json({ rows: [] })
    }

    const { data: acceptances, error } = await db
      .from('agreement_acceptances')
      .select('id, agreement_version_id, accepted_at, content_sha256, pdf_storage_path')
      .eq('user_id', gate.user.id)
      .in('agreement_version_id', versionIds)
      .order('accepted_at', { ascending: false })

    if (error) {
      const { response, statusCode } = handleApiError(error)
      return NextResponse.json(response, { status: statusCode })
    }

    const list = acceptances ?? []
    const uniqueVersionIds = [...new Set(list.map((r) => r.agreement_version_id))]
    const versionMeta = new Map<
      string,
      { audience: AgreementAudience; version_label: string; title: string }
    >()
    if (uniqueVersionIds.length > 0) {
      const { data: versions, error: verErr } = await db
        .from('agreement_versions')
        .select('id, audience, version_label, title')
        .in('id', uniqueVersionIds)
      if (verErr) {
        const { response, statusCode } = handleApiError(verErr)
        return NextResponse.json(response, { status: statusCode })
      }
      for (const v of versions ?? []) {
        versionMeta.set(v.id, {
          audience: v.audience as AgreementAudience,
          version_label: v.version_label,
          title: v.title,
        })
      }
    }

    const rows = await Promise.all(
      list.map(async (r) => {
        const v = versionMeta.get(r.agreement_version_id)
        const audience = v?.audience ?? aud.audience
        const versionLabel = v?.version_label ?? ''
        const versionTitle = v?.title ?? ''

        let pdfUrl: string | null = null
        if (r.pdf_storage_path) {
          const { data: urlData, error: uErr } = await db.storage
            .from(AGREEMENT_PDFS_BUCKET)
            .createSignedUrl(r.pdf_storage_path, PDF_SIGNED_URL_SECS)
          if (uErr || !urlData?.signedUrl) {
            logger.warn('agreement acceptances: signed url failed', {
              uErr,
              acceptanceId: r.id,
            })
          } else {
            pdfUrl = urlData.signedUrl
          }
        }

        return {
          id: r.id,
          agreement_version_id: r.agreement_version_id,
          audience,
          version_label: versionLabel,
          version_title: versionTitle,
          accepted_at: r.accepted_at,
          content_sha256: r.content_sha256,
          pdf_storage_path: r.pdf_storage_path,
          pdf_url: pdfUrl,
        }
      })
    )

    return NextResponse.json({ rows })
  } catch (error) {
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
