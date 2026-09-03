'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana, parseApiTimestamptz } from '@/lib/guyana-time'
import { mean, median } from '@/lib/stats'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, toLineSeries } from './charts/line-chart'
import { BarChart } from './charts/bar-chart'
import { CHART_COLORS } from './chart-theme'
import { Flag, Star, ThumbsDown } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface RatingAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type RatedTripRow = {
  completed_at: string
  driver_rating: number | null
  rider_rating: number | null
  driver_rating_friendly: number | null
  driver_rating_clean: number | null
  driver_rating_safe: number | null
  driver_rating_communicated_fairly: number | null
}

type ReviewFlagRow = {
  created_at: string
  status: string
  flag_source: string
  rating: number | null
  resolved_at: string | null
}

/** The four per-trip service dimensions riders score alongside the overall star. */
const DIMENSIONS = [
  { id: 'Friendly', key: 'driver_rating_friendly', color: CHART_COLORS.info },
  { id: 'Clean', key: 'driver_rating_clean', color: CHART_COLORS.success },
  { id: 'Safe', key: 'driver_rating_safe', color: CHART_COLORS.violet },
  { id: 'Fair comms', key: 'driver_rating_communicated_fairly', color: CHART_COLORS.warningStrong },
] as const

async function fetchRatingAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // Ratings land when a trip finishes, so this section is bucketed by
  // completed_at rather than requested_at like the trip volume charts.
  const trips = await fetchAllRows<RatedTripRow>(() => {
    let query = supabase
      .from('trips')
      .select(
        'completed_at, driver_rating, rider_rating, driver_rating_friendly, driver_rating_clean, driver_rating_safe, driver_rating_communicated_fairly'
      )
      .eq('status', 'completed')
      .lte('completed_at', endDate)
      .order('completed_at', { ascending: true })
    if (startDate) query = query.gte('completed_at', startDate)
    return query
  })

  const flags = await fetchAllRows<ReviewFlagRow>(() => {
    let query = supabase
      .from('rating_review_queue')
      .select('created_at, status, flag_source, rating, resolved_at')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  return { trips, flags }
}

export function RatingAnalytics({ dateRange }: RatingAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'rating-analytics',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end.toISOString(),
    ],
    queryFn: () => fetchRatingAnalytics(dateRange),
  })

  const derived = useMemo(() => {
    const trips = data?.trips ?? []
    const flags = data?.flags ?? []

    const driverRatings = trips
      .map(t => t.driver_rating)
      .filter((r): r is number => typeof r === 'number')
    const riderRatings = trips
      .map(t => t.rider_rating)
      .filter((r): r is number => typeof r === 'number')

    // Distribution over the 1-5 stars; a 4.6 built from 5s and 1s is a very
    // different business from one built from 4s and 5s.
    const distribution = [1, 2, 3, 4, 5].map(star => ({
      label: `${star}★`,
      value: driverRatings.filter(r => r === star).length,
    }))

    const dimensionAverages = DIMENSIONS.map(dimension => ({
      label: dimension.id,
      value: mean(
        trips
          .map(t => t[dimension.key])
          .filter((v): v is number => typeof v === 'number')
      ),
    }))

    // Daily coverage + dimension averages in one pass over completed trips
    type DayBucket = {
      day: string
      date: string
      completed: number
      driverRated: number
      riderRated: number
      dimensions: Record<string, number[]>
    }
    const byDay: Record<string, DayBucket> = {}
    for (const trip of trips) {
      const day = formatGuyana(trip.completed_at, 'yyyy-MM-dd')
      if (!byDay[day]) {
        byDay[day] = {
          day,
          date: formatGuyana(trip.completed_at, 'MMM d'),
          completed: 0,
          driverRated: 0,
          riderRated: 0,
          dimensions: Object.fromEntries(DIMENSIONS.map(d => [d.id, [] as number[]])),
        }
      }
      const bucket = byDay[day]
      bucket.completed++
      if (typeof trip.driver_rating === 'number') bucket.driverRated++
      if (typeof trip.rider_rating === 'number') bucket.riderRated++
      for (const dimension of DIMENSIONS) {
        const value = trip[dimension.key]
        if (typeof value === 'number') bucket.dimensions[dimension.id].push(value)
      }
    }
    const days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day))

    const coverageChart = days.map(d => ({
      date: d.date,
      driver: d.completed > 0 ? (d.driverRated / d.completed) * 100 : 0,
      rider: d.completed > 0 ? (d.riderRated / d.completed) * 100 : 0,
    }))

    const dimensionTrend = days.map(d => ({
      date: d.date,
      ...Object.fromEntries(DIMENSIONS.map(dim => [dim.id, mean(d.dimensions[dim.id])])),
    }))

    const flagStatuses = ['open', 'resolved', 'dismissed']
    const flagStatusChart = flagStatuses
      .map(status => ({
        label: status.charAt(0).toUpperCase() + status.slice(1),
        value: flags.filter(f => f.status === status).length,
      }))
      .filter(entry => entry.value > 0)

    const resolutionHours = flags
      .filter(f => f.resolved_at)
      .map(
        f =>
          (parseApiTimestamptz(f.resolved_at!).getTime() -
            parseApiTimestamptz(f.created_at).getTime()) /
          3600000
      )
      .filter(h => Number.isFinite(h) && h >= 0)

    const autoFlags = flags.filter(f => f.flag_source === 'auto_low_rating').length

    return {
      distribution,
      dimensionAverages,
      coverageChart,
      dimensionTrend,
      flagStatusChart,
      completedTrips: trips.length,
      avgDriverRating: mean(driverRatings),
      avgRiderRating: mean(riderRatings),
      driverCoverage: trips.length > 0 ? (driverRatings.length / trips.length) * 100 : 0,
      riderCoverage: trips.length > 0 ? (riderRatings.length / trips.length) * 100 : 0,
      lowRatings: driverRatings.filter(r => r <= 3).length,
      lowRatingShare:
        driverRatings.length > 0
          ? (driverRatings.filter(r => r <= 3).length / driverRatings.length) * 100
          : 0,
      openFlags: flags.filter(f => f.status === 'open').length,
      totalFlags: flags.length,
      autoFlags,
      medianResolutionHours: median(resolutionHours),
    }
  }, [data])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Star className="h-6 w-6" />
        Rating Quality
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Avg Driver Rating"
          value={derived.avgDriverRating.toFixed(2)}
          description={`Riders rated ${derived.driverCoverage.toFixed(0)}% of completed trips`}
          icon={Star}
          color="yellow"
        />
        <MetricCard
          title="Avg Rider Rating"
          value={derived.avgRiderRating.toFixed(2)}
          description={`Drivers rated ${derived.riderCoverage.toFixed(0)}% of completed trips`}
          icon={Star}
          color="blue"
        />
        <MetricCard
          title="Low Ratings (≤3★)"
          value={derived.lowRatings.toLocaleString()}
          description={`${derived.lowRatingShare.toFixed(1)}% of scored trips`}
          icon={ThumbsDown}
          color="red"
        />
        <MetricCard
          title="Open Review Flags"
          value={derived.openFlags.toLocaleString()}
          description={
            derived.totalFlags > 0
              ? `${derived.totalFlags.toLocaleString()} flagged · median ${derived.medianResolutionHours.toFixed(1)}h to resolve`
              : 'No ratings flagged in this range'
          }
          icon={Flag}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Driver Rating Distribution"
          description="Completed trips by star rating awarded"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.distribution.every(d => d.value === 0)}
        >
          <BarChart data={derived.distribution} color={CHART_COLORS.warningStrong} />
        </ChartWrapper>

        <ChartWrapper
          title="Rating Coverage Over Time"
          description="Share of completed trips that received a rating"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.coverageChart.length === 0}
        >
          <LineChart
            series={toLineSeries(derived.coverageChart as unknown as Record<string, unknown>[], [
              { id: 'Driver rated', key: 'driver', color: CHART_COLORS.info },
              { id: 'Rider rated', key: 'rider', color: CHART_COLORS.violet },
            ])}
            valueFormat={v => `${v.toFixed(0)}%`}
            axisFormat={v => `${v}%`}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Service Dimension Averages"
          description="Friendly, clean, safe and fair-communication scores"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.dimensionAverages.every(d => d.value === 0)}
        >
          <BarChart
            data={derived.dimensionAverages}
            color={CHART_COLORS.success}
            valueFormat={v => v.toFixed(2)}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Service Dimension Trends"
          description="Daily average per dimension — shows which one is dragging the overall star down"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.dimensionTrend.length === 0}
        >
          <LineChart
            series={toLineSeries(
              derived.dimensionTrend as unknown as Record<string, unknown>[],
              DIMENSIONS.map(d => ({ id: d.id, key: d.id, color: d.color }))
            )}
            valueFormat={v => v.toFixed(2)}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Rating Review Queue"
          description={`Flagged ratings by status — ${derived.autoFlags.toLocaleString()} auto-flagged, ${(derived.totalFlags - derived.autoFlags).toLocaleString()} raised manually`}
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.flagStatusChart.length === 0}
          emptyMessage="No ratings flagged for review in this range"
        >
          <BarChart data={derived.flagStatusChart} color={CHART_COLORS.violet} />
        </ChartWrapper>
      </div>
    </div>
  )
}
