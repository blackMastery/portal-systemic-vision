/**
 * Shared chart palette + Nivo theme for the admin analytics page.
 *
 * SVG presentation attributes can't resolve `var()`, so these hexes mirror
 * the HSL tokens documented in app/globals.css. If a token changes there,
 * update the matching hex here.
 */
export const CHART_COLORS = {
  info: '#2563EB', // --info
  success: '#16A34A', // --success
  violet: '#9333EA', // --violet
  warningStrong: '#CA8A04', // --warning-strong
  danger: '#DC2626', // --danger
  gray: '#6B7280', // --foreground-muted
  primary: '#FFA240', // --primary (fill only)
  primaryStrong: '#B45309', // --primary-strong
} as const

export const CATEGORICAL_PALETTE = [
  CHART_COLORS.info,
  CHART_COLORS.success,
  CHART_COLORS.violet,
  CHART_COLORS.warningStrong,
  CHART_COLORS.danger,
  CHART_COLORS.gray,
]

export const nivoTheme = {
  text: { fontFamily: 'inherit', fontSize: 12, fill: '#6B7280' }, // --foreground-muted
  axis: {
    domain: { line: { stroke: 'transparent' } },
    ticks: {
      line: { stroke: 'transparent' },
      text: { fontSize: 12, fill: '#6B7280' },
    },
  },
  grid: { line: { stroke: '#E5E7EB', strokeWidth: 1 } }, // --border
  crosshair: {
    line: { stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '4 4' },
  },
  legends: { text: { fontSize: 12, fill: '#374151' } }, // --foreground-secondary
  tooltip: {
    container: {
      background: '#FFFFFF',
      color: '#111827',
      fontSize: 12,
      borderRadius: 8,
      border: '1px solid #E5E7EB',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      padding: '8px 12px',
    },
  },
}

const compactCurrency = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Short money labels for axis ticks, e.g. $1.2K. */
export const formatCompactCurrency = (value: number): string =>
  `$${compactCurrency.format(value)}`
