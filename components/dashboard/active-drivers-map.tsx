'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Navigation } from 'lucide-react'
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api'
import { useMemo, useState } from 'react'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBSx2GTsrurnLqynB4JR4HUuuf0dNWmYys'

type ActiveDriverData = {
  id: string
  is_available: boolean
  latitude: number | null
  longitude: number | null
  user: { full_name: string; phone_number: string } | null
  vehicles: Array<{ make: string; model: string; license_plate: string }> | null
}

type DriverProfile = {
  id: string
  is_available: boolean
  user: { full_name: string; phone_number: string } | null
  vehicles: Array<{ make: string; model: string; license_plate: string }> | null
}

async function fetchActiveDrivers(): Promise<ActiveDriverData[]> {
  const supabase = createClient()
  
  // First, get active drivers
  const { data: drivers, error: driversError } = await supabase
    .from('driver_profiles')
    .select(`
      id,
      is_available,
      current_location,
      user:user_id (full_name, phone_number),
      vehicles:vehicles (make, model, license_plate)
    `)
    .eq('is_online', true)
    .limit(20)

  if (driversError) throw driversError
  if (!drivers || drivers.length === 0) return []

  // Get latest location from location_history for each driver
  const driversWithLocations = await Promise.all(
    (drivers as DriverProfile[]).map(async (driver) => {
      const { data: locationData } = await supabase
        .from('location_history')
        .select('latitude, longitude')
        .eq('driver_id', driver.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()

      const location = locationData as { latitude: number; longitude: number } | null

      return {
        id: driver.id,
        is_available: driver.is_available,
        latitude: location?.latitude ? Number(location.latitude) : null,
        longitude: location?.longitude ? Number(location.longitude) : null,
        user: driver.user,
        vehicles: driver.vehicles,
      } as ActiveDriverData
    })
  )

  return driversWithLocations
}

const mapContainerStyle = {
  width: '100%',
  height: '400px',
}

const defaultCenter = {
  lat: 6.8013, // Georgetown, Guyana default center
  lng: -58.1551,
}

const defaultOptions = {
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
}

export function ActiveDriversMap() {
  const [selectedDriver, setSelectedDriver] = useState<ActiveDriverData | null>(null)
  const { data: drivers, isLoading } = useQuery({
    queryKey: ['active-drivers'],
    queryFn: fetchActiveDrivers,
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  // Calculate map center based on driver locations
  const mapCenter = useMemo(() => {
    const driversWithLocation = drivers?.filter(
      (d) => d.latitude !== null && d.longitude !== null
    ) || []

    if (driversWithLocation.length === 0) {
      return defaultCenter
    }

    const avgLat =
      driversWithLocation.reduce((sum, d) => sum + (d.latitude || 0), 0) /
      driversWithLocation.length
    const avgLng =
      driversWithLocation.reduce((sum, d) => sum + (d.longitude || 0), 0) /
      driversWithLocation.length

    return { lat: avgLat, lng: avgLng }
  }, [drivers])

  const driversWithLocation = useMemo(
    () =>
      drivers?.filter(
        (d) => d.latitude !== null && d.longitude !== null
      ) || [],
    [drivers]
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Active Drivers</h2>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          <span className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          {drivers?.length || 0} Online
        </span>
      </div>

      {/* Google Maps */}
      <div className="relative bg-gray-100 rounded-lg overflow-hidden mb-4" style={mapContainerStyle}>
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
                  <li>Go to <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
                  <li>Search for "Maps JavaScript API"</li>
                  <li>Click "Enable" to activate it</li>
                  <li>Ensure billing is enabled for your project</li>
                </ol>
              </div>
            </div>
          </div>
        )}
        {!isLoaded && !loadError && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">Loading map...</p>
            </div>
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={driversWithLocation.length > 0 ? 12 : 10}
            options={defaultOptions}
          >
            {driversWithLocation.map((driver) => {
              const iconUrl = driver.is_available
                ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                : 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
              
              // Create icon object only when google.maps is available
              const iconConfig = typeof window !== 'undefined' && 
                                 typeof (window as any).google !== 'undefined' && 
                                 (window as any).google.maps
                ? {
                    url: iconUrl,
                    scaledSize: new (window as any).google.maps.Size(32, 32),
                  }
                : iconUrl
              
              return (
                <Marker
                  key={driver.id}
                  position={{
                    lat: driver.latitude!,
                    lng: driver.longitude!,
                  }}
                  icon={iconConfig}
                  onClick={() => setSelectedDriver(driver)}
                />
              )
            })}
            {selectedDriver && selectedDriver.latitude && selectedDriver.longitude && (
              <InfoWindow
                position={{
                  lat: selectedDriver.latitude,
                  lng: selectedDriver.longitude,
                }}
                onCloseClick={() => setSelectedDriver(null)}
              >
                <div className="p-2">
                  <h3 className="font-semibold text-sm text-gray-900">
                    {selectedDriver.user?.full_name || 'Unknown Driver'}
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedDriver.vehicles?.[0]?.make} {selectedDriver.vehicles?.[0]?.model}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedDriver.vehicles?.[0]?.license_plate}
                  </p>
                  <p className="text-xs mt-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        selectedDriver.is_available
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {selectedDriver.is_available ? 'Available' : 'On Trip'}
                    </span>
                  </p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Driver List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        ) : drivers && drivers.length > 0 ? (
          drivers.map((driver) => (
            <div
              key={driver.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Navigation className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {driver.user?.full_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {driver.vehicles?.[0]?.make} {driver.vehicles?.[0]?.model} • {driver.vehicles?.[0]?.license_plate}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  driver.is_available 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {driver.is_available ? 'Available' : 'On Trip'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-gray-500">
            <p className="text-sm">No active drivers</p>
          </div>
        )}
      </div>
    </div>
  )
}
