'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { MapPin, Clock, DollarSign, User, Car, Route } from 'lucide-react'
import type { TripWithDetails } from '@/types/database'
import Link from 'next/link'

async function fetchRecentTrips() {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      rider:rider_id (
        id,
        user:user_id (full_name, phone_number)
      ),
      driver:driver_id (
        id,
        user:user_id (full_name, phone_number)
      ),
      vehicle:vehicle_id (make, model, license_plate)
    `)
    .order('requested_at', { ascending: false })
    .limit(10)

  if (error) throw error
  return data as TripWithDetails[]
}

const statusColors = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function RecentTrips() {
  const { data: trips, isLoading } = useQuery({
    queryKey: ['recent-trips'],
    queryFn: fetchRecentTrips,
    refetchInterval: 30000,
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Recent Trips</h2>
        <Link
          href="/admin/trips"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-100 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : trips && trips.length > 0 ? (
        <div className="space-y-4">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              href={`/admin/trips/${trip.id}`}
              className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[trip.status]
                      }`}
                    >
                      {trip.status}
                    </span>
                    {trip.is_night_trip && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        Night Mode
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-start space-x-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 truncate">{trip.pickup_address}</p>
                      <p className="text-gray-500 truncate">→ {trip.destination_address}</p>
                    </div>
                  </div>
                </div>

                {trip.actual_fare && (
                  <div className="ml-4 flex items-center text-sm font-semibold text-green-600">
                    <DollarSign className="h-4 w-4" />
                    {trip.actual_fare.toFixed(2)}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <User className="h-3 w-3 mr-1" />
                    {trip.rider?.user?.full_name || 'Unknown'}
                  </div>
                  <div className="flex items-center">
                    <Car className="h-3 w-3 mr-1" />
                    {trip.driver?.user?.full_name || 'Unassigned'}
                  </div>
                </div>
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDistanceToNow(new Date(trip.requested_at), { addSuffix: true })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Route className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No recent trips</p>
        </div>
      )}
    </div>
  )
}
