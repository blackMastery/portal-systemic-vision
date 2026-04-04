export const APP_VERSION_STRING_REGEX = /^\d+(\.\d+)*$/
export const APP_BUILD_STRING_REGEX = /^\d+$/

export function isValidAppVersionString(value: string): boolean {
  return APP_VERSION_STRING_REGEX.test(value.trim())
}

export function isValidBuildString(value: string): boolean {
  return APP_BUILD_STRING_REGEX.test(value.trim())
}

export function parseBuildNumber(value: string): number | null {
  const t = value.trim()
  if (!APP_BUILD_STRING_REGEX.test(t)) return null
  return parseInt(t, 10)
}
