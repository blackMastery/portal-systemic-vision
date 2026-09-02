export type TrackingState = 'live' | 'grace' | 'expired'

export const TRACKING_GRACE_MS = 60 * 60 * 1000

export const ACTIVE_TRIP_STATUSES = ['accepted', 'arrived', 'picked_up'] as const

export function isActiveTripStatus(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status)
}

type AlertLike = {
  status: string
  created_at: string
  resolved_at: string | null
  expires_at: string
}

type TripLike = {
  status: string
  completed_at: string | null
  cancelled_at: string | null
}

/**
 * Visibility of the public tracking link.
 * - expired once the hard cap passes, or 1h after the earliest of
 *   alert resolution / trip completion / trip cancellation
 * - live while the alert is active and the trip is still in progress
 * - grace otherwise (last known positions, no more updates)
 */
export function computeTrackingState(
  alert: AlertLike,
  trip: TripLike | null,
  now: Date = new Date()
): { state: TrackingState; graceEndsAt: Date | null } {
  const t = now.getTime()
  if (t >= new Date(alert.expires_at).getTime()) {
    return { state: 'expired', graceEndsAt: null }
  }

  const graceStarts: number[] = []
  if (alert.resolved_at) graceStarts.push(new Date(alert.resolved_at).getTime())
  if (trip?.completed_at) graceStarts.push(new Date(trip.completed_at).getTime())
  if (trip?.cancelled_at) graceStarts.push(new Date(trip.cancelled_at).getTime())
  if (alert.status === 'expired') graceStarts.push(t - TRACKING_GRACE_MS)

  const tripActive = trip ? isActiveTripStatus(trip.status) : false
  const alertActive = alert.status === 'active'

  if (graceStarts.length === 0 && alertActive && tripActive) {
    return { state: 'live', graceEndsAt: null }
  }

  const graceStart = graceStarts.length > 0 ? Math.min(...graceStarts) : t
  const graceEndsAt = new Date(
    Math.min(graceStart + TRACKING_GRACE_MS, new Date(alert.expires_at).getTime())
  )
  if (t >= graceEndsAt.getTime()) {
    return { state: 'expired', graceEndsAt }
  }
  if (alertActive && tripActive) {
    return { state: 'live', graceEndsAt: null }
  }
  return { state: 'grace', graceEndsAt }
}
