'use client'

import { useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { resolveReviewItem } from '../actions'
import { ArrowLeft, Star, Flag, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

type ReviewItem = {
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
    rating_average: number | null
    rating_count: number | null
    user: {
      full_name: string | null
      phone_number: string | null
      email: string | null
    } | null
  } | null
  trip: {
    id: string
    driver_id: string | null
    completed_at: string | null
    pickup_address: string | null
    destination_address: string | null
    actual_fare: number | null
    rider_rating: number | null
    rider_feedback: string | null
    driver: {
      id: string
      user: { full_name: string | null; phone_number: string | null } | null
    } | null
  } | null
  flagged_by: { full_name: string | null } | null
  resolver: { full_name: string | null } | null
}

async function fetchReviewItem(id: string): Promise<ReviewItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rating_review_queue')
    .select(
      `
      *,
      rider_profile:rider_id (
        id,
        rating_average,
        rating_count,
        user:user_id (full_name, phone_number, email)
      ),
      trip:trip_id (
        id,
        driver_id,
        completed_at,
        pickup_address,
        destination_address,
        actual_fare,
        rider_rating,
        rider_feedback,
        driver:driver_id (
          id,
          user:user_id (full_name, phone_number)
        )
      ),
      flagged_by:flagged_by_user_id (full_name),
      resolver:resolved_by (full_name)
    `,
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as ReviewItem
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-gray-400">No rating</span>
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${
            i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
          }`}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-sm font-medium text-gray-700">{rating}/5</span>
    </span>
  )
}

const statusColors: Record<ReviewItem['status'], string> = {
  open: 'bg-red-100 text-red-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
}

export default function ReviewQueueDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { data: item, isLoading, error } = useQuery({
    queryKey: ['rating-review-queue-item', params.id],
    queryFn: () => fetchReviewItem(params.id),
  })

  function handleResolve(decision: 'resolved' | 'dismissed') {
    setActionError(null)
    if (note.trim().length === 0) {
      setActionError('Please add a resolution note before submitting.')
      return
    }
    startTransition(async () => {
      const result = await resolveReviewItem(params.id, decision, note)
      if (!result.success) {
        setActionError(result.error ?? 'Failed to update review item.')
        return
      }
      await queryClient.invalidateQueries({
        queryKey: ['rating-review-queue-item', params.id],
      })
      await queryClient.invalidateQueries({ queryKey: ['rating-review-queue'] })
      router.push('/admin/review-queue')
    })
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/review-queue"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to queue
        </Link>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-red-700">Could not load this review item.</p>
        </div>
      </div>
    )
  }

  const riderName = item.rider_profile?.user?.full_name ?? 'Unknown rider'
  const driverName = item.trip?.driver?.user?.full_name ?? 'Unknown driver'

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/review-queue"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to queue
        </Link>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Review item
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Created {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
              statusColors[item.status]
            }`}
          >
            {item.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Rating</h2>
          <Stars rating={item.rating} />
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Feedback
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {item.feedback || (
                <span className="text-gray-400">No written feedback</span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Source
              </p>
              <p className="mt-1 text-sm font-medium inline-flex items-center gap-1.5">
                {item.flag_source === 'auto_low_rating' ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    Auto-flagged (rating ≤ 2)
                  </>
                ) : (
                  <>
                    <Flag className="h-4 w-4 text-blue-600" />
                    Manual flag
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Flagged by
              </p>
              <p className="mt-1 text-sm text-gray-800">
                {item.flagged_by?.full_name ?? '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Trip</h2>
          {item.trip ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Pickup
                </p>
                <p className="text-gray-800">{item.trip.pickup_address ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Destination
                </p>
                <p className="text-gray-800">
                  {item.trip.destination_address ?? '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Completed
                  </p>
                  <p className="text-gray-800">
                    {item.trip.completed_at
                      ? format(
                          new Date(item.trip.completed_at),
                          'MMM d, yyyy h:mm a',
                        )
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Fare
                  </p>
                  <p className="text-gray-800">
                    {item.trip.actual_fare
                      ? `GYD ${item.trip.actual_fare.toFixed(2)}`
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <Link
                  href={`/admin/trips/${item.trip.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View full trip →
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Trip data unavailable.</p>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Rider</h2>
          <div className="text-sm space-y-1">
            <p className="text-gray-900 font-medium">{riderName}</p>
            {item.rider_profile?.user?.phone_number && (
              <p className="text-gray-600">
                {item.rider_profile.user.phone_number}
              </p>
            )}
            {item.rider_profile?.user?.email && (
              <p className="text-gray-600">{item.rider_profile.user.email}</p>
            )}
          </div>
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Lifetime rating
            </p>
            <p className="text-gray-800">
              {item.rider_profile?.rating_average?.toFixed(2) ?? '—'} avg ·{' '}
              {item.rider_profile?.rating_count ?? 0} ratings
            </p>
          </div>
          <Link
            href={`/admin/riders/${item.rider_id}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View rider profile →
          </Link>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Driver</h2>
          <p className="text-sm text-gray-900 font-medium">{driverName}</p>
          {item.trip?.driver?.user?.phone_number && (
            <p className="text-sm text-gray-600">
              {item.trip.driver.user.phone_number}
            </p>
          )}
          {item.trip?.driver?.id && (
            <Link
              href={`/admin/drivers/${item.trip.driver.id}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View driver profile →
            </Link>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Resolution</h2>
        {item.status !== 'open' ? (
          <div className="space-y-2">
            <p className="inline-flex items-center text-sm text-gray-700">
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
              {item.status === 'resolved' ? 'Resolved' : 'Dismissed'} by{' '}
              {item.resolver?.full_name ?? 'an admin'}
              {item.resolved_at && (
                <span className="text-gray-500 ml-1">
                  on {format(new Date(item.resolved_at), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </p>
            {item.resolution_note && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-wrap">
                {item.resolution_note}
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="resolution-note"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Resolution note
              </label>
              <textarea
                id="resolution-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="What was decided and why?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                {note.length}/1000 characters
              </p>
            </div>
            {actionError && (
              <p className="text-sm text-red-700">{actionError}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleResolve('resolved')}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {isPending ? 'Saving…' : 'Mark resolved'}
              </button>
              <button
                type="button"
                onClick={() => handleResolve('dismissed')}
                disabled={isPending}
                className="inline-flex items-center px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-800 rounded-lg text-sm font-medium"
              >
                {isPending ? 'Saving…' : 'Dismiss'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
