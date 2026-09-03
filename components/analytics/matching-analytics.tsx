'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana, parseApiTimestamptz } from '@/lib/guyana-time'
import { median, percentile } from '@/lib/stats'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, toLineSeries } from './charts/line-chart'
import { BarChart } from './charts/bar-chart'
import { HeatmapGrid } from './charts/heatmap-grid'
import { CHART_COLORS } from './chart-theme'
import { Car, Hourglass, Shuffle, Target, Timer } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface MatchingAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type RequestRow = {
  id: string
  created_at: string
  status: string
  expires_at: string | null
}

type MatchedTripRow = {
  request_id: string | null
  driver_id: string | null
  requested_at: string
  accepted_at: string | null
  status: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

/** Upper bound (minutes) of each time-to-accept bucket; the last is open-ended. */
const ACCEPT_BUCKETS = [
  { label: '<1 min', max: 1 },
  { label: '1–2 min', max: 2 },
  { label: '2–5 min', max: 5 },
  { label: '5–10 min', max: 10 },
  { label: '10–20 min', max: 20 },
  { label: '20 min+', max: Infinity },
]

async function fetchMatchingAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  const requests = await fetchAllRows<RequestRow>(() => {
    let query = supabase
      .from('trip_requests')
      .select('id, created_at, status, expires_at')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  const trips = await fetchAllRows<MatchedTripRow>(() => {
    let query = supabase
      .from('trips')
      .select('request_id, driver_id, requested_at, accepted_at, status')
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: true })
    if (startDate) query = query.gte('requested_at', startDate)
    return query
  })

  return { requests, trips }
}

export function MatchingAnalytics({ dateRange }: MatchingAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'matching-analytics',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end.toISOString(),
    ],
    queryFn: () => fetchMatchingAnalytics(dateRange),
  })

  const derived = useMemo(() => {
    const requests = data?.requests ?? []
    const trips = data?.trips ?? []

    // A request is "matched" once any trip references it, regardless of how
    // that trip later ended — the question here is whether a driver picked it up.
    const matchedRequestIds = new Set(
      trips.map(t => t.request_id).filter((id): id is string => Boolean(id))
    )

    type DayBucket = {
      day: string
      date: string
      requests: number
      matched: number
      drivers: Set<string>
    }
    const byDay: Record<string, DayBucket> = {}
    const bucketFor = (stamp: string): DayBucket => {
      const day = formatGuyana(stamp, 'yyyy-MM-dd')
      if (!byDay[day]) {
        byDay[day] = {
          day,
          date: formatGuyana(stamp, 'MMM d'),
          requests: 0,
          matched: 0,
          drivers: new Set(),
        }
      }
      return byDay[day]
    }

    const now = Date.now()
    // Weekday x hour matrix of demand that timed out unmatched
    const unmetMatrix = WEEKDAYS.map(() => HOURS.map(() => 0))
    let expiredCount = 0

    for (const request of requests) {
      const bucket = bucketFor(request.created_at)
      bucket.requests++
      if (matchedRequestIds.has(request.id)) bucket.matched++

      const expired =
        request.status === 'requested' &&
        request.expires_at !== null &&
        new Date(request.expires_at).getTime() < now
      if (expired) {
        expiredCount++
        // date-fns 'i' is ISO weekday, 1 = Monday
        const weekday = Number(formatGuyana(request.created_at, 'i')) - 1
        const hour = Number(formatGuyana(request.created_at, 'H'))
        if (unmetMatrix[weekday] && unmetMatrix[weekday][hour] !== undefined) {
          unmetMatrix[weekday][hour]++
        }
      }
    }

    const acceptMinutes: number[] = []
    for (const trip of trips) {
      if (!trip.accepted_at) continue
      const minutes =
        (parseApiTimestamptz(trip.accepted_at).getTime() -
          parseApiTimestamptz(trip.requested_at).getTime()) /
        60000
      if (Number.isFinite(minutes) && minutes >= 0) acceptMinutes.push(minutes)
      if (trip.driver_id) bucketFor(trip.accepted_at).drivers.add(trip.driver_id)
    }

    // Accepting a trip can create a bucket for a day with no requests of its
    // own (an accept just after midnight); those would read as a 0% fulfilment
    // dip, so the daily charts only cover days that actually saw demand.
    const days = Object.values(byDay)
      .filter(d => d.requests > 0)
      .sort((a, b) => a.day.localeCompare(b.day))

    const acceptDistribution = ACCEPT_BUCKETS.map((bucket, index) => {
      const lower = index === 0 ? -Infinity : ACCEPT_BUCKETS[index - 1].max
      return {
        label: bucket.label,
        value: acceptMinutes.filter(m => m > lower && m <= bucket.max).length,
      }
    })

    const activeDrivers = new Set(
      trips.map(t => t.driver_id).filter((id): id is string => Boolean(id))
    )

    // Count only requests inside the range: matchedRequestIds can name requests
    // made before it, whose trip happens to fall in range.
    const matchedInRange = requests.filter(r => matchedRequestIds.has(r.id)).length

    return {
      volumeChart: days.map(d => ({
        date: d.date,
        requests: d.requests,
        matched: d.matched,
      })),
      fulfillmentChart: days.map(d => ({
        date: d.date,
        rate: d.requests > 0 ? (d.matched / d.requests) * 100 : 0,
      })),
      supplyChart: days.map(d => ({
        date: d.date,
        requests: d.requests,
        drivers: d.drivers.size,
      })),
      unmetMatrix,
      acceptDistribution,
      totalRequests: requests.length,
      matchedRequests: matchedInRange,
      fulfillmentRate: requests.length > 0 ? (matchedInRange / requests.length) * 100 : 0,
      expiredCount,
      medianAccept: median(acceptMinutes),
      p90Accept: percentile(acceptMinutes, 0.9),
      activeDrivers: activeDrivers.size,
      hasUnmet: expiredCount > 0,
    }
  }, [data])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Shuffle className="h-6 w-6" />
        Supply &amp; Demand Matching
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Fulfilment Rate"
          value={`${derived.fulfillmentRate.toFixed(1)}%`}
          description={`${derived.matchedRequests.toLocaleString()} of ${derived.totalRequests.toLocaleString()} requests found a driver`}
          icon={Target}
          color="green"
        />
        <MetricCard
          title="Median Time to Accept"
          value={`${derived.medianAccept.toFixed(1)} min`}
          description="Half of accepted requests were picked up faster than this"
          icon={Timer}
          color="blue"
        />
        <MetricCard
          title="P90 Time to Accept"
          value={`${derived.p90Accept.toFixed(1)} min`}
          description="The wait the slowest 10% of riders actually feel"
          icon={Hourglass}
          color="yellow"
        />
        <MetricCard
          title="Accepting Drivers"
          value={derived.activeDrivers.toLocaleString()}
          description="Distinct drivers who accepted at least one trip"
          icon={Car}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Requests vs Matched Trips"
          description="Daily demand and how much of it a driver accepted"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.volumeChart.length === 0}
        >
          <LineChart
            series={toLineSeries(derived.volumeChart as unknown as Record<string, unknown>[], [
              { id: 'Requests', key: 'requests', color: CHART_COLORS.info },
              { id: 'Matched', key: 'matched', color: CHART_COLORS.success },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Fulfilment Rate Over Time"
          description="Requests matched to a driver, as a share of requests made that day"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.fulfillmentChart.length === 0}
        >
          <LineChart
            series={toLineSeries(derived.fulfillmentChart as unknown as Record<string, unknown>[], [
              { id: 'Fulfilment', key: 'rate', color: CHART_COLORS.success },
            ])}
            valueFormat={v => `${v.toFixed(1)}%`}
            axisFormat={v => `${v}%`}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Supply vs Demand"
          description="Daily requests against the number of drivers actually accepting"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.supplyChart.length === 0}
        >
          <LineChart
            series={toLineSeries(derived.supplyChart as unknown as Record<string, unknown>[], [
              { id: 'Requests', key: 'requests', color: CHART_COLORS.info },
              { id: 'Accepting drivers', key: 'drivers', color: CHART_COLORS.violet },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Time to Accept Distribution"
          description="How long riders waited before a driver accepted"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.acceptDistribution.every(b => b.value === 0)}
        >
          <BarChart data={derived.acceptDistribution} color={CHART_COLORS.info} />
        </ChartWrapper>
      </div>

      <ChartWrapper
        title="Unmet Demand by Hour and Day"
        description={`${derived.expiredCount.toLocaleString()} requests expired without a driver — darker cells are the hours you are short on supply (Guyana time)`}
        isLoading={isLoading}
        isError={isError}
        isEmpty={!derived.hasUnmet}
        emptyMessage="No requests expired in this range"
      >
        <HeatmapGrid
          rows={WEEKDAYS}
          columns={HOURS}
          values={derived.unmetMatrix}
          color={CHART_COLORS.danger}
          valueFormat={v => `${v.toLocaleString()} expired`}
          maxColumnTicks={12}
        />
      </ChartWrapper>
    </div>
  )
}
