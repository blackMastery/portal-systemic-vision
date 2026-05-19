'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
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
  List,
  LayoutGrid,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Database } from '@/types/database'
import { PAGE_SIZE_OPTIONS, useTripRequestFilters } from './use-trip-request-filters'

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

function googleMapsDirectionsUrl(
  pickupLat: number | null,
  pickupLng: number | null,
  destLat: number | null,
  destLng: number | null
): string | null {
  if (
    pickupLat == null ||
    pickupLng == null ||
    destLat == null ||
    destLng == null ||
    Number.isNaN(pickupLat) ||
    Number.isNaN(pickupLng) ||
    Number.isNaN(destLat) ||
    Number.isNaN(destLng)
  ) {
    return null
  }
  const origin = `${pickupLat},${pickupLng}`
  const destination = `${destLat},${destLng}`
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
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

function TripRequestsContent() {
  const queryClient = useQueryClient()
  const {
    status,
    tripType,
    startDate,
    endDate,
    view,
    searchInput,
    setSearchInput,
    debouncedSearch,
    page,
    pageSize,
    setPage,
    setPageSize,
    clampPage,
    setFilter,
  } = useTripRequestFilters()

  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<TripRequestRow | null>(null)

  const { data: requests, isLoading } = useQuery({
    queryKey: ['trip-requests', status, tripType, debouncedSearch, startDate, endDate],
    queryFn: () =>
      fetchTripRequests({
        status,
        tripType,
        searchQuery: debouncedSearch,
        dateFrom: startDate,
        dateTo: endDate,
      }),
  })

  const total = requests?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    clampPage(totalPages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages])

  const currentPage = Math.min(page, totalPages)
  const paginatedRequests = useMemo(() => {
    if (!requests?.length) return []
    return requests.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [requests, currentPage, pageSize])

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)
  const pending = requests?.filter(r => r.status === 'requested').length ?? 0
  const completed = requests?.filter(r => r.status === 'completed').length ?? 0
  const cancelled = requests?.filter(r => r.status === 'cancelled').length ?? 0

  function openRequestDetails(request: TripRequestRow) {
    setSelectedRequest(request)
  }

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

  const directionsMapsUrl = selectedRequest
    ? googleMapsDirectionsUrl(
        selectedRequest.pickup_latitude,
        selectedRequest.pickup_longitude,
        selectedRequest.destination_latitude,
        selectedRequest.destination_longitude
      )
    : null

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
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <select
              value={status}
              onChange={e => setFilter('status', e.target.value)}
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
              onChange={e => setFilter('type', e.target.value)}
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
            value={startDate}
            onChange={e => setFilter('start', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            aria-label="Filter from date"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setFilter('end', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            aria-label="Filter to date"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total} requests {total > 0 ? `(Page ${currentPage} of ${totalPages})` : ''}
        </p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter('view', 'table')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setFilter('view', 'card')}
            className={`p-1.5 rounded-md transition-colors ${
              view === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Requests */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : requests && requests.length > 0 ? (
          view === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
              {paginatedRequests.map(r => {
                const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openRequestDetails(r)}
                    className="text-left border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[r.status] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tripTypeColors[r.trip_type] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {r.trip_type.replace('_', ' ')}
                        </span>
                        {isExpired && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            Expired
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{format(new Date(r.created_at), 'MMM d')}</span>
                    </div>

                    <div className="mt-3">
                      <p className="text-sm font-semibold text-gray-900">{r.rider?.user?.full_name || 'Unknown rider'}</p>
                      <p className="text-xs text-gray-500">{r.rider?.user?.phone_number || 'No phone number'}</p>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700 line-clamp-2">{r.pickup_address}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-300 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-500 line-clamp-2">{r.destination_address || 'No destination provided'}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Users className="h-4 w-4 text-gray-400" />
                        {r.passenger_count}
                      </span>
                      <span className="font-medium text-gray-900">
                        {r.estimated_fare != null ? `GYD ${r.estimated_fare.toFixed(2)}` : 'Fare N/A'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
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
                  {paginatedRequests.map(r => {
                    const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false
                    return (
                      <tr
                        key={r.id}
                        onClick={() => openRequestDetails(r)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
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
                              onClick={e => {
                                e.stopPropagation()
                                handleCancel(r.id)
                              }}
                              disabled={cancellingId === r.id}
                              className="text-sm text-red-600 hover:text-red-900 font-medium disabled:opacity-50"
                            >
                              {cancellingId === r.id ? (
                                <span className="flex items-center gap-1">
                                  <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                                  Cancelling...
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
          )
        ) : (
          <div className="text-center py-12">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No trip requests found</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 sm:px-6">
          <p className="text-sm text-gray-600">
            Showing{' '}
            <span className="font-medium text-gray-900">{rangeStart}</span>
            {'–'}
            <span className="font-medium text-gray-900">{rangeEnd}</span>
            {' of '}
            <span className="font-medium text-gray-900">{total}</span>
            {' requests'}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-sm text-gray-600 whitespace-nowrap">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Trip request details"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Trip Request Details</h2>
                <p className="text-xs text-gray-500 mt-1">Request ID: {selectedRequest.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close details dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedRequest.status] ?? 'bg-gray-100 text-gray-800'}`}>
                    {selectedRequest.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Trip Type</p>
                  <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tripTypeColors[selectedRequest.trip_type] ?? 'bg-gray-100 text-gray-800'}`}>
                    {selectedRequest.trip_type.replace('_', ' ')}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Passengers</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{selectedRequest.passenger_count}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Rider</h3>
                  <div className="rounded-lg border border-gray-200 p-3 space-y-1 text-sm">
                    <p className="text-gray-900">{selectedRequest.rider?.user?.full_name || 'Unknown rider'}</p>
                    <p className="text-gray-600">{selectedRequest.rider?.user?.phone_number || 'No phone number'}</p>
                    <p className="text-gray-600">{selectedRequest.rider?.user?.email || 'No email'}</p>
                    <p className="text-xs text-gray-500 pt-1">Rider ID: {selectedRequest.rider_id || 'N/A'}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Timing</h3>
                  <div className="rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
                    <p className="text-gray-700">
                      Created: <span className="text-gray-900">{format(new Date(selectedRequest.created_at), 'MMM d, yyyy h:mm a')}</span>
                    </p>
                    <p className="text-gray-700">
                      Updated: <span className="text-gray-900">{format(new Date(selectedRequest.updated_at), 'MMM d, yyyy h:mm a')}</span>
                    </p>
                    <p className="text-gray-700">
                      Expires:{' '}
                      <span className="text-gray-900">
                        {selectedRequest.expires_at ? format(new Date(selectedRequest.expires_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Route</h3>
                  {directionsMapsUrl ? (
                    <a
                      href={directionsMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                      Directions in Google Maps
                    </a>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-3 space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Pickup</p>
                    <p className="text-gray-900">{selectedRequest.pickup_address}</p>
                    <p className="text-xs text-gray-500">
                      {selectedRequest.pickup_latitude}, {selectedRequest.pickup_longitude}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Destination</p>
                    <p className="text-gray-900">{selectedRequest.destination_address || 'N/A'}</p>
                    <p className="text-xs text-gray-500">
                      {selectedRequest.destination_latitude != null && selectedRequest.destination_longitude != null
                        ? `${selectedRequest.destination_latitude}, ${selectedRequest.destination_longitude}`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Fare</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {selectedRequest.estimated_fare != null ? `GYD ${selectedRequest.estimated_fare.toFixed(2)}` : 'N/A'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Distance</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {selectedRequest.estimated_distance_km != null ? `${selectedRequest.estimated_distance_km.toFixed(2)} km` : 'N/A'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Duration</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {selectedRequest.estimated_duration_minutes != null ? `${selectedRequest.estimated_duration_minutes} min` : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                  {selectedRequest.notes || 'No notes provided'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TripRequestsPage() {
  return (
    <Suspense>
      <TripRequestsContent />
    </Suspense>
  )
}
