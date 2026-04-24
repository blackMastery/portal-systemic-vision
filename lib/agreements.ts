import { createHash } from 'crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, AgreementAudience, UserRole } from '@/types/database'

/**
 * Agreement gating (see `supabase/migrations/20260423140000_agreement_management.sql` header).
 *
 * The flag `requires_acceptance` returned by `GET /api/agreements/status` is not a database column.
 * It is derived by comparing the *current* published `agreement_versions` row (for the audience) to
 * `agreement_acceptances`: the user must have a row for that `agreement_version_id`. At most one
 * acceptance per (user, version) is allowed by the unique constraint.
 */
export const AGREEMENT_PDFS_BUCKET = 'agreement_pdfs' as const

type Db = SupabaseClient<Database>

export function sha256Hex(utf8: string): string {
  return createHash('sha256').update(utf8, 'utf8').digest('hex')
}

function wrapToLines(text: string, maxChars: number): string[] {
  const out: string[] = []
  const paragraphs = text.split(/\r?\n/)
  for (const para of paragraphs) {
    if (para.length === 0) {
      out.push('')
      continue
    }
    let rest = para
    while (rest.length > 0) {
      if (rest.length <= maxChars) {
        out.push(rest)
        break
      }
      let slice = rest.slice(0, maxChars)
      const lastSpace = slice.lastIndexOf(' ')
      if (lastSpace > 20) {
        slice = rest.slice(0, lastSpace)
        rest = rest.slice(lastSpace + 1)
      } else {
        const chunk = rest.slice(0, maxChars)
        rest = rest.slice(maxChars)
        slice = chunk
      }
      out.push(slice)
    }
  }
  return out
}

/**
 * The "current" published version for gating: latest row for `audience` with `published_at` set,
 * ordered by `published_at` then `created_at` (see migration header).
 */
export async function getCurrentPublishedVersion(db: Db, audience: AgreementAudience) {
  const { data, error } = await db
    .from('agreement_versions')
    .select('id, audience, version_label, title, body, content_sha256, published_at, created_at')
    .eq('audience', audience)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return { data: null as (typeof data), error }
  }
  return { data, error: null as null }
}

/**
 * Whether the user has an acceptance row for a specific `agreement_version_id` (at most one per user + version).
 * Used to set `requires_acceptance` in the status API: false if this returns true for the current version id.
 */
export async function hasUserAcceptedVersion(
  db: Db,
  userId: string,
  versionId: string
): Promise<boolean> {
  const { data, error } = await db
    .from('agreement_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('agreement_version_id', versionId)
    .maybeSingle()
  if (error) {
    return false
  }
  return data != null
}

/**
 * If the user is a driver or rider, they must have accepted the latest published agreement for that role.
 * Admin and missing published versions are treated as no gate (ok).
 * Call from protected API routes (e.g. trip creation) when you want the server to enforce re-acceptance
 * after admins publish a new version.
 */
export async function assertCurrentAgreementAccepted(
  db: Db,
  userId: string,
  role: UserRole
): Promise<
  { ok: true } | { ok: false; code: 'AGREEMENT_REQUIRED' }
> {
  if (role !== 'driver' && role !== 'rider') {
    return { ok: true }
  }
  const { data: current } = await getCurrentPublishedVersion(db, role)
  if (!current?.id) {
    return { ok: true }
  }
  const accepted = await hasUserAcceptedVersion(db, userId, current.id)
  if (!accepted) {
    return { ok: false, code: 'AGREEMENT_REQUIRED' }
  }
  return { ok: true }
}

/**
 * True when `version` row is the current published version for its audience.
 */
export async function isVersionCurrentlyPublished(
  db: Db,
  versionId: string
): Promise<boolean> {
  const { data: version, error: vError } = await db
    .from('agreement_versions')
    .select('id, audience, published_at')
    .eq('id', versionId)
    .maybeSingle()
  if (vError || !version?.published_at) {
    return false
  }
  const { data: current } = await getCurrentPublishedVersion(
    db,
    version.audience as AgreementAudience
  )
  return current?.id === version.id
}

/**
 * Most recent `agreement_acceptances` row for this user among versions in the audience (any version).
 * Used for `last_accepted_at` / `last_accepted_version_id` in the status API; not the source of
 * `requires_acceptance` (that uses {@link hasUserAcceptedVersion} against the *current* version only).
 */
export async function getLastAcceptanceForAudience(
  db: Db,
  userId: string,
  audience: AgreementAudience
): Promise<{
  agreement_version_id: string
  accepted_at: string
} | null> {
  const { data: versionRows } = await db
    .from('agreement_versions')
    .select('id')
    .eq('audience', audience)
  const ids = (versionRows ?? []).map((r) => r.id)
  if (ids.length === 0) {
    return null
  }
  const { data, error } = await db
    .from('agreement_acceptances')
    .select('agreement_version_id, accepted_at')
    .eq('user_id', userId)
    .in('agreement_version_id', ids)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return {
    agreement_version_id: data.agreement_version_id,
    accepted_at: data.accepted_at,
  }
}

export async function buildAgreementAcceptancePdf(input: {
  title: string
  versionLabel: string
  body: string
  userFullName: string
  userId: string
  acceptedAtIso: string
  contentSha256: string
}): Promise<Uint8Array> {
  const bodySize = 10
  const lineH = 12
  const margin = 48
  const maxChars = 90

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pageW = 595.28
  const pageH = 841.89

  const lineStrings: { text: string; size: number; f: typeof font }[] = [
    { text: input.title, size: 14, f: bold },
    { text: `Version: ${input.versionLabel}`, size: bodySize, f: font },
    { text: `Accepted at (UTC): ${input.acceptedAtIso}`, size: bodySize, f: font },
    { text: `User: ${input.userFullName} (${input.userId})`, size: bodySize, f: font },
    { text: `Content SHA-256: ${input.contentSha256}`, size: 9, f: font },
    { text: '', size: 6, f: font },
    { text: 'Agreement text', size: 11, f: bold },
  ]
  for (const l of wrapToLines(input.body, maxChars)) {
    lineStrings.push({ text: l, size: bodySize, f: font })
  }

  let page = doc.addPage([pageW, pageH])
  let y = pageH - margin

  for (const line of lineStrings) {
    if (line.text === '') {
      y -= 6
      continue
    }
    if (y < margin + lineH) {
      page = doc.addPage([pageW, pageH])
      y = pageH - margin
    }
    page.drawText(line.text, {
      x: margin,
      y: y - line.size,
      size: line.size,
      font: line.f,
      color: rgb(0, 0, 0),
    })
    y -= lineH
  }

  return doc.save()
}
