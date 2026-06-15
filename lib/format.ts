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

function toNumber(amount: number | string | null | undefined): number | null {
  const n = typeof amount === 'string' ? Number(amount) : amount
  return n == null || Number.isNaN(n) ? null : n
}

/**
 * Format a numeric amount with thousands separators and 2 decimals,
 * WITHOUT a currency symbol. Use next to a DollarSign icon.
 * e.g. 1500 -> "1,500.00".
 */
export function formatAmount(amount: number | string | null | undefined): string {
  const n = toNumber(amount)
  if (n === null) return '0.00'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format a monetary value as a dollar amount with thousands separators
 * and 2 decimals. e.g. 1500 -> "$1,500.00".
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const n = toNumber(amount)
  if (n === null) return '$0.00'
  return `$${formatAmount(n)}`
}
