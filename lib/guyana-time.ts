import { parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/** Guyana local time (UTC−4, no DST). */
const GUYANA_TIMEZONE = 'America/Guyana'

/** ISO / Postgres string already ends with Z or a numeric offset (e.g. +00:00, -04:00). */
const HAS_EXPLICIT_ZONE = /(?:[zZ]|[+-]\d{2}:\d{2})$/

/** Trailing RFC3339 zone; strip then parse digits as Guyana wall (see `parseLocationHistoryRecordedAt`). */
const TRAILING_ISO_TZ = /(Z|[+-]\d{2}:?\d{2}(?::\d{2})?)$/i

/**
 * Driver apps often send **local Guyana clock** with a bogus `Z` / `+00:00` (true instant is wrong).
 * Default: reinterpret `location_history.recorded_at` that way. Set
 * `NEXT_PUBLIC_LOCATION_RECORDED_AT_AS_GUYANA_WALL=false` if your client stores **real** UTC instants.
 */
function locationHistoryRecordedAtAsGuyanaWall(): boolean {
  return process.env.NEXT_PUBLIC_LOCATION_RECORDED_AT_AS_GUYANA_WALL !== 'false'
}

/**
 * Parse timestamps from the API.
 * - With `Z` or `±HH:MM`: absolute instant (Postgres `timestamptz` / ISO).
 * - Zone-less `…T…`: civil time in **America/Guyana** (matches drivers recording local wall time
 *   without an offset; treating those as UTC would show ~4h early in Guyana).
 */
export function parseApiTimestamptz(value: string): Date {
  const t = value.trim()
  if (!t) return new Date(NaN)
  if (HAS_EXPLICIT_ZONE.test(t)) return parseISO(t)
  const normalized = t.includes('T') ? t : t.replace(' ', 'T')
  return fromZonedTime(normalized, GUYANA_TIMEZONE)
}

export function formatGuyana(date: string | Date, formatStr: string): string {
  const d = date instanceof Date ? date : parseApiTimestamptz(date)
  return formatInTimeZone(d, GUYANA_TIMEZONE, formatStr)
}

/**
 * `location_history.recorded_at` only: many mobile clients append `Z` to **local** timestamps.
 * Strips the trailing zone and interprets date/time digits as America/Guyana civil time.
 */
export function parseLocationHistoryRecordedAt(value: string): Date {
  if (!locationHistoryRecordedAtAsGuyanaWall()) {
    return parseApiTimestamptz(value)
  }
  const t = value.trim()
  if (!t) return new Date(NaN)
  const withoutTz = t.replace(TRAILING_ISO_TZ, '')
  return fromZonedTime(withoutTz, GUYANA_TIMEZONE)
}

export function formatLocationHistoryGuyana(value: string, formatStr: string): string {
  return formatInTimeZone(parseLocationHistoryRecordedAt(value), GUYANA_TIMEZONE, formatStr)
}
