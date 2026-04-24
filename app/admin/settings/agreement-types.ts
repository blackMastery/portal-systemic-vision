import type { AgreementAudience } from '@/types/database'

export type AgreementVersionRow = {
  id: string
  audience: AgreementAudience
  version_label: string
  title: string
  body: string
  content_sha256: string | null
  published_at: string | null
  created_at: string
}

export type AgreementAcceptanceListRow = {
  id: string
  user_id: string
  accepted_at: string
  full_name: string
  phone_number: string
  audience: AgreementAudience
  version_label: string
  version_title: string
  pdf_storage_path: string | null
}

export type GetAgreementVersionsResult =
  | { ok: true; versions: AgreementVersionRow[] }
  | { ok: false; error: string }

export type PublishAgreementResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type SetVersionPublishedStateResult = PublishAgreementResult

export type ListAcceptancesResult =
  | { ok: true; rows: AgreementAcceptanceListRow[]; total: number }
  | { ok: false; error: string }

export type SignedPdfResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string }
