/** Small numeric helpers shared by the analytics charts. */

/** Arithmetic mean; 0 for an empty list so callers can render a card without guarding. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Linear-interpolated percentile (`p` in 0..1) over an unsorted list.
 * Returns 0 for an empty list.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * Math.min(Math.max(p, 0), 1)
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower)
}

export function median(values: number[]): number {
  return percentile(values, 0.5)
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * PostgREST types many-to-one embeds as arrays in some client/generator
 * combinations and as objects in others; normalise both to the single row.
 */
export function embeddedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/** Descending count map -> chart rows, keeping the top `limit` entries. */
export function topEntries(
  counts: Record<string, number>,
  limit: number
): { label: string; value: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}
