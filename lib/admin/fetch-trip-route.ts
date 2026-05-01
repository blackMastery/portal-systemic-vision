import { createClient } from '@/lib/supabase/client'
import type { TripRoutePoint } from '@/types/trip-route-point'

async function snapPointsOrRaw(raw: TripRoutePoint[]): Promise<TripRoutePoint[]> {
  if (raw.length <= 1) return raw

  try {
    const res = await fetch('/api/maps/snap-to-road', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ points: raw }),
    })

    const json = (await res.json()) as {
      points?: TripRoutePoint[]
      error?: string
      warning?: string
    }

    if (!Array.isArray(json.points) || json.points.length === 0) {
      if (!res.ok) {
        console.warn('[fetchTripRoute] snap unavailable', res.status, json.error)
      }
      return raw
    }

    if (!res.ok || json.warning) {
      console.warn('[fetchTripRoute] snap degraded', json.warning ?? json.error)
    }

    return json.points
  } catch (e) {
    console.warn('[fetchTripRoute] snap request failed', e)
    return raw
  }
}

/** Ordered `location_history` for a trip, snapped to roads when the Roads API is available. */
export async function fetchTripRoute(tripId: string): Promise<TripRoutePoint[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('location_history')
    .select('latitude, longitude, recorded_at')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true })
  if (error) throw error

  const raw: TripRoutePoint[] = (
    (data || []) as Array<{ latitude: unknown; longitude: unknown; recorded_at: string }>
  ).map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    recorded_at: p.recorded_at,
  }))

  return snapPointsOrRaw(raw)
}
