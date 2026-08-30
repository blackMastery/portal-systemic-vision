'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana } from '@/lib/guyana-time'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { formatCurrency } from '@/lib/format'
import { LineChart, toLineSeries } from './charts/line-chart'
import { BarChart } from './charts/bar-chart'
import { CHART_COLORS } from './chart-theme'
import { Route, DollarSign, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface TripAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type TripData = {
  requested_at: string
  status: string
  actual_fare: number | null
  estimated_fare: number | null
  actual_distance_km: number | null
  estimated_distance_km: number | null
  actual_duration_minutes: number | null
}

async function fetchTripAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // One ordered query; type/night/status breakdowns are derived client-side
  const trips = await fetchAllRows<TripData>(() => {
    let query = supabase
      .from('trips')
      .select('requested_at, status, actual_fare, estimated_fare, actual_distance_km, estimated_distance_km, actual_duration_minutes')
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: true })
    if (startDate) query = query.gte('requested_at', startDate)
    return query
  })

  return { trips }
}

export function TripAnalytics({ dateRange }: TripAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trip-analytics', dateRange.start?.toISOString() ?? 'all', dateRange.end.toISOString()],
    queryFn: () => fetchTripAnalytics(dateRange),
  })

  const completedTripRows = data?.trips.filter(t => t.status === 'completed') || []

  // Process trip volume over time (bucketed by Guyana calendar day)
  const tripVolumeData = data?.trips.reduce((acc: any, trip) => {
    const day = formatGuyana(trip.requested_at, 'yyyy-MM-dd')
    if (!acc[day]) {
      acc[day] = { day, date: formatGuyana(trip.requested_at, 'MMM d'), completed: 0, cancelled: 0, total: 0 }
    }
    acc[day].total++
    if (trip.status === 'completed') acc[day].completed++
    if (trip.status === 'cancelled') acc[day].cancelled++
    return acc
  }, {}) || {}

  const tripVolumeChart = Object.values(tripVolumeData as Record<string, { day: string }>)
    .sort((a, b) => a.day.localeCompare(b.day))

  // Process status breakdown
  const statusData = data?.trips.reduce((acc: any, trip) => {
    acc[trip.status] = (acc[trip.status] || 0) + 1
    return acc
  }, {}) || {}

  const statusChart = Object.entries(statusData).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))

  // Calculate metrics
  const totalTrips = data?.trips.length || 0
  const completedTrips = completedTripRows.length
  const completionRate = totalTrips > 0 ? ((completedTrips / totalTrips) * 100).toFixed(1) : '0'
  const completedTripsWithFare = completedTripRows.filter(t => t.actual_fare)
  const avgFare = completedTripsWithFare.length > 0
    ? completedTripsWithFare.reduce((sum, t) => sum + (t.actual_fare || 0), 0) / completedTripsWithFare.length
    : 0
  const totalRevenue = completedTripsWithFare.reduce((sum, t) => sum + (t.actual_fare || 0), 0)
  const completedTripsWithEstimate = completedTripRows.filter(t => t.estimated_fare)
  const avgEstimatedFare = completedTripsWithEstimate.length > 0
    ? completedTripsWithEstimate.reduce((sum, t) => sum + (t.estimated_fare || 0), 0) / completedTripsWithEstimate.length
    : 0
  const estimatedRevenue = completedTripsWithEstimate.reduce((sum, t) => sum + (t.estimated_fare || 0), 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Route className="h-6 w-6" />
        Trip Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Trips"
          value={totalTrips}
          description="All trips requested in the selected range"
          icon={Route}
          color="blue"
        />
        <MetricCard
          title="Completion Rate"
          value={`${completionRate}%`}
          description="Completed trips as a share of all trips"
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Average Fare (Actual)"
          value={formatCurrency(avgFare)}
          description="Mean final fare charged on completed trips"
          icon={DollarSign}
          color="purple"
        />
        <MetricCard
          title="Average Fare (Estimated)"
          value={formatCurrency(avgEstimatedFare)}
          description="Mean quoted fare on completed trips"
          icon={DollarSign}
          color="indigo"
        />
        <MetricCard
          title="Total Revenue (Actual)"
          value={formatCurrency(totalRevenue)}
          description="Sum of final fares charged on completed trips"
          icon={DollarSign}
          color="emerald"
        />
        <MetricCard
          title="Total Revenue (Estimated)"
          value={formatCurrency(estimatedRevenue)}
          description="Sum of quoted fares on completed trips"
          icon={DollarSign}
          color="yellow"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Trip Volume Over Time"
          description="Daily trip counts by status"
          isLoading={isLoading}
          isError={isError}
          isEmpty={tripVolumeChart.length === 0}
        >
          <LineChart
            series={toLineSeries(tripVolumeChart as Record<string, unknown>[], [
              { id: 'Total', key: 'total', color: CHART_COLORS.info },
              { id: 'Completed', key: 'completed', color: CHART_COLORS.success },
              { id: 'Cancelled', key: 'cancelled', color: CHART_COLORS.danger },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Trip Status Breakdown"
          description="Distribution of trips by status"
          isLoading={isLoading}
          isError={isError}
          isEmpty={statusChart.length === 0}
        >
          <BarChart data={statusChart.map(d => ({ label: d.name, value: Number(d.value) }))} />
        </ChartWrapper>
      </div>
    </div>
  )
}
