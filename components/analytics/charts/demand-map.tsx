'use client'

import { useCallback, useMemo, useState } from 'react'
import { GoogleMap, Circle, InfoWindow, useLoadScript } from '@react-google-maps/api'
import { MapPin } from 'lucide-react'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export interface DemandCell {
  lat: number
  lng: number
  count: number
}

interface DemandMapProps {
  cells: DemandCell[]
  /** Circle fill colour (hex). */
  color: string
  /** Singular noun used in the info window, e.g. "pickup". */
  unit: string
  height?: string
}

const defaultCenter = { lat: 6.8013, lng: -58.1551 } // Georgetown, Guyana

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  streetViewControl: false,
  mapTypeControl: false,
}

/**
 * Density map for grid-bucketed demand. Uses plain circles rather than
 * `visualization.HeatmapLayer`, which Google has deprecated — this keeps the
 * section on the core Maps API and off an extra library.
 */
export function DemandMap({ cells, color, unit, height = 'h-[420px]' }: DemandMapProps) {
  const [selected, setSelected] = useState<DemandCell | null>(null)

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    id: 'google-map-script',
  })

  const maxCount = useMemo(() => Math.max(1, ...cells.map(c => c.count)), [cells])

  const center = useMemo(() => {
    if (cells.length === 0) return defaultCenter
    const weight = cells.reduce((sum, c) => sum + c.count, 0)
    return {
      lat: cells.reduce((sum, c) => sum + c.lat * c.count, 0) / weight,
      lng: cells.reduce((sum, c) => sum + c.lng * c.count, 0) / weight,
    }
  }, [cells])

  // Frame every cell once the map is ready; a single cell would otherwise zoom
  // all the way in on an empty-looking street.
  const handleLoad = useCallback(
    (map: google.maps.Map) => {
      if (cells.length === 0) return
      const bounds = new google.maps.LatLngBounds()
      cells.forEach(cell => bounds.extend({ lat: cell.lat, lng: cell.lng }))
      map.fitBounds(bounds, 32)
      if (cells.length === 1) map.setZoom(14)
    },
    [cells]
  )

  if (!GOOGLE_MAPS_API_KEY || loadError) {
    return (
      <div className={`${height} flex items-center justify-center rounded-lg bg-gray-50 p-6`}>
        <div className="max-w-sm text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900">Map unavailable</p>
          <p className="mt-1 text-xs text-gray-600">
            {GOOGLE_MAPS_API_KEY
              ? 'The Google Maps JavaScript API could not be loaded for this key.'
              : 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show the demand map.'}
          </p>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className={`${height} flex items-center justify-center rounded-lg bg-gray-50`}>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-strong" />
      </div>
    )
  }

  return (
    <div className={`${height} overflow-hidden rounded-lg`}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={12}
        options={mapOptions}
        onLoad={handleLoad}
      >
        {cells.map(cell => {
          // Area scales with volume, so radius scales with its square root
          const intensity = Math.sqrt(cell.count / maxCount)
          return (
            <Circle
              key={`${cell.lat},${cell.lng}`}
              center={{ lat: cell.lat, lng: cell.lng }}
              radius={160 + intensity * 440}
              onClick={() => setSelected(cell)}
              options={{
                fillColor: color,
                fillOpacity: 0.18 + intensity * 0.5,
                strokeColor: color,
                strokeOpacity: 0.5,
                strokeWeight: 1,
                clickable: true,
              }}
            />
          )
        })}

        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div className="px-1 py-0.5 text-xs text-gray-900">
              <p className="font-semibold">
                {selected.count.toLocaleString()} {unit}
                {selected.count === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-gray-500">
                {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}
