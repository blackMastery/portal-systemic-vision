'use client'

import { GoogleMap, useLoadScript, Marker, Polyline } from '@react-google-maps/api'
import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { format } from 'date-fns'
import type { TripRoutePoint } from '@/types/trip-route-point'

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
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

export function TripRouteMap({ trip, routePoints, isLoadingRoute, showTripInfo = false }: TripRouteMapProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    id: 'google-map-script',
  })

  const mapCenter = useMemo(() => {
    if (routePoints.length > 0) {
      const avgLat = routePoints.reduce((sum, p) => sum + p.latitude, 0) / routePoints.length
      const avgLng = routePoints.reduce((sum, p) => sum + p.longitude, 0) / routePoints.length
      return { lat: avgLat, lng: avgLng }
    }
    if (trip.pickup_latitude && trip.pickup_longitude) {
      return { lat: Number(trip.pickup_latitude), lng: Number(trip.pickup_longitude) }
    }
    return defaultCenter
  }, [routePoints, trip.pickup_latitude, trip.pickup_longitude])

  const polylinePath = useMemo(
    () => routePoints.map((p) => ({ lat: p.latitude, lng: p.longitude })),
    [routePoints]
  )

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

    setGpsAddresses({ pickup: null, routeEnd: null, destination: null })

    const geocoder = new g.Geocoder()
    let cancelled = false

    const resolve = (lat: number, lng: number, key: 'pickup' | 'routeEnd' | 'destination') => {
      geocoder.geocode({ location: { lat, lng } }, (results: { formatted_address?: string }[] | null, status: string) => {
        if (cancelled) return
        if (status === 'OK' && results?.[0]?.formatted_address) {
          setGpsAddresses((prev) => ({ ...prev, [key]: results[0]!.formatted_address! }))
        } else {
          setGpsAddresses((prev) => ({ ...prev, [key]: formatCoord(lat, lng) }))
        }
      })
    }

    resolve(Number(trip.pickup_latitude), Number(trip.pickup_longitude), 'pickup')

    if (polylinePath.length > 0) {
      const last = polylinePath[polylinePath.length - 1]
      resolve(last.lat, last.lng, 'routeEnd')
    }

    if (trip.destination_latitude != null && trip.destination_longitude != null) {
      resolve(Number(trip.destination_latitude), Number(trip.destination_longitude), 'destination')
    }

    return () => {
      cancelled = true
    }
  }, [
    isLoaded,
    trip.pickup_latitude,
    trip.pickup_longitude,
    trip.destination_latitude,
    trip.destination_longitude,
    polylinePath,
  ])

  return (
    <div>
      {showTripInfo && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">
              {format(new Date(trip.requested_at), 'MMM dd, yyyy HH:mm')}
            </p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[trip.status] ?? 'bg-gray-100 text-gray-800'}`}>
              {trip.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-900 mt-2 truncate">
            {trip.pickup_address} → {trip.destination_address || 'N/A'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Fare: {trip.actual_fare ? `GYD ${Number(trip.actual_fare).toFixed(2)}` : 'N/A'}
          </p>
        </div>
      )}

      <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={mapContainerStyle}>
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading map...</p>
            </div>
          </div>
        )}

        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={routePoints.length > 0 ? 13 : 14}
            options={defaultOptions}
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

            {trip.destination_latitude != null && trip.destination_longitude != null && (
              <Marker
                position={{ lat: Number(trip.destination_latitude), lng: Number(trip.destination_longitude) }}
                icon={destIcon}
              />
            )}
          </GoogleMap>
        )}

        {isLoaded && isLoadingRoute && (
          <div className="absolute inset-0 bg-white bg-opacity-60 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-2" />
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
