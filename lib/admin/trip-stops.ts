import type { Database } from '@/types/database'

export type TripStopRow = Database['public']['Tables']['trip_stops']['Row']

export function sortTripStops(stops: TripStopRow[]): TripStopRow[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence)
}

/** Google Maps directions with optional intermediate waypoints (ordered stops). */
export function googleMapsMultiStopDirectionsUrl(
  pickupLat: number | null,
  pickupLng: number | null,
  stops: TripStopRow[],
): string | null {
  if (pickupLat == null || pickupLng == null) return null
  const ordered = sortTripStops(stops).filter(
    (s) => s.latitude != null && s.longitude != null,
  )
  if (ordered.length === 0) return null

  const origin = `${pickupLat},${pickupLng}`
  const last = ordered[ordered.length - 1]
  const destination = `${last.latitude},${last.longitude}`
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
  })
  if (ordered.length > 1) {
    const waypoints = ordered
      .slice(0, -1)
      .map((s) => `${s.latitude},${s.longitude}`)
      .join('|')
    params.set('waypoints', waypoints)
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export type PlannedMapStop = {
  sequence: number
  latitude: number
  longitude: number
  address: string
  status?: string
}

export function tripStopsToPlannedMapStops(stops: TripStopRow[]): PlannedMapStop[] {
  return sortTripStops(stops)
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      sequence: s.sequence,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      address: s.address,
      status: s.status,
    }))
}
