'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import { subDays } from 'date-fns'
import { endOfDayGuyana, guyanaDayEnd, guyanaDayStart, startOfDayGuyana } from '@/lib/guyana-time'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { TripAnalytics } from '@/components/analytics/trip-analytics'
import { UserAnalytics } from '@/components/analytics/user-analytics'
import { DriverAnalytics } from '@/components/analytics/driver-analytics'
import { RiderAnalytics } from '@/components/analytics/rider-analytics'
import { FinancialAnalytics } from '@/components/analytics/financial-analytics'
import { OperationalAnalytics } from '@/components/analytics/operational-analytics'
import { SubscriptionAnalytics } from '@/components/analytics/subscription-analytics'
import { CancellationAnalytics } from '@/components/analytics/cancellation-analytics'
import { RatingAnalytics } from '@/components/analytics/rating-analytics'
import { MatchingAnalytics } from '@/components/analytics/matching-analytics'
import { GeographyAnalytics } from '@/components/analytics/geography-analytics'

type DateRangePreset = '7d' | '30d' | '90d' | 'all' | 'custom'

const dateInputClass =
  'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring'

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<DateRangePreset>('30d')
  // Drafts track the inputs directly; the committed values are debounced so
  // scrubbing a date field doesn't fire a query fan-out per keystroke.
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setCustomStart(draftStart)
      setCustomEnd(draftEnd)
    }, 400)
    return () => clearTimeout(timer)
  }, [draftStart, draftEnd])

  // Day boundaries are computed in Guyana time so every admin sees the same
  // windows regardless of their browser timezone. Presets include today, so
  // "last N days" subtracts N-1.
  const resolved = useMemo((): { range: AnalyticsDateRange } | { hint: string } => {
    const now = new Date()
    switch (preset) {
      case '7d':
        return { range: { start: startOfDayGuyana(subDays(now, 6)), end: endOfDayGuyana(now) } }
      case '30d':
        return { range: { start: startOfDayGuyana(subDays(now, 29)), end: endOfDayGuyana(now) } }
      case '90d':
        return { range: { start: startOfDayGuyana(subDays(now, 89)), end: endOfDayGuyana(now) } }
      case 'all':
        return { range: { start: null, end: endOfDayGuyana(now) } }
      case 'custom':
        if (!customStart || !customEnd) {
          return { hint: 'Pick a start and an end date to run the custom report.' }
        }
        if (customStart > customEnd) {
          return { hint: 'The start date must be on or before the end date.' }
        }
        return { range: { start: guyanaDayStart(customStart), end: guyanaDayEnd(customEnd) } }
    }
  }, [preset, customStart, customEnd])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Comprehensive insights into your Links transportation platform
        </p>
      </div>

      {/* Sticky toolbar: date filter + section shortcuts stay reachable on this long page */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-gray-50/95 backdrop-blur border-b border-gray-200 space-y-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" aria-hidden="true" />
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              aria-label="Date range"
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-ring focus:border-ring"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(e) => setDraftStart(e.target.value)}
                aria-label="Start date"
                className={dateInputClass}
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                aria-label="End date"
                className={dateInputClass}
              />
            </div>
          )}
        </div>

        <nav aria-label="Analytics sections" className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          {[
            ['#trips', 'Trips'],
            ['#cancellations', 'Cancellations'],
            ['#financial', 'Financial'],
            ['#users', 'Users'],
            ['#drivers-riders', 'Drivers & Riders'],
            ['#ratings', 'Ratings'],
            ['#operations', 'Operations'],
            ['#matching', 'Matching'],
            ['#geography', 'Geography'],
            ['#subscriptions', 'Subscriptions'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="shrink-0 whitespace-nowrap rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {/* Analytics Sections */}
      {'hint' in resolved ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          {resolved.hint}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Trip Analytics */}
          <section id="trips" className="scroll-mt-32">
            <TripAnalytics dateRange={resolved.range} />
          </section>

          {/* Cancellation Analytics */}
          <section id="cancellations" className="scroll-mt-32">
            <CancellationAnalytics dateRange={resolved.range} />
          </section>

          {/* Financial Analytics */}
          <section id="financial" className="scroll-mt-32">
            <FinancialAnalytics dateRange={resolved.range} />
          </section>

          {/* User Analytics */}
          <section id="users" className="scroll-mt-32">
            <UserAnalytics dateRange={resolved.range} />
          </section>

          {/* Driver & Rider Analytics (current-state snapshots, not date-filtered) */}
          <section id="drivers-riders" className="scroll-mt-32 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DriverAnalytics />
            <RiderAnalytics />
          </section>

          {/* Rating Quality */}
          <section id="ratings" className="scroll-mt-32">
            <RatingAnalytics dateRange={resolved.range} />
          </section>

          {/* Operational Analytics */}
          <section id="operations" className="scroll-mt-32">
            <OperationalAnalytics dateRange={resolved.range} />
          </section>

          {/* Supply & Demand Matching */}
          <section id="matching" className="scroll-mt-32">
            <MatchingAnalytics dateRange={resolved.range} />
          </section>

          {/* Geography & Demand */}
          <section id="geography" className="scroll-mt-32">
            <GeographyAnalytics dateRange={resolved.range} />
          </section>

          {/* Subscription Analytics */}
          <section id="subscriptions" className="scroll-mt-32">
            <SubscriptionAnalytics dateRange={resolved.range} />
          </section>
        </div>
      )}
    </div>
  )
}
