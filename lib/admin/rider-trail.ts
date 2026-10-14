import type { RiderLocationCoverage, RiderLocationPhase } from '@/types/database'

export type RiderTrailPoint = {
  lat: number
  lng: number
  recorded_at: string
  accuracy_meters: number | null
  speed_kmh: number | null
  heading: number | null
  phase: RiderLocationPhase
}

export type RiderTrailGap = {
  from: string
  to: string
  minutes: number
  phase: RiderLocationPhase
}

export type RiderTrail = {
  trip_id: string
  trip_status: string
  rider_is_passenger: boolean
  coverage: RiderLocationCoverage | null
  accepted_at: string | null
  picked_up_at: string | null
  ended_at: string | null
  points: RiderTrailPoint[]
  gaps: RiderTrailGap[]
  truncated: boolean
}

/** Same thresholds as `compute_rider_location_coverage` in the database. */
export const GAP_THRESHOLD_PRE_PICKUP_MS = 3 * 60 * 1000
export const GAP_THRESHOLD_IN_TRIP_MS = 5 * 60 * 1000

/**
 * Stretches with no rider fix longer than the threshold, including from
 * accept to the first fix and from the last fix to the end (or `now` while
 * the trip is running). `points` must be sorted by `recorded_at`.
 */
export function findTrailGaps(
  points: Pick<RiderTrailPoint, 'recorded_at'>[],
  window: { acceptedAt: string | null; pickedUpAt: string | null; endedAt: string | null },
  now: Date = new Date()
): RiderTrailGap[] {
  if (!window.acceptedAt) return []
  const start = new Date(window.acceptedAt).getTime()
  const end = window.endedAt ? new Date(window.endedAt).getTime() : now.getTime()
  const pickup = window.pickedUpAt ? new Date(window.pickedUpAt).getTime() : null
  if (!(end > start)) return []

  const times = [
    start,
    ...points.map((p) => new Date(p.recorded_at).getTime()).filter((t) => t > start && t < end),
    end,
  ]

  const gaps: RiderTrailGap[] = []
  for (let i = 0; i < times.length - 1; i++) {
    const from = times[i]
    const to = times[i + 1]
    const phase: RiderLocationPhase = pickup != null && from >= pickup ? 'in_trip' : 'pre_pickup'
    const threshold = phase === 'in_trip' ? GAP_THRESHOLD_IN_TRIP_MS : GAP_THRESHOLD_PRE_PICKUP_MS
    if (to - from > threshold) {
      gaps.push({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        minutes: Math.round((to - from) / 60_000),
        phase,
      })
    }
  }
  return gaps
}
