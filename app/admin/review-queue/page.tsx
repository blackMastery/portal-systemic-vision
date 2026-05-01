'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Flag,
  Filter,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

const PAGE_SIZE = 50

type ReviewQueueRow = {
  id: string
  trip_id: string
  rider_id: string
  rating: number | null
  feedback: string | null
  flag_source: 'auto_low_rating' | 'manual'
  flagged_by_user_id: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  rider_profile: {
    id: string
    user: { full_name: string | null; phone_number: string | null } | null
  } | null
  trip: {
    id: string
    driver_id: string | null
    completed_at: string | null
    pickup_address: string | null
    destination_address: string | null
  } | null
  flagged_by: { full_name: string | null } | null
}

async function fetchReviewQueue(filters: {
  status: string
  flagSource: string
  page: number
}) {
  const supabase = createClient()
  const from = filters.page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('rating_review_queue')
    .select(
      `
      *,
      rider_profile:rider_id (
        id,
        user:user_id (full_name, phone_number)
      ),
      trip:trip_id (
        id,
        driver_id,
        completed_at,
        pickup_address,
        destination_address
      ),
      flagged_by:flagged_by_user_id (full_name)
    `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.flagSource !== 'all') {
    query = query.eq('flag_source', filters.flagSource)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as ReviewQueueRow[], total: count ?? 0 }
}

const statusColors: Record<ReviewQueueRow['status'], string> = {
  open: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
}

const sourceColors: Record<ReviewQueueRow['flag_source'], string> = {
  auto_low_rating: 'bg-amber-100 text-amber-800',
  manual: 'bg-blue-100 text-blue-800',
}

function StarsInline({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-gray-400">—</span>
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
          }`}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-xs text-gray-600">{rating}</span>
    </span>
  )
}

export default function ReviewQueuePage() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed' | 'all'>(
    'open',
  )
  const [flagSource, setFlagSource] = useState<
    'auto_low_rating' | 'manual' | 'all'
  >('all')
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['rating-review-queue', status, flagSource, page],
    queryFn: () => fetchReviewQueue({ status, flagSource, page }),
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const fromIdx = page * PAGE_SIZE
  const toIdx = Math.min(fromIdx + PAGE_SIZE, total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-600">
          Low rider ratings and admin-flagged trips that need attention.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source
            </label>
            <select
              value={flagSource}
              onChange={(e) => {
                setFlagSource(e.target.value as typeof flagSource)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">All</option>
              <option value="auto_low_rating">Auto (rating ≤ 2)</option>
              <option value="manual">Manual flag</option>
            </select>
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
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rider
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rating
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Feedback
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => {
                    const riderName =
                      row.rider_profile?.user?.full_name ?? 'Unknown rider'
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                          <Link
                            href={`/admin/review-queue/${row.id}`}
                            className="text-gray-700 hover:text-blue-700"
                          >
                            {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                          </Link>
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm">
                          <Link
                            href={`/admin/riders/${row.rider_id}`}
                            className="font-medium text-gray-900 hover:text-blue-700"
                          >
                            {riderName}
                          </Link>
                          {row.rider_profile?.user?.phone_number && (
                            <div className="text-xs text-gray-500">
                              {row.rider_profile.user.phone_number}
                            </div>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                          <StarsInline rating={row.rating} />
                        </td>
                        <td className="px-4 md:px-6 py-3 text-sm text-gray-600 max-w-md">
                          <div className="truncate" title={row.feedback ?? ''}>
                            {row.feedback || (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              sourceColors[row.flag_source]
                            }`}
                          >
                            {row.flag_source === 'auto_low_rating'
                              ? 'Auto'
                              : 'Manual'}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                          <Link
                            href={`/admin/review-queue/${row.id}`}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              statusColors[row.status]
                            } hover:opacity-80`}
                          >
                            {row.status}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
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
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <Flag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No items match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
