/** Phone clocks drift; fixes outside the allowed window get server time instead. */
export const MAX_PAST_SKEW_MS = 5 * 60 * 1000
export const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000

/**
 * Returns the ISO `recorded_at` to store for a phone fix: the phone's own
 * time when it falls in `[earliestMs, latestMs]`, otherwise `serverIso`.
 */
export function stampRecordedAt(
  raw: string,
  earliestMs: number,
  latestMs: number,
  serverIso: string
): { iso: string; restamped: boolean } {
  const t = new Date(raw).getTime()
  if (Number.isFinite(t) && t >= earliestMs && t <= latestMs) {
    return { iso: new Date(t).toISOString(), restamped: false }
  }
  return { iso: serverIso, restamped: true }
}
