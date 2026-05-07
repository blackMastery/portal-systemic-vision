'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Filter, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import type { IncidentCategory, IncidentReporterRole, IncidentStatus } from '@/types/database'

const PAGE_SIZE = 50

type IncidentListRow = {
  id: string
  trip_id: string | null
  reporter_user_id: string
  reporter_role: IncidentReporterRole
  category: IncidentCategory
  status: IncidentStatus
  description: string
  created_at: string
  reporter: { full_name: string | null; phone_number: string | null } | null
  trip: {
    id: string
    pickup_address: string | null
    destination_address: string | null
  } | null
}

const categoryLabels: Record<IncidentCategory, string> = {
  safety_concern: 'Safety concern',
  harassment: 'Harassment',
  assault: 'Assault',
  robbery: 'Robbery',
  accident: 'Accident',
  payment_dispute: 'Payment dispute',
  driver_conduct: 'Driver conduct',
  passenger_conduct: 'Passenger conduct',
  other: 'Other',
}

const statusColors: Record<IncidentStatus, string> = {
  open: 'bg-red-100 text-red-800',
  under_review: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  escalated: 'bg-purple-100 text-purple-800',
}

async function fetchIncidents(filters: {
  status: string
  category: string
  reporterRole: string
  dateFrom: string
  dateTo: string
  page: number
}) {
  const supabase = createClient()
  const from = filters.page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('incidents')
    .select(
      `
      id,
      trip_id,
      reporter_user_id,
      reporter_role,
      category,
      status,
      description,
      created_at,
      reporter:reporter_user_id (full_name, phone_number),
      trip:trip_id (id, pickup_address, destination_address)
    `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.category !== 'all') {
    query = query.eq('category', filters.category)
  }
  if (filters.reporterRole !== 'all') {
    query = query.eq('reporter_role', filters.reporterRole)
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', new Date(filters.dateFrom).toISOString())
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo)
    end.setHours(23, 59, 59, 999)
    query = query.lte('created_at', end.toISOString())
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as IncidentListRow[], total: count ?? 0 }
}

export default function AdminIncidentsPage() {
  const [status, setStatus] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [reporterRole, setReporterRole] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-incidents', status, category, reporterRole, dateFrom, dateTo, page],
    queryFn: () =>
      fetchIncidents({
        status,
        category,
        reporterRole,
        dateFrom,
        dateTo,
        page,
      }),
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const fromIdx = page * PAGE_SIZE
  const toIdx = Math.min(fromIdx + PAGE_SIZE, total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Incidents</h1>
        <p className="mt-1 text-sm text-gray-600">
          Driver and rider incident reports, preserved trip evidence, and dashcam requests.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="escalated">Escalated</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All</option>
              {(Object.keys(categoryLabels) as IncidentCategory[]).map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reporter</label>
            <select
              value={reporterRole}
              onChange={(e) => {
                setReporterRole(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All</option>
              <option value="driver">Driver</option>
              <option value="rider">Rider</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Created
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Reporter
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trip
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                        <Link
                          href={`/admin/incidents/${row.id}`}
                          className="text-gray-700 hover:text-blue-700"
                        >
                          {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                        </Link>
                      </td>
                      <td className="px-4 md:px-6 py-3 text-sm">
                        <span className="font-medium text-gray-900">
                          {row.reporter?.full_name ?? '—'}
                        </span>
                        <div className="text-xs text-gray-500 capitalize">{row.reporter_role}</div>
                        {row.reporter?.phone_number && (
                          <div className="text-xs text-gray-500">{row.reporter.phone_number}</div>
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-3 text-sm text-gray-700">
                        {categoryLabels[row.category]}
                      </td>
                      <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                        <Link
                          href={`/admin/incidents/${row.id}`}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[row.status]
                          }`}
                        >
                          {row.status.replace('_', ' ')}
                        </Link>
                      </td>
                      <td className="px-4 md:px-6 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {row.trip_id ? (
                          <Link
                            href={`/admin/trips/${row.trip_id}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {row.trip?.pickup_address ?? row.trip_id.slice(0, 8) + '…'}
                          </Link>
                        ) : (
                          <span className="text-gray-400">No trip</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 md:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  Showing {fromIdx + 1}–{toIdx} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No incidents match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
