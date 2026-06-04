/**
 * Humanize an enum-style status/type value for display.
 * e.g. "picked_up" -> "Picked Up", "short_drop" -> "Short Drop", "pending" -> "Pending".
 */
export function formatStatus(value: string | null | undefined): string {
  if (!value) return '—'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
