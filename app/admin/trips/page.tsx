'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Route, MapPin, DollarSign, Clock, User, Car, Star, Moon, List, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import type { TripWithDetails } from '@/types/database'
import { format, formatDistanceToNow } from 'date-fns'

async function fetchTrips(filters: {
  status: string
  tripType: string
  searchQuery: string
  startDate: string
  endDate: string
}) {
  const supabase = createClient()
  
  let query = supabase
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

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.tripType !== 'all') {
    query = query.eq('trip_type', filters.tripType)
  }

  if (filters.startDate) {
    const startDateTime = new Date(`${filters.startDate}T00:00:00`)
    query = query.gte('requested_at', startDateTime.toISOString())
  }

  if (filters.endDate) {
    const endDateTime = new Date(`${filters.endDate}T23:59:59.999`)
    query = query.lte('requested_at', endDateTime.toISOString())
  }

  const { data, error } = await query

  if (error) throw error

  // Client-side search filtering
  let results = data as TripWithDetails[]
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(trip => 
      trip.rider?.user?.full_name?.toLowerCase().includes(searchLower) ||
      trip.driver?.user?.full_name?.toLowerCase().includes(searchLower) ||
      trip.pickup_address?.toLowerCase().includes(searchLower) ||
      trip.destination_address?.toLowerCase().includes(searchLower)
    )
  }

  return results
}

const statusColors = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

const tripTypeColors = {
  airport: 'bg-indigo-100 text-indigo-800',
  short_drop: 'bg-blue-100 text-blue-800',
  market: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function TripsPage() {
  const [status, setStatus] = useState('all')
  const [tripType, setTripType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card')

  const { data: trips, isLoading } = useQuery({
    queryKey: ['trips', status, tripType, searchQuery, startDate, endDate],
    queryFn: () => fetchTrips({ status, tripType, searchQuery, startDate, endDate }),
  })

  const activeTripsCount = trips?.filter(t => ['accepted', 'picked_up'].includes(t.status)).length || 0
  const pendingRequestsCount = trips?.filter(t => t.status === 'requested').length || 0

  const statusCounts: Record<string, number> = {
    total: trips?.length ?? 0,
    requested: 0,
    accepted: 0,
    picked_up: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const trip of trips ?? []) {
    if (trip.status in statusCounts) statusCounts[trip.status]++
  }

  const statusStats = [
    { key: 'total', label: 'Total', color: 'bg-yellow-50 border-yellow-200 text-yellow-800', dot: 'bg-yellow-400' },
    { key: 'accepted', label: 'Accepted', color: 'bg-blue-50 border-blue-200 text-blue-800', dot: 'bg-blue-400' },
    { key: 'picked_up', label: 'Picked Up', color: 'bg-purple-50 border-purple-200 text-purple-800', dot: 'bg-purple-400' },
    { key: 'completed', label: 'Completed', color: 'bg-green-50 border-green-200 text-green-800', dot: 'bg-green-400' },
    { key: 'cancelled', label: 'Cancelled', color: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-400' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trips</h1>
          <p className="mt-1 text-sm text-gray-600">
            View and manage all trip records
          </p>
        </div>
        {(activeTripsCount > 0 || pendingRequestsCount > 0) && (
          <div className="flex gap-2">
            {activeTripsCount > 0 && (
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-lg">
                <Route className="h-5 w-5 mr-2" />
                {activeTripsCount} Active
              </div>
            )}
            {pendingRequestsCount > 0 && (
              <Link
                href="/admin/trips?status=requested"
                className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
              >
                <Clock className="h-5 w-5 mr-2" />
                {pendingRequestsCount} Pending
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Status Count Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statusStats.map(({ key, label, color, dot }) => (
          <button
            key={key}
            onClick={() => setStatus(key === 'total' ? 'all' : status === key ? 'all' : key)}
            className={`border rounded-xl p-4 text-left transition-all hover:shadow-sm ${color} ${(key === 'total' ? status === 'all' : status === key) ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold">{statusCounts?.[key] ?? '—'}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by rider, driver, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="requested">Requested</option>
              <option value="accepted">Accepted</option>
              <option value="picked_up">Picked Up</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Start Date Filter */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Filter from date"
            />
          </div>

          {/* End Date Filter */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Filter to date"
            />
          </div>

          {/* Trip Type Filter */}
          <div>
            <select
              value={tripType}
              onChange={(e) => setTripType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types</option>
              <option value="airport">Airport</option>
              <option value="short_drop">Short Drop</option>
              <option value="market">Market</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* View Toggle + Trips */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{trips?.length ?? 0} trips</p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : trips && trips.length > 0 ? (
          viewMode === 'card' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {trips.map((trip) => {
                const fare = trip.actual_fare ?? trip.estimated_fare
                const fareIsEstimated = !trip.actual_fare && trip.estimated_fare
                const distance = trip.actual_distance_km ?? trip.estimated_distance_km
                const distanceIsEstimated = !trip.actual_distance_km && trip.estimated_distance_km

                return (
                  <div key={trip.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[trip.status]}`}>
                          {trip.status}
                        </span>
                        {trip.is_night_trip && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            <Moon className="h-3 w-3 mr-1" />
                            Night
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tripTypeColors[trip.trip_type]}`}>
                          {trip.trip_type.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{format(new Date(trip.requested_at), 'MMM d, yyyy')}</span>
                    </div>

                    {/* Route */}
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-900 truncate font-medium">{trip.pickup_address}</p>
                        <p className="text-gray-500 truncate">→ {trip.destination_address}</p>
                      </div>
                    </div>

                    {/* People */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-gray-700 truncate max-w-[100px]">
                          {trip.rider?.user?.full_name ?? 'Unknown'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Car className="h-3 w-3 text-blue-600" />
                        </div>
                        <span className="text-gray-700 truncate max-w-[100px]">
                          {trip.driver?.user?.full_name ?? 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    {/* Fare + distance + actions */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        {fare ? (
                          <span className="flex items-center font-medium text-gray-900">
                            <DollarSign className="h-3.5 w-3.5 text-green-600 mr-0.5" />
                            {fare.toFixed(2)}
                            {fareIsEstimated && <span className="ml-0.5 text-xs text-gray-400">(est.)</span>}
                          </span>
                        ) : null}
                        {distance ? (
                          <span className="text-xs text-gray-500">
                            {distance.toFixed(2)} km{distanceIsEstimated && ' (est.)'}
                          </span>
                        ) : null}
                        {(trip.rider_rating || trip.driver_rating) && (
                          <span className="flex items-center text-xs text-gray-500">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 mr-0.5" />
                            {trip.rider_rating ?? trip.driver_rating}
                          </span>
                        )}
                      </div>
                      <Link href={`/admin/trips/${trip.id}`} className="text-xs text-blue-600 hover:text-blue-900 font-medium">
                        View →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Route
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fare
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Distance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requested
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trips.map((trip) => {
                  const fare = trip.actual_fare ?? trip.estimated_fare
                  const fareIsEstimated = !trip.actual_fare && trip.estimated_fare
                  const distance = trip.actual_distance_km ?? trip.estimated_distance_km
                  const distanceIsEstimated = !trip.actual_distance_km && trip.estimated_distance_km

                  return (
                    <tr key={trip.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[trip.status]
                          }`}>
                            {trip.status}
                          </span>
                          {trip.is_night_trip && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              <Moon className="h-3 w-3 mr-1" />
                              Night
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {trip.rider?.user ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 flex-shrink-0">
                              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                                <User className="h-4 w-4 text-green-600" />
                              </div>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">
                                {trip.rider.user.full_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {trip.rider.user.phone_number}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Unknown</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {trip.driver?.user ? (
                          <div className="flex items-center">
                            <div className="h-8 w-8 flex-shrink-0">
                              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <Car className="h-4 w-4 text-blue-600" />
                              </div>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">
                                {trip.driver.user.full_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {trip.driver.user.phone_number}
                              </div>
                              {trip.vehicle && (
                                <div className="text-xs text-gray-400">
                                  {trip.vehicle.make} {trip.vehicle.model} • {trip.vehicle.license_plate}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start space-x-2 text-sm max-w-xs">
                          <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-900 truncate">{trip.pickup_address}</p>
                            <p className="text-gray-500 truncate">→ {trip.destination_address}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {fare ? (
                          <div className="flex items-center text-sm">
                            <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                            <span className="font-medium text-gray-900">
                              {fare.toFixed(2)}
                            </span>
                            {fareIsEstimated && (
                              <span className="ml-1 text-xs text-gray-500">(est.)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {distance ? (
                          <span>
                            {distance.toFixed(2)} km
                            {distanceIsEstimated && (
                              <span className="ml-1 text-xs text-gray-400">(est.)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          tripTypeColors[trip.trip_type]
                        }`}>
                          {trip.trip_type.replace('_', ' ')}
                        </span>
                        {(trip.rider_rating || trip.driver_rating) && (
                          <div className="flex items-center mt-1 text-xs text-gray-500">
                            {trip.rider_rating && (
                              <span className="flex items-center mr-2">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 mr-0.5" />
                                R: {trip.rider_rating}
                              </span>
                            )}
                            {trip.driver_rating && (
                              <span className="flex items-center">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 mr-0.5" />
                                D: {trip.driver_rating}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{format(new Date(trip.requested_at), 'MMM d, yyyy')}</span>
                          <span className="text-xs text-gray-400">
                            {format(new Date(trip.requested_at), 'h:mm a')}
                          </span>
                          {trip.completed_at && (
                            <span className="text-xs text-green-600 mt-1">
                              Completed: {format(new Date(trip.completed_at), 'MMM d, h:mm a')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/trips/${trip.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )
        ) : (
          <div className="text-center py-12">
            <Route className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No trips found</p>
          </div>
        )}
      </div>
    </div>
  )
}

