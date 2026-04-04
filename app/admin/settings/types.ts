import type { AppVersionAppType, AppVersionPlatform } from '@/types/database'

export type AppVersionConfigRow = {
  app_type: AppVersionAppType
  platform: AppVersionPlatform
  version_string: string
  build_number: number
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
}
