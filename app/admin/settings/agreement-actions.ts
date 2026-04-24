'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { sha256Hex, AGREEMENT_PDFS_BUCKET } from '@/lib/agreements'
import type { Database, AgreementAudience } from '@/types/database'
import type {
  AgreementAcceptanceListRow,
  AgreementVersionRow,
  GetAgreementVersionsResult,
  ListAcceptancesResult,
  PublishAgreementResult,
  SetVersionPublishedStateResult,
  SignedPdfResult,
} from './agreement-types'

function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(): Promise<
  | { ok: true; db: ReturnType<typeof createServiceClient>; adminUserId: string }
  | { ok: false; error: string }
> {
  const authClient = createServerActionClient({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { ok: false, error: 'Not authenticated' }
  }

  const db = createServiceClient()
  const { data: userRow, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('auth_id', authUser.id)
    .single()

  if (userError || !userRow || userRow.role !== 'admin') {
    return { ok: false, error: 'Only administrators can manage agreements.' }
  }

  return { ok: true, db, adminUserId: userRow.id }
}

export async function getAgreementVersions(
  audience: AgreementAudience
): Promise<GetAgreementVersionsResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data, error } = await gate.db
    .from('agreement_versions')
    .select(
      'id, audience, version_label, title, body, content_sha256, published_at, created_at'
    )
    .eq('audience', audience)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('getAgreementVersions failed', { error, audience })
    return { ok: false, error: 'Failed to load agreement versions.' }
  }

  return { ok: true, versions: (data ?? []) as AgreementVersionRow[] }
}

export type PublishAgreementInput = {
  audience: AgreementAudience
  version_label: string
  title: string
  body: string
  asDraft: boolean
}

export async function publishOrSaveAgreement(
  input: PublishAgreementInput
): Promise<PublishAgreementResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const versionLabel = input.version_label.trim()
  const title = input.title.trim()
  const body = input.body
  if (!versionLabel) {
    return { ok: false, error: 'Version label is required.' }
  }
  if (!title) {
    return { ok: false, error: 'Title is required.' }
  }
  if (!body.trim()) {
    return { ok: false, error: 'Agreement text is required.' }
  }

  const now = new Date().toISOString()
  const contentSha = input.asDraft ? null : sha256Hex(body)
  const publishedAt = input.asDraft ? null : now

  const { data: inserted, error } = await gate.db
    .from('agreement_versions')
    .insert({
      audience: input.audience,
      version_label: versionLabel,
      title,
      body,
      content_sha256: contentSha,
      published_at: publishedAt,
      created_by: gate.adminUserId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: `A version with label "${versionLabel}" already exists for this role.`,
      }
    }
    logger.error('publishOrSaveAgreement failed', { error })
    return { ok: false, error: 'Failed to save agreement. Try again.' }
  }

  logger.info('Agreement version saved', {
    id: inserted.id,
    audience: input.audience,
    asDraft: input.asDraft,
  })
  return { ok: true, id: inserted.id }
}

/**
 * Publish an existing version (e.g. draft) or unpublish a published one.
 * Unpublishing sets the row back to draft; the API then treats the latest remaining published row as "current", if any.
 */
export async function setAgreementVersionPublishedState(
  versionId: string,
  published: boolean
): Promise<SetVersionPublishedStateResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data: row, error: fetchError } = await gate.db
    .from('agreement_versions')
    .select('id, body')
    .eq('id', versionId)
    .single()

  if (fetchError || !row) {
    return { ok: false, error: 'Agreement version not found.' }
  }

  const now = new Date().toISOString()
  if (published) {
    if (!row.body?.trim()) {
      return { ok: false, error: 'Cannot publish an empty agreement body.' }
    }
    const contentSha = sha256Hex(row.body)
    const { error: upError } = await gate.db
      .from('agreement_versions')
      .update({
        content_sha256: contentSha,
        published_at: now,
      })
      .eq('id', versionId)
    if (upError) {
      logger.error('setAgreementVersionPublishedState publish failed', { upError, versionId })
      return { ok: false, error: 'Failed to publish. Try again.' }
    }
    logger.info('Agreement version published', { versionId })
    return { ok: true, id: versionId }
  }

  const { error: upError } = await gate.db
    .from('agreement_versions')
    .update({
      content_sha256: null,
      published_at: null,
    })
    .eq('id', versionId)

  if (upError) {
    logger.error('setAgreementVersionPublishedState unpublish failed', { upError, versionId })
    return { ok: false, error: 'Failed to unpublish. Try again.' }
  }
  logger.info('Agreement version unpublished (draft)', { versionId })
  return { ok: true, id: versionId }
}

export type ListAcceptancesInput = {
  audience: AgreementAudience | 'all'
  search?: string
  fromDate?: string
  toDate?: string
  page: number
  pageSize: number
}

async function buildUserIdFilterFromSearch(
  db: ReturnType<typeof createServiceClient>,
  search: string
): Promise<string[] | null> {
  const s = search.trim()
  if (!s) {
    return null
  }
  const pat = `%${s.replace(/([%_\\])/g, '\\$1')}%`
  const { data: n } = await db
    .from('users')
    .select('id')
    .ilike('full_name', pat)
  const { data: p } = await db
    .from('users')
    .select('id')
    .ilike('phone_number', pat)
  const idSet = new Set<string>([
    ...(n ?? []).map((r) => r.id),
    ...(p ?? []).map((r) => r.id),
  ])
  if (idSet.size === 0) {
    return []
  }
  return Array.from(idSet)
}

function endOfDayIso(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d
  }
  return `${d}T23:59:59.999Z`
}

export async function listAgreementAcceptances(
  input: ListAcceptancesInput
): Promise<ListAcceptancesResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }
  const db = gate.db

  let versionIds: string[] | null = null
  if (input.audience !== 'all') {
    const { data: vs } = await db
      .from('agreement_versions')
      .select('id')
      .eq('audience', input.audience)
    versionIds = (vs ?? []).map((v) => v.id)
    if (versionIds.length === 0) {
      return { ok: true, rows: [], total: 0 }
    }
  }

  const userFilter = input.search
    ? await buildUserIdFilterFromSearch(db, input.search)
    : null
  if (userFilter && userFilter.length === 0) {
    return { ok: true, rows: [], total: 0 }
  }

  const from = input.page * input.pageSize
  const to = from + input.pageSize - 1

  const base = () => {
    let q = db
      .from('agreement_acceptances')
      .select(
        `
        id,
        user_id,
        accepted_at,
        pdf_storage_path,
        users ( full_name, phone_number ),
        agreement_versions ( audience, version_label, title )
      `,
        { count: 'exact' }
      )
      .order('accepted_at', { ascending: false })
    if (versionIds) {
      q = q.in('agreement_version_id', versionIds)
    }
    if (userFilter) {
      q = q.in('user_id', userFilter)
    }
    if (input.fromDate) {
      q = q.gte('accepted_at', `${input.fromDate}T00:00:00.000Z`)
    }
    if (input.toDate) {
      q = q.lte('accepted_at', endOfDayIso(input.toDate))
    }
    return q
  }

  const { data, error, count } = await base().range(from, to)

  if (error) {
    logger.error('listAgreementAcceptances failed', { error })
    return { ok: false, error: 'Failed to load acceptances.' }
  }

  return { ok: true, rows: mapAcceptanceRows(data), total: count ?? 0 }
}

function mapAcceptanceRows(data: unknown): AgreementAcceptanceListRow[] {
  if (!Array.isArray(data)) {
    return []
  }
  const rows: AgreementAcceptanceListRow[] = []
  for (const r of data) {
    if (!r || typeof r !== 'object') {
      continue
    }
    const o = r as Record<string, unknown>
    const rawU = o.users
    const rawV = o.agreement_versions
    const u = Array.isArray(rawU) ? rawU[0] : rawU
    const v = Array.isArray(rawV) ? rawV[0] : rawV
    const uo =
      u && typeof u === 'object' && !Array.isArray(u) ? (u as Record<string, string>) : null
    const vo =
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : null
    if (!uo || !vo) {
      continue
    }
    rows.push({
      id: o.id as string,
      user_id: o.user_id as string,
      accepted_at: o.accepted_at as string,
      full_name: uo.full_name ?? '',
      phone_number: uo.phone_number ?? '',
      audience: vo.audience as AgreementAudience,
      version_label: vo.version_label ?? '',
      version_title: vo.title ?? '',
      pdf_storage_path: (o.pdf_storage_path as string) ?? null,
    })
  }
  return rows
}

const SIGNED_URL_SECS = 60

export async function getAgreementAcceptanceDownloadUrl(
  acceptanceId: string
): Promise<SignedPdfResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { data: row, error } = await gate.db
    .from('agreement_acceptances')
    .select('pdf_storage_path, id')
    .eq('id', acceptanceId)
    .single()

  if (error || !row?.pdf_storage_path) {
    return { ok: false, error: 'PDF not found for this acceptance.' }
  }

  const { data: urlData, error: uErr } = await gate.db.storage
    .from(AGREEMENT_PDFS_BUCKET)
    .createSignedUrl(row.pdf_storage_path, SIGNED_URL_SECS)

  if (uErr || !urlData?.signedUrl) {
    logger.error('getAgreementAcceptanceDownloadUrl signed url failed', { uErr })
    return { ok: false, error: 'Could not create download link.' }
  }

  return {
    ok: true,
    url: urlData.signedUrl,
    filename: `agreement-${row.id}.pdf`,
  }
}
