import type { AppVersionAppType, AppVersionPlatform } from '@/types/database'

/** Display order and labels for Admin → Settings (mobile app versions). */
export const APP_VERSION_UI_ROWS: {
  app_type: AppVersionAppType
  platform: AppVersionPlatform
  label: string
}[] = [
  { app_type: 'driver', platform: 'ios', label: 'Driver · iOS' },
  { app_type: 'driver', platform: 'android', label: 'Driver · Android' },
  { app_type: 'rider', platform: 'ios', label: 'Rider · iOS' },
  { app_type: 'rider', platform: 'android', label: 'Rider · Android' },
]

export const APP_VERSION_ROW_ORDER = APP_VERSION_UI_ROWS.map(({ app_type, platform }) => ({
  app_type,
  platform,
}))
