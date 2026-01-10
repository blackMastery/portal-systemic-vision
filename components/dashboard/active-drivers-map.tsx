'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Navigation } from 'lucide-react'

type ActiveDriverData = {
  id: string
  is_available: boolean
  user: { full_name: string; phone_number: string } | null
  vehicles: Array<{ make: string; model: string; license_plate: string }> | null
}

async function fetchActiveDrivers() {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('driver_profiles')
    .select(`
      id,
      is_available,
      user:user_id (full_name, phone_number),
      vehicles:vehicles (make, model, license_plate)
    `)
    .eq('is_online', true)
    .limit(20)

  if (error) throw error
  return (data as ActiveDriverData[] | null) || []
}

export function ActiveDriversMap() {
  const { data: drivers, isLoading } = useQuery({
    queryKey: ['active-drivers'],
    queryFn: fetchActiveDrivers,
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Active Drivers</h2>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          <span className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          {drivers?.length || 0} Online
        </span>
      </div>

      {/* Map Placeholder - Replace with Google Maps integration */}
      <div className="relative bg-gray-100 rounded-lg h-64 flex items-center justify-center mb-4">
        <div className="text-center">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Map view (integrate Google Maps API)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Show driver locations in real-time
          </p>
        </div>
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
