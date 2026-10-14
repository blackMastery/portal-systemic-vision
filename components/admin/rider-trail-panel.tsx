'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GoogleMap, Marker, Polyline, useLoadScript } from '@react-google-maps/api'
import { Eye, MapPin, AlertTriangle, UserX } from 'lucide-react'
import { formatGuyana } from '@/lib/guyana-time'
import type { RiderTrail } from '@/lib/admin/rider-trail'
import type { TripRoutePoint } from '@/types/trip-route-point'
import { RiderCoverageBadge } from './rider-coverage-badge'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const DEFAULT_CENTER = { lat: 6.8013, lng: -58.1551 }
const RIDER_COLOR = '#16A34A'
const DRIVER_COLOR = '#2563EB'

type LatLng = { lat: number; lng: number }

async function fetchRiderTrail(tripId: string): Promise<RiderTrail> {
  const res = await fetch(`/api/admin/trips/${tripId}/rider-trail`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const body = (await res.json().catch(() => ({}))) as Partial<RiderTrail> & { error?: string }
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' && body.error ? body.error : `Request failed (${res.status})`)
  }
  return body as RiderTrail
}

/**
 * Admin "Rider trail" tab: the rider's recorded phone positions for a trip
 * over the driver route. Mounting this component calls the audited API,
 * so render it only when an admin deliberately opens the tab.
 */
export function RiderTrailPanel({
  tripId,
  driverRoute,
}: {
  tripId: string
  driverRoute: TripRoutePoint[]
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-rider-trail', tripId],
    queryFn: () => fetchRiderTrail(tripId),
    // One logged view per open; no background refetches that would spam the log.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-1.5 text-xs text-gray-500">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        Every view of a rider trail is logged with your name.
      </p>

      {isLoading && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-700" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(error as Error).message}
        </div>
      )}

      {data && !data.rider_is_passenger && (
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <UserX className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
          Booked for someone else: the rider&apos;s phone was not in the vehicle, so it was not recorded.
        </div>
      )}

      {data && data.rider_is_passenger && <TrailBody trail={data} driverRoute={driverRoute} />}
    </div>
  )
}

function TrailBody({ trail, driverRoute }: { trail: RiderTrail; driverRoute: TripRoutePoint[] }) {
  const pre = trail.points.filter((p) => p.phase === 'pre_pickup')
  const inTrip = trail.points.filter((p) => p.phase === 'in_trip')

  const events = [
    { label: 'Accepted', at: trail.accepted_at },
    { label: 'Picked up', at: trail.picked_up_at },
    { label: trail.trip_status === 'cancelled' ? 'Cancelled' : 'Ended', at: trail.ended_at },
  ].filter((e): e is { label: string; at: string } => !!e.at)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <RiderCoverageBadge coverage={trail.coverage} />
        <span className="text-gray-600">
          {trail.points.length} points · {pre.length} before pickup · {inTrip.length} after
        </span>
        {trail.truncated && <span className="text-amber-700">Showing the first 5,000 points.</span>}
      </div>

      <TrailMap trail={trail} driverRoute={driverRoute} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <Legend color={RIDER_COLOR} label="Rider's phone" />
        <Legend color={DRIVER_COLOR} label="Driver (for context)" faint />
        <Legend color="#D97706" label="Gap in rider location" />
      </div>

      <div className="rounded-lg border border-gray-200">
        <h3 className="border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900">Timeline</h3>
        <ol className="divide-y divide-gray-100 text-sm">
          {buildTimeline(events, trail).map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
              <span className="w-28 shrink-0 tabular-nums text-gray-500">
                {formatGuyana(item.at, 'MMM d, h:mm a')}
              </span>
              <span className={item.gap ? 'text-amber-800' : 'text-gray-900'}>{item.text}</span>
            </li>
          ))}
        </ol>
      </div>

      {trail.points.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          No rider location was recorded for this trip (permission denied, GPS off, or an older app version).
        </div>
      )}
    </>
  )
}

function buildTimeline(
  events: { label: string; at: string }[],
  trail: RiderTrail
): { at: string; text: string; gap: boolean }[] {
  const items = [
    ...events.map((e) => ({ at: e.at, text: e.label, gap: false })),
    ...trail.gaps.map((g) => ({
      at: g.from,
      text: `No rider location for ${g.minutes} min (until ${formatGuyana(g.to, 'h:mm a')}, ${
        g.phase === 'pre_pickup' ? 'before pickup' : 'during the ride'
      })`,
      gap: true,
    })),
  ]
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function Legend({ color, label, faint }: { color: string; label: string; faint?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color, opacity: faint ? 0.45 : 1 }}
        aria-hidden
      />
      {label}
    </span>
  )
}

function TrailMap({ trail, driverRoute }: { trail: RiderTrail; driverRoute: TripRoutePoint[] }) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    id: 'google-map-script',
  })
  const fitted = useRef(false)

  const riderPath = useMemo<LatLng[]>(() => trail.points.map((p) => ({ lat: p.lat, lng: p.lng })), [trail.points])
  const driverPath = useMemo<LatLng[]>(
    () => driverRoute.map((p) => ({ lat: p.latitude, lng: p.longitude })),
    [driverRoute]
  )

  // Where each gap starts: the last known rider fix before it.
  const gapMarkers = useMemo<LatLng[]>(() => {
    return trail.gaps
      .map((g) => {
        const from = new Date(g.from).getTime()
        let last: LatLng | null = null
        for (const p of trail.points) {
          if (new Date(p.recorded_at).getTime() <= from) last = { lat: p.lat, lng: p.lng }
          else break
        }
        return last
      })
      .filter((p): p is LatLng => p != null)
  }, [trail.gaps, trail.points])

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      if (fitted.current) return
      const pts = [...riderPath, ...driverPath]
      if (pts.length === 0) return
      fitted.current = true
      if (pts.length === 1) {
        map.setCenter(pts[0])
        map.setZoom(16)
        return
      }
      const bounds = new google.maps.LatLngBounds()
      for (const p of pts) bounds.extend(p)
      map.fitBounds(bounds, 40)
    },
    [riderPath, driverPath]
  )

  if (loadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
        <MapPin className="mb-2 h-8 w-8 text-gray-400" aria-hidden />
        Map unavailable
      </div>
    )
  }
  if (!isLoaded) {
    return <div className="h-[400px] animate-pulse rounded-lg bg-gray-100" />
  }

  const start = riderPath[0] ?? null
  const end = riderPath.length > 1 ? riderPath[riderPath.length - 1] : null

  return (
    <div className="h-[400px] overflow-hidden rounded-lg border border-gray-200">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={start ?? driverPath[0] ?? DEFAULT_CENTER}
        zoom={14}
        onLoad={onLoad}
        options={{ streetViewControl: false, mapTypeControl: false, clickableIcons: false }}
      >
        {driverPath.length > 1 && (
          <Polyline path={driverPath} options={{ strokeColor: DRIVER_COLOR, strokeOpacity: 0.35, strokeWeight: 5 }} />
        )}
        {riderPath.length > 1 && (
          <Polyline path={riderPath} options={{ strokeColor: RIDER_COLOR, strokeOpacity: 0.95, strokeWeight: 3 }} />
        )}
        {start && (
          <Marker
            position={start}
            title="First rider fix"
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: RIDER_COLOR,
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            }}
          />
        )}
        {end && (
          <Marker
            position={end}
            title="Last rider fix"
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: RIDER_COLOR,
              fillOpacity: 1,
              strokeColor: '#111827',
              strokeWeight: 2,
            }}
          />
        )}
        {gapMarkers.map((p, i) => (
          <Marker
            key={i}
            position={p}
            title="Rider location stopped here"
            icon={{
              path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              scale: 5,
              fillColor: '#D97706',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 1.5,
            }}
          />
        ))}
      </GoogleMap>
    </div>
  )
}
