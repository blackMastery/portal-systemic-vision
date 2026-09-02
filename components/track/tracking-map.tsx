'use client'

import { GoogleMap, Marker, Polyline, useLoadScript } from '@react-google-maps/api'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MapPin } from 'lucide-react'
import type { TrackingPosition } from '@/lib/panic/tracking-loader'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

/** Georgetown, Guyana. */
const DEFAULT_CENTER = { lat: 6.8013, lng: -58.1551 }

const mapContainerStyle = { width: '100%', height: '100%' }

const mapOptions = {
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  gestureHandling: 'greedy' as const,
  clickableIcons: false,
}

type LatLng = { lat: number; lng: number }

interface TrackingMapProps {
  positions: TrackingPosition[]
  lastPosition: TrackingPosition | null
  pressLocation: LatLng | null
}

export function TrackingMap({ positions, lastPosition, pressLocation }: TrackingMapProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    id: 'google-map-script',
  })

  const mapRef = useRef<google.maps.Map | null>(null)
  const didFitRef = useRef(false)

  const path = useMemo<LatLng[]>(
    () => positions.map((p) => ({ lat: p.lat, lng: p.lng })),
    [positions]
  )

  const initialCenter = useMemo<LatLng>(() => {
    if (lastPosition) return { lat: lastPosition.lat, lng: lastPosition.lng }
    if (pressLocation) return pressLocation
    return DEFAULT_CENTER
  }, [lastPosition, pressLocation])

  const fitOnce = useCallback(
    (map: google.maps.Map) => {
      if (didFitRef.current) return
      const pts: LatLng[] = [...path]
      if (pressLocation) pts.push(pressLocation)
      if (pts.length === 0) return
      didFitRef.current = true
      if (pts.length === 1) {
        map.setCenter(pts[0])
        map.setZoom(16)
        return
      }
      const bounds = new google.maps.LatLngBounds()
      for (const p of pts) bounds.extend(p)
      map.fitBounds(bounds, 48)
    },
    [path, pressLocation]
  )

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map
      fitOnce(map)
    },
    [fitOnce]
  )

  // Positions may arrive after the map loaded (first poll); fit once when they do.
  useEffect(() => {
    if (mapRef.current) fitOnce(mapRef.current)
  }, [fitOnce])

  const carIcon = useMemo<google.maps.Symbol | undefined>(() => {
    if (!isLoaded || typeof window === 'undefined' || typeof window.google === 'undefined') return undefined
    return {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 7,
      rotation: lastPosition?.heading ?? 0,
      fillColor: '#2563EB',
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 2,
    }
  }, [isLoaded, lastPosition?.heading])

  const pressIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!isLoaded || typeof window === 'undefined' || typeof window.google === 'undefined') return undefined
    return {
      url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
      scaledSize: new google.maps.Size(40, 40),
    }
  }, [isLoaded])

  return (
    <div className="relative w-full h-[55vh] min-h-[320px] bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
      {loadError && (
        <div className="flex items-center justify-center h-full p-6">
          <div className="text-center">
            <MapPin className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900">Map unavailable</p>
            {lastPosition && (
              <a
                className="text-sm text-blue-700 underline"
                href={`https://maps.google.com/?q=${lastPosition.lat.toFixed(5)},${lastPosition.lng.toFixed(5)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open last position in Google Maps
              </a>
            )}
          </div>
        </div>
      )}

      {!isLoaded && !loadError && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading map…</p>
          </div>
        </div>
      )}

      {isLoaded && !loadError && (
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={initialCenter}
          zoom={15}
          options={mapOptions}
          onLoad={onLoad}
        >
          {path.length > 1 && (
            <Polyline
              path={path}
              options={{ strokeColor: '#2563EB', strokeOpacity: 0.85, strokeWeight: 4 }}
            />
          )}

          {pressLocation && (
            <Marker position={pressLocation} icon={pressIcon} title="Panic button pressed here" zIndex={1} />
          )}

          {lastPosition && (
            <Marker
              position={{ lat: lastPosition.lat, lng: lastPosition.lng }}
              icon={carIcon}
              title="Current vehicle position"
              zIndex={2}
            />
          )}
        </GoogleMap>
      )}

      {isLoaded && !loadError && positions.length === 0 && (
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-white/90 border border-gray-200 px-3 py-2 text-xs text-gray-700 text-center">
          No GPS positions received yet
          {pressLocation ? ' — showing where the panic button was pressed.' : '.'}
        </div>
      )}
    </div>
  )
}
