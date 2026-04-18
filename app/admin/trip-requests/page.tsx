'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Search,
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  User,
  MapPin,
  Users,
  AlertCircle,
  Calendar,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Database } from '@/types/database'

type TripRequestRow = Database['public']['Tables']['trip_requests']['Row'] & {
  rider: {
    id: string
    user: Pick<Database['public']['Tables']['users']['Row'], 'full_name' | 'phone_number' | 'email'>
  } | null
}

async function fetchTripRequests(filters: {
  status: string
  tripType: string
  searchQuery: string
  dateFrom: string
  dateTo: string
}) {
  const supabase = createClient()

  let query = supabase
    .from('trip_requests')
    .select(`
      *,
      rider:rider_id (
        id,
        user:user_id (full_name, phone_number, email)
      )
    `)
    .order('created_at', { ascending: false })

  if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.tripType !== 'all') query = query.eq('trip_type', filters.tripType)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error

  let results = (data ?? []) as TripRequestRow[]
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase()
    results = results.filter(
      r =>
        r.rider?.user?.full_name?.toLowerCase().includes(q) ||
        r.rider?.user?.phone_number?.includes(q) ||
        r.pickup_address?.toLowerCase().includes(q)
    )
  }
  return results
}

const statusColors: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

const tripTypeColors: Record<string, string> = {
  airport: 'bg-indigo-100 text-indigo-800',
  short_drop: 'bg-blue-100 text-blue-800',
  market: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-800',
}

export default function TripRequestsPage() {
  const queryClient = useQueryClient()

  const [status, setStatus] = useState('all')
  const [tripType, setTripType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const { data: requests, isLoading } = useQuery({
    queryKey: ['trip-requests', status, tripType, searchQuery, dateFrom, dateTo],
    queryFn: () => fetchTripRequests({ status, tripType, searchQuery, dateFrom, dateTo }),
  })

  const total = requests?.length ?? 0
  const pending = requests?.filter(r => r.status === 'requested').length ?? 0
  const completed = requests?.filter(r => r.status === 'completed').length ?? 0
  const cancelled = requests?.filter(r => r.status === 'cancelled').length ?? 0

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this trip request? This cannot be undone.')) return
    setCancellingId(id)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('trip_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['trip-requests'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel request')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Trip Requests</h1>
        <p className="mt-1 text-sm text-gray-600">View and manage rider trip requests</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <ClipboardList className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Requests</p>
              <p className="text-2xl font-semibold text-gray-900">{total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-2xl font-semibold text-gray-900">{pending}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-gray-900">{completed}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Cancelled</p>
              <p className="text-2xl font-semibold text-gray-900">{cancelled}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by rider name, phone, or pickup address..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
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
          <div>
            <select
              value={tripType}
              onChange={e => setTripType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Trip Types</option>
              <option value="airport">Airport</option>
              <option value="short_drop">Short Drop</option>
              <option value="market">Market</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : requests && requests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passengers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Fare</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map(r => {
                  const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {r.rider?.user?.full_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {r.rider?.user?.phone_number}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-1 max-w-[180px]">
                          <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-700 line-clamp-2">{r.pickup_address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {r.destination_address ? (
                          <div className="flex items-start gap-1 max-w-[180px]">
                            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700 line-clamp-2">{r.destination_address}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tripTypeColors[r.trip_type] ?? 'bg-gray-100 text-gray-800'}`}>
                          {r.trip_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] ?? 'bg-gray-100 text-gray-800'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-700">
                          <Users className="h-4 w-4 text-gray-400" />
                          {r.passenger_count}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {r.estimated_fare != null ? `GYD ${r.estimated_fare.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(r.created_at), 'MMM d, yyyy')}
                        <div className="text-xs text-gray-400">{format(new Date(r.created_at), 'h:mm a')}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {r.expires_at ? (
                          <span className={`flex items-center gap-1 ${isExpired ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {isExpired && <AlertCircle className="h-4 w-4" />}
                            {format(new Date(r.expires_at), 'MMM d, h:mm a')}
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {r.status === 'requested' && (
                          <button
                            onClick={() => handleCancel(r.id)}
                            disabled={cancellingId === r.id}
                            className="text-sm text-red-600 hover:text-red-900 font-medium disabled:opacity-50"
                          >
                            {cancellingId === r.id ? (
                              <span className="flex items-center gap-1">
                                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                                Cancelling…
                              </span>
                            ) : (
                              'Cancel'
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No trip requests found</p>
          </div>
        )}
      </div>
    </div>
  )
}
