'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana, parseApiTimestamptz } from '@/lib/guyana-time'
import { embeddedOne, median, topEntries } from '@/lib/stats'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { getDriverBlockStats } from '@/app/admin/analytics/actions'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, toLineSeries } from './charts/line-chart'
import { BarChart } from './charts/bar-chart'
import { CHART_COLORS } from './chart-theme'
import { Ban, Clock, UserX, XCircle } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface CancellationAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type EmbeddedUser = { role: string | null }

type CancellationTripRow = {
  requested_at: string
  status: string
  driver_arrived_at: string | null
  picked_up_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  cancelled_by_user: EmbeddedUser | EmbeddedUser[] | null
}

/**
 * Which milestone the trip had reached when it was cancelled. Later stages cost
 * more: the driver has already burned time and fuel getting to the pickup.
 *
 * A `trips` row is only ever inserted by `accept_trip_request`, so every trip
 * here is already past acceptance — demand abandoned *before* a driver accepted
 * never becomes a trip and shows up as an expired request under Matching.
 */
const STAGES = ['En route to pickup', 'Waiting at pickup', 'Mid-trip'] as const
type Stage = (typeof STAGES)[number]

function cancellationStage(trip: CancellationTripRow): Stage {
  if (trip.picked_up_at) return 'Mid-trip'
  if (trip.driver_arrived_at) return 'Waiting at pickup'
  return 'En route to pickup'
}

const PARTIES = ['Rider', 'Driver', 'Admin', 'Unknown'] as const
type Party = (typeof PARTIES)[number]

function cancellationParty(trip: CancellationTripRow): Party {
  const role = embeddedOne(trip.cancelled_by_user)?.role
  if (role === 'rider') return 'Rider'
  if (role === 'driver') return 'Driver'
  if (role === 'admin') return 'Admin'
  return 'Unknown'
}

/** Free-text reasons: collapse whitespace/case so near-duplicates rank together. */
function normalizeReason(reason: string | null): string {
  const trimmed = (reason ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return 'No reason given'
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1, 60)
}

async function fetchCancellationAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // All trips in range: the denominator for the cancellation rate comes from
  // the same set the breakdowns are derived from.
  const trips = await fetchAllRows<CancellationTripRow>(() => {
    let query = supabase
      .from('trips')
      .select(
        'requested_at, status, driver_arrived_at, picked_up_at, cancelled_at, cancellation_reason, cancelled_by_user:cancelled_by_user_id(role)'
      )
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: true })
    if (startDate) query = query.gte('requested_at', startDate)
    return query
  })

  // driver_request_blocks has RLS enabled with no policy, so it is unreadable
  // from the browser client; the aggregate comes back from a server action.
  const blocks = await getDriverBlockStats(startDate ?? null, endDate)
  if (!blocks.ok) throw new Error(blocks.error)

  return { trips, blockStats: blocks.stats }
}

export function CancellationAnalytics({ dateRange }: CancellationAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'cancellation-analytics',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end.toISOString(),
    ],
    queryFn: () => fetchCancellationAnalytics(dateRange),
  })

  const derived = useMemo(() => {
    const trips = data?.trips ?? []
    const cancelled = trips.filter(t => t.status === 'cancelled')

    // Daily counts per cancelling party
    const byDay: Record<string, { day: string; date: string } & Record<Party, number>> = {}
    for (const trip of cancelled) {
      const stamp = trip.cancelled_at ?? trip.requested_at
      const day = formatGuyana(stamp, 'yyyy-MM-dd')
      if (!byDay[day]) {
        byDay[day] = {
          day,
          date: formatGuyana(stamp, 'MMM d'),
          Rider: 0,
          Driver: 0,
          Admin: 0,
          Unknown: 0,
        }
      }
      byDay[day][cancellationParty(trip)]++
    }
    const overTime = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day))

    const stageCounts: Record<Stage, number> = {
      'En route to pickup': 0,
      'Waiting at pickup': 0,
      'Mid-trip': 0,
    }
    const partyCounts: Record<Party, number> = { Rider: 0, Driver: 0, Admin: 0, Unknown: 0 }
    const reasonCounts: Record<string, number> = {}
    const timesToCancel: number[] = []

    for (const trip of cancelled) {
      stageCounts[cancellationStage(trip)]++
      partyCounts[cancellationParty(trip)]++
      reasonCounts[normalizeReason(trip.cancellation_reason)] =
        (reasonCounts[normalizeReason(trip.cancellation_reason)] ?? 0) + 1

      if (trip.cancelled_at) {
        const minutes =
          (parseApiTimestamptz(trip.cancelled_at).getTime() -
            parseApiTimestamptz(trip.requested_at).getTime()) /
          60000
        if (Number.isFinite(minutes) && minutes >= 0) timesToCancel.push(minutes)
      }
    }

    const totalTrips = trips.length
    const totalCancelled = cancelled.length

    return {
      overTime,
      stageChart: STAGES.map(stage => ({ label: stage, value: stageCounts[stage] })),
      reasonChart: topEntries(reasonCounts, 8),
      blockChart: data?.blockStats.topDrivers ?? [],
      totalTrips,
      totalCancelled,
      cancellationRate: totalTrips > 0 ? (totalCancelled / totalTrips) * 100 : 0,
      midTripShare: totalCancelled > 0 ? (stageCounts['Mid-trip'] / totalCancelled) * 100 : 0,
      driverShare: totalCancelled > 0 ? (partyCounts.Driver / totalCancelled) * 100 : 0,
      medianTimeToCancel: median(timesToCancel),
      timeToCancelSample: timesToCancel.length,
      totalBlocks: data?.blockStats.total ?? 0,
    }
  }, [data])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <XCircle className="h-6 w-6" />
        Cancellation Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Cancellation Rate"
          value={`${derived.cancellationRate.toFixed(1)}%`}
          description={`${derived.totalCancelled.toLocaleString()} of ${derived.totalTrips.toLocaleString()} trips`}
          icon={XCircle}
          color="red"
        />
        <MetricCard
          title="Cancelled Mid-Trip"
          value={`${derived.midTripShare.toFixed(1)}%`}
          description="Share of cancellations made after the rider was picked up"
          icon={UserX}
          color="yellow"
        />
        <MetricCard
          title="Driver-Initiated"
          value={`${derived.driverShare.toFixed(1)}%`}
          description="Share of cancellations made by the driver"
          icon={Ban}
          color="purple"
        />
        <MetricCard
          title="Median Time to Cancel"
          value={`${derived.medianTimeToCancel.toFixed(1)} min`}
          description={`From request to cancellation (${derived.timeToCancelSample.toLocaleString()} of ${derived.totalCancelled.toLocaleString()} with usable timestamps)`}
          icon={Clock}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Cancellations Over Time"
          description="Daily cancellations by who cancelled"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.overTime.length === 0}
        >
          <LineChart
            series={toLineSeries(derived.overTime as unknown as Record<string, unknown>[], [
              { id: 'Rider', key: 'Rider', color: CHART_COLORS.info },
              { id: 'Driver', key: 'Driver', color: CHART_COLORS.danger },
              { id: 'Admin', key: 'Admin', color: CHART_COLORS.violet },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Cancellation Stage"
          description="How far the trip had progressed when it was cancelled — trips only exist once a driver has accepted"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.totalCancelled === 0}
        >
          <BarChart data={derived.stageChart} color={CHART_COLORS.warningStrong} />
        </ChartWrapper>

        <ChartWrapper
          title="Top Cancellation Reasons"
          description="Most common reasons recorded on cancelled trips"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.reasonChart.length === 0}
        >
          <BarChart data={derived.reasonChart} color={CHART_COLORS.danger} maxXTicks={8} />
        </ChartWrapper>

        <ChartWrapper
          title="Driver Re-Block Leaders"
          description={`Drivers blocked from re-accepting a request after cancelling (${derived.totalBlocks.toLocaleString()} blocks)`}
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.blockChart.length === 0}
          emptyMessage="No drivers cancelled after accepting in this range"
        >
          <BarChart data={derived.blockChart} color={CHART_COLORS.primaryStrong} maxXTicks={10} />
        </ChartWrapper>
      </div>
    </div>
  )
}
