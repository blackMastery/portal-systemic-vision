import type { AppVersionAppType, AppVersionPlatform } from '@/types/database'

export type AppVersionConfigRow = {
  app_type: AppVersionAppType
  platform: AppVersionPlatform
  version_string: string
  build_number: number
  mandatory_update: boolean
  updated_at: string
}

export type GetAppVersionConfigResult =
  | { ok: true; rows: AppVersionConfigRow[] }
  | { ok: false; error: string }

export type UpdateAppVersionConfigResult =
  | { ok: true }
  | { ok: false; error: string }

export type AppVersionConfigInput = {
  app_type: AppVersionAppType
  platform: AppVersionPlatform
  version_string: string
  build_number: string
  mandatory_update: boolean
}

export type GetTripRequestsConfigResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string }

export type SetTripRequestsEnabledResult =
  | { ok: true }
  | { ok: false; error: string }

export type PanicSettings = {
  enabled: boolean
  /** E.164 support numbers that receive the alert SMS. */
  numbers: string[]
  /** Human-friendly number shown on the tracking page / in SMS. */
  display: string
  testMode: boolean
  testNumber: string | null
  /** Env forces test mode on (DB cannot turn it off). */
  envTestModeForced: boolean
  twilioConfigured: boolean
}

export type PanicSettingsInput = {
  enabled: boolean
  numbers: string[]
  display: string
  testMode: boolean
  testNumber: string | null
}

export type GetPanicSettingsResult =
  | { ok: true; settings: PanicSettings }
  | { ok: false; error: string }

export type SetPanicSettingsResult =
  | { ok: true; settings: PanicSettings }
  | { ok: false; error: string }

export type SendPanicTestSmsResult =
  | { ok: true; sid: string; to: string }
  | { ok: false; error: string }
