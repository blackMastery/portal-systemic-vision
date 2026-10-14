import type { RiderLocationCoverage } from '@/types/database'

const STYLES: Record<RiderLocationCoverage, { label: string; className: string }> = {
  full: { label: 'Rider location: full', className: 'bg-green-100 text-green-800' },
  partial: { label: 'Rider location: partial', className: 'bg-amber-100 text-amber-900' },
  none: { label: 'Rider location: none', className: 'bg-red-100 text-red-800' },
  not_applicable: { label: 'Rider not in vehicle', className: 'bg-gray-100 text-gray-700' },
}

/** Coverage of the rider's recorded phone location for a finished trip. */
export function RiderCoverageBadge({
  coverage,
  size = 'md',
}: {
  coverage: RiderLocationCoverage | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!coverage) return null
  const s = STYLES[coverage]
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizing} ${s.className}`}>
      {s.label}
    </span>
  )
}
