'use client'

import { GoogleMap, useLoadScript, Marker, Polyline } from '@react-google-maps/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Maximize2 } from 'lucide-react'
import type { TripRoutePoint } from '@/types/trip-route-point'
import { formatGuyana } from '@/lib/guyana-time'
import { formatCurrency } from '@/lib/format'
import type { PlannedMapStop } from '@/lib/admin/trip-stops'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export type { TripRoutePoint }

export type TripForMap = {
  id: string
  pickup_latitude: number
  pickup_longitude: number
  pickup_address: string
  destination_latitude: number | null
  destination_longitude: number | null
  destination_address: string | null
  status: string
  actual_fare: number | null
  requested_at: string
}

interface TripRouteMapProps {
  trip: TripForMap
  routePoints: TripRoutePoint[]
  isLoadingRoute: boolean
  showTripInfo?: boolean
  plannedStops?: PlannedMapStop[]
}

const mapContainerStyle = {
  width: '100%',
  height: '400px',
}

const defaultCenter = {
  lat: 6.8013,
  lng: -58.1551,
}

const defaultOptions = {
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
}

const statusColors: Record<string, string> = {
  requested: 'bg-warning-soft text-warning-soft-foreground',
  accepted: 'bg-info-soft text-info-soft-foreground',
  picked_up: 'bg-violet-soft text-violet-soft-foreground',
  completed: 'bg-success-soft text-success-soft-foreground',
  cancelled: 'bg-danger-soft text-danger-soft-foreground',
}

function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/** Reverse-geocodes one point; falls back to raw coordinates. */
function geocodeInto(
  geocoder: { geocode: (req: unknown, cb: (r: { formatted_address?: string }[] | null, s: string) => void) => void },
  lat: number,
  lng: number,
  done: (address: string) => void
) {
  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
    done(status === 'OK' && results?.[0]?.formatted_address ? results[0].formatted_address : formatCoord(lat, lng))
  })
}

export function TripRouteMap({ trip, routePoints, isLoadingRoute, showTripInfo = false, plannedStops = [] }: TripRouteMapProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    id: 'google-map-script',
  })

  const polylinePath = useMemo(
    () => routePoints.map((p) => ({ lat: p.latitude, lng: p.longitude })),
    [routePoints]
  )

  // The view is set once (initial center, then one fit when the route first
  // loads) and never moved by code after that, so live GPS updates don't
  // undo the admin's zoom/pan. "Fit route" re-frames on demand.
  const [initialCenter] = useState(() =>
    trip.pickup_latitude && trip.pickup_longitude
      ? { lat: Number(trip.pickup_latitude), lng: Number(trip.pickup_longitude) }
      : defaultCenter
  )
  const mapRef = useRef<google.maps.Map | null>(null)
  const fittedTripRef = useRef<string | null>(null)
  const userMovedRef = useRef(false)

  const fitToRoute = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const pts: google.maps.LatLngLiteral[] = [...polylinePath]
    if (trip.pickup_latitude && trip.pickup_longitude) {
      pts.push({ lat: Number(trip.pickup_latitude), lng: Number(trip.pickup_longitude) })
    }
    if (trip.destination_latitude != null && trip.destination_longitude != null) {
      pts.push({ lat: Number(trip.destination_latitude), lng: Number(trip.destination_longitude) })
    }
    for (const s of plannedStops) pts.push({ lat: s.latitude, lng: s.longitude })
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.setCenter(pts[0])
      map.setZoom(15)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    for (const p of pts) bounds.extend(p)
    map.fitBounds(bounds, 48)
  }, [
    polylinePath,
    plannedStops,
    trip.pickup_latitude,
    trip.pickup_longitude,
    trip.destination_latitude,
    trip.destination_longitude,
  ])

  // A different trip (e.g. switching trips on the driver page) gets a fresh fit.
  useEffect(() => {
    if (fittedTripRef.current !== null && fittedTripRef.current !== trip.id) {
      fittedTripRef.current = null
      userMovedRef.current = false
    }
  }, [trip.id])

  // Fit once, when the route first has points — unless the admin already
  // zoomed or panned while it was loading.
  useEffect(() => {
    if (!mapRef.current || fittedTripRef.current === trip.id) return
    if (isLoadingRoute) return
    if (polylinePath.length === 0 && plannedStops.length === 0) return
    fittedTripRef.current = trip.id
    if (!userMovedRef.current) fitToRoute()
  }, [trip.id, isLoadingRoute, polylinePath.length, plannedStops.length, fitToRoute])

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map
      if (!isLoadingRoute && (polylinePath.length > 0 || plannedStops.length > 0)) {
        fittedTripRef.current = trip.id
        fitToRoute()
      }
    },
    // Only the first load matters; later fits go through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const onMapUnmount = useCallback(() => {
    mapRef.current = null
    fittedTripRef.current = null
  }, [])

  const markUserMoved = useCallback(() => {
    userMovedRef.current = true
  }, [])

  const pickupIcon = useMemo(() => {
    if (typeof window === 'undefined' || typeof (window as any).google === 'undefined') return undefined
    return {
      url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
      scaledSize: new (window as any).google.maps.Size(40, 40),
    }
  }, [isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const destIcon = useMemo(() => {
    if (typeof window === 'undefined' || typeof (window as any).google === 'undefined') return undefined
    return {
      url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
      scaledSize: new (window as any).google.maps.Size(40, 40),
    }
  }, [isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Red teardrop pin at last GPS point (vs red-dot for address destination). */
  const routeEndIcon = useMemo(() => {
    if (typeof window === 'undefined' || typeof (window as any).google === 'undefined') return undefined
    return {
      url: 'http://maps.google.com/mapfiles/ms/icons/red.png',
      scaledSize: new (window as any).google.maps.Size(40, 40),
    }
  }, [isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const [gpsAddresses, setGpsAddresses] = useState<{
    pickup: string | null
    routeEnd: string | null
    destination: string | null
  }>({ pickup: null, routeEnd: null, destination: null })

  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return
    const g = (window as any).google?.maps
    if (!g?.Geocoder) return

    setGpsAddresses((prev) => ({ ...prev, pickup: null, destination: null }))
    const geocoder = new g.Geocoder()
    let cancelled = false

    geocodeInto(geocoder, Number(trip.pickup_latitude), Number(trip.pickup_longitude), (addr) => {
      if (!cancelled) setGpsAddresses((prev) => ({ ...prev, pickup: addr }))
    })
    if (trip.destination_latitude != null && trip.destination_longitude != null) {
      geocodeInto(geocoder, Number(trip.destination_latitude), Number(trip.destination_longitude), (addr) => {
        if (!cancelled) setGpsAddresses((prev) => ({ ...prev, destination: addr }))
      })
    }

    return () => {
      cancelled = true
    }
  }, [isLoaded, trip.pickup_latitude, trip.pickup_longitude, trip.destination_latitude, trip.destination_longitude])

  // ~11 m grid: a stationary car (or one creeping in traffic) doesn't trigger
  // a new Geocoding call on every GPS update.
  const lastPoint = polylinePath.length > 0 ? polylinePath[polylinePath.length - 1] : null
  const routeEndKey = lastPoint ? `${lastPoint.lat.toFixed(4)},${lastPoint.lng.toFixed(4)}` : null

  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined' || !routeEndKey) return
    const g = (window as any).google?.maps
    if (!g?.Geocoder) return
    const [lat, lng] = routeEndKey.split(',').map(Number)
    let cancelled = false
    // Keep showing the previous address until the new one arrives.
    geocodeInto(new g.Geocoder(), lat, lng, (addr) => {
      if (!cancelled) setGpsAddresses((prev) => ({ ...prev, routeEnd: addr }))
    })
    return () => {
      cancelled = true
    }
  }, [isLoaded, routeEndKey])

  return (
    <div>
      {showTripInfo && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">
              {formatGuyana(trip.requested_at, 'MMM d, yyyy • HH:mm')}
            </p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[trip.status] ?? 'bg-muted text-secondary-foreground'}`}>
              {trip.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-900 mt-2 truncate">
            {trip.pickup_address} → {trip.destination_address || 'N/A'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Fare: {trip.actual_fare ? formatCurrency(trip.actual_fare) : 'N/A'}
          </p>
        </div>
      )}

      <div
        className="relative bg-gray-100 rounded-lg overflow-hidden"
        style={mapContainerStyle}
        // Any wheel/pinch/drag before the first fit means the admin chose a view.
        onWheel={markUserMoved}
        onTouchStart={markUserMoved}
      >
        {loadError && (
          <div className="flex items-center justify-center h-full bg-gray-50 p-6">
            <div className="text-center max-w-md">
              <MapPin className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-900 mb-2">Error loading Google Maps</p>
              <p className="text-xs text-gray-600 mb-3">
                The Google Maps JavaScript API is not enabled for this API key.
              </p>
              <div className="text-left bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-gray-700">
                <p className="font-semibold mb-2">To fix this:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to Google Cloud Console → APIs &amp; Services</li>
                  <li>Search for &quot;Maps JavaScript API&quot;</li>
                  <li>Click &quot;Enable&quot; to activate it</li>
                  <li>Ensure billing is enabled for your project</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {!isLoaded && !loadError && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-strong mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading map...</p>
            </div>
          </div>
        )}

        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={initialCenter}
            zoom={14}
            options={defaultOptions}
            onLoad={onMapLoad}
            onUnmount={onMapUnmount}
            onDragStart={markUserMoved}
          >
            {polylinePath.length > 1 && (
              <Polyline
                path={polylinePath}
                options={{
                  strokeColor: '#2563EB',
                  strokeOpacity: 0.9,
                  strokeWeight: 4,
                }}
              />
            )}

            <Marker
              position={{ lat: Number(trip.pickup_latitude), lng: Number(trip.pickup_longitude) }}
              icon={pickupIcon}
            />

            {polylinePath.length > 0 && (
              <Marker
                position={polylinePath[polylinePath.length - 1]}
                icon={routeEndIcon}
                title="End of route (last GPS point)"
              />
            )}

            {trip.destination_latitude != null && trip.destination_longitude != null && plannedStops.length === 0 && (
              <Marker
                position={{ lat: Number(trip.destination_latitude), lng: Number(trip.destination_longitude) }}
                icon={destIcon}
              />
            )}

            {plannedStops.map((stop) => (
              <Marker
                key={`planned-${stop.sequence}`}
                position={{ lat: stop.latitude, lng: stop.longitude }}
                label={{
                  text: String(stop.sequence),
                  color: '#ffffff',
                  fontWeight: '700',
                }}
                title={`Stop ${stop.sequence}: ${stop.address}`}
              />
            ))}
          </GoogleMap>
        )}

        {isLoaded && !loadError && (polylinePath.length > 0 || plannedStops.length > 0) && (
          <button
            type="button"
            onClick={fitToRoute}
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            title="Zoom to show the whole route"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            Fit route
          </button>
        )}

        {isLoaded && isLoadingRoute && (
          <div className="absolute inset-0 bg-white bg-opacity-60 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-strong mx-auto mb-2" />
              <p className="text-sm text-gray-600">Loading route...</p>
            </div>
          </div>
        )}
      </div>

      {isLoaded && !loadError && (
        <div className="mt-3 space-y-2.5 text-sm">
          <div>
            <p className="font-medium text-green-800">Green marker (pickup)</p>
            <p className="text-gray-600 break-words mt-0.5">
              {gpsAddresses.pickup ?? 'Resolving address…'}
            </p>
          </div>
          {polylinePath.length > 0 && (
            <div>
              <p className="font-medium text-red-800">Red marker (end of route)</p>
              <p className="text-gray-600 break-words mt-0.5">
                {gpsAddresses.routeEnd ?? 'Resolving address…'}
              </p>
            </div>
          )}
          {trip.destination_latitude != null && trip.destination_longitude != null && (
            <div>
              <p className="font-medium text-red-800">Red marker (destination)</p>
              <p className="text-gray-600 break-words mt-0.5">
                {gpsAddresses.destination ?? 'Resolving address…'}
              </p>
            </div>
          )}
        </div>
      )}

      {isLoaded && !isLoadingRoute && routePoints.length === 0 && (
        <p className="text-xs text-gray-400 text-center mt-2">
          No GPS route data available for this trip
        </p>
      )}
    </div>
  )
}
