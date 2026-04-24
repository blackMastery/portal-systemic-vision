import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-service'
import {
  buildAgreementAcceptancePdf,
  AGREEMENT_PDFS_BUCKET,
  hasUserAcceptedVersion,
  isVersionCurrentlyPublished,
  sha256Hex,
} from '@/lib/agreements'
import { getClientIp, resolveUserFromBearerRequest } from '@/lib/bearer-api'
import { logger } from '@/lib/logger'
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors'
import { agreementAcceptBodySchema, validate } from '@/lib/validation'
import type { Json } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const db = createServiceRoleClient()
  let insertedAcceptanceId: string | null = null
  let insertedPath: string | null = null
  const userAgent = request.headers.get('user-agent')
  const ip = getClientIp(request)

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
    if (gate.user.role !== 'driver' && gate.user.role !== 'rider') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('This endpoint is for driver and rider accounts only.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    const parsed = validate(agreementAcceptBodySchema, body)
    const deviceJson: Json | null =
      parsed.device != null
        ? (JSON.parse(JSON.stringify(parsed.device)) as Json)
        : null

    const { data: version, error: vError } = await db
      .from('agreement_versions')
      .select('id, audience, version_label, title, body, content_sha256, published_at')
      .eq('id', parsed.agreement_version_id)
      .maybeSingle()

    if (vError) {
      const { response, statusCode } = handleApiError(vError)
      return NextResponse.json(response, { status: statusCode })
    }
    if (!version?.published_at) {
      const { response, statusCode } = handleApiError(
        new NotFoundError('Agreement version not found or is not published.')
      )
      return NextResponse.json(response, { status: statusCode })
    }
    if (version.audience !== gate.user.role) {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('This agreement is not for your account type.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const currentOk = await isVersionCurrentlyPublished(db, version.id)
    if (!currentOk) {
      const { response, statusCode } = handleApiError(
        new ConflictError(
          'A newer agreement is available. Open the current agreement and accept the latest version.',
          'AGREEMENT_STALE'
        )
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const already = await hasUserAcceptedVersion(db, gate.user.id, version.id)
    if (already) {
      const { response, statusCode } = handleApiError(
        new ConflictError('You have already accepted this agreement version.', 'ALREADY_ACCEPTED')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const effectiveHash = version.content_sha256 ?? sha256Hex(version.body)

    const { data: inserted, error: insError } = await db
      .from('agreement_acceptances')
      .insert({
        user_id: gate.user.id,
        agreement_version_id: version.id,
        ip_address: ip,
        user_agent: userAgent,
        device: deviceJson,
        content_sha256: effectiveHash,
        pdf_storage_path: null,
      })
      .select('id, accepted_at')
      .single()

    if (insError || !inserted) {
      const { response, statusCode } = handleApiError(insError ?? new Error('Insert failed'))
      return NextResponse.json(response, { status: statusCode })
    }

    insertedAcceptanceId = inserted.id
    const acceptedAtIso = inserted.accepted_at

    const pdfBytes = await buildAgreementAcceptancePdf({
      title: version.title,
      versionLabel: version.version_label,
      body: version.body,
      userFullName: gate.user.full_name,
      userId: gate.user.id,
      acceptedAtIso,
      contentSha256: effectiveHash,
    })

    const path = `${gate.user.id}/${inserted.id}.pdf`
    insertedPath = path

    const { error: upError } = await db.storage
      .from(AGREEMENT_PDFS_BUCKET)
      .upload(path, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (upError) {
      await db.from('agreement_acceptances').delete().eq('id', inserted.id)
      logger.error('Agreement PDF upload failed; rolled back acceptance row', { upError, path })
      const { response, statusCode } = handleApiError(
        new Error('Failed to store agreement PDF. Please try again.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { error: updError } = await db
      .from('agreement_acceptances')
      .update({ pdf_storage_path: path })
      .eq('id', inserted.id)

    if (updError) {
      await db.storage.from(AGREEMENT_PDFS_BUCKET).remove([path])
      await db.from('agreement_acceptances').delete().eq('id', inserted.id)
      logger.error('Failed to update agreement acceptance with PDF path', updError)
      const { response, statusCode } = handleApiError(
        new Error('Failed to finalize agreement. Please try again.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    return NextResponse.json({
      id: inserted.id,
      agreement_version_id: version.id,
      accepted_at: acceptedAtIso,
      content_sha256: effectiveHash,
    })
  } catch (error) {
    if (insertedAcceptanceId && insertedPath) {
      try {
        await db.storage.from(AGREEMENT_PDFS_BUCKET).remove([insertedPath])
      } catch {
        // ignore
      }
      try {
        await db.from('agreement_acceptances').delete().eq('id', insertedAcceptanceId)
      } catch {
        // ignore
      }
    } else if (insertedAcceptanceId) {
      try {
        await db.from('agreement_acceptances').delete().eq('id', insertedAcceptanceId)
      } catch {
        // ignore
      }
    }
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
