'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Route, DollarSign, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { format } from 'date-fns'

interface TripAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444']

type TripData = {
  requested_at: string
  status: string
  trip_type: string
  is_night_trip: boolean
  actual_fare: number | null
  estimated_fare: number | null
  actual_distance_km: number | null
  estimated_distance_km: number | null
  actual_duration_minutes: number | null
}

type TripTypeData = { trip_type: string }
type NightDayData = { is_night_trip: boolean }
type StatusData = { status: string }

async function fetchTripAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()
  const startDate = dateRange.start.toISOString()
  const endDate = dateRange.end.toISOString()

  // Trip volume over time
  const { data: trips } = await supabase
    .from('trips')
    .select('requested_at, status, trip_type, is_night_trip, actual_fare, estimated_fare, actual_distance_km, estimated_distance_km, actual_duration_minutes')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  // Trip type distribution
  const { data: tripTypes } = await supabase
    .from('trips')
    .select('trip_type')
    .eq('status', 'completed')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  // Night vs day
  const { data: nightDay } = await supabase
    .from('trips')
    .select('is_night_trip')
    .eq('status', 'completed')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  // Status breakdown
  const { data: statusBreakdown } = await supabase
    .from('trips')
    .select('status')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  return {
    trips: (trips as TripData[] | null) || [],
    tripTypes: (tripTypes as TripTypeData[] | null) || [],
    nightDay: (nightDay as NightDayData[] | null) || [],
    statusBreakdown: (statusBreakdown as StatusData[] | null) || [],
  }
}

export function TripAnalytics({ dateRange }: TripAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['trip-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchTripAnalytics(dateRange),
  })

  // Process trip volume over time
  const tripVolumeData = data?.trips.reduce((acc: any, trip) => {
    const date = format(new Date(trip.requested_at), 'MMM d')
    if (!acc[date]) {
      acc[date] = { date, completed: 0, cancelled: 0, total: 0 }
    }
    acc[date].total++
    if (trip.status === 'completed') acc[date].completed++
    if (trip.status === 'cancelled') acc[date].cancelled++
    return acc
  }, {}) || {}

  const tripVolumeChart = Object.values(tripVolumeData).slice(-30) // Last 30 days

  // Process trip type distribution
  const tripTypeData = data?.tripTypes.reduce((acc: any, trip) => {
    acc[trip.trip_type] = (acc[trip.trip_type] || 0) + 1
    return acc
  }, {}) || {}

  const tripTypeChart = Object.entries(tripTypeData).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))

  // Process night vs day
  const nightDayData = data?.nightDay.reduce((acc: any, trip) => {
    acc[trip.is_night_trip ? 'Night' : 'Day'] = (acc[trip.is_night_trip ? 'Night' : 'Day'] || 0) + 1
    return acc
  }, {}) || {}

  const nightDayChart = Object.entries(nightDayData).map(([name, value]) => ({
    name,
    value,
  }))

  // Process status breakdown
  const statusData = data?.statusBreakdown.reduce((acc: any, trip) => {
    acc[trip.status] = (acc[trip.status] || 0) + 1
    return acc
  }, {}) || {}

  const statusChart = Object.entries(statusData).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))

  // Calculate metrics
  const totalTrips = data?.trips.length || 0
  const completedTrips = data?.trips.filter(t => t.status === 'completed').length || 0
  const completionRate = totalTrips > 0 ? ((completedTrips / totalTrips) * 100).toFixed(1) : '0'
  const completedTripsWithFare = data?.trips?.filter(t => t.status === 'completed' && t.actual_fare) || []
  const avgFare = completedTripsWithFare.length > 0
    ? completedTripsWithFare.reduce((sum, t) => sum + (t.actual_fare || 0), 0) / completedTripsWithFare.length
    : 0
  const totalRevenue = data?.trips
    ?.filter(t => t.status === 'completed' && t.actual_fare)
    ?.reduce((sum, t) => sum + (t.actual_fare || 0), 0) || 0
  const completedTripsWithDistance = data?.trips?.filter(t => t.status === 'completed' && t.actual_distance_km) || []
  const avgDistance = completedTripsWithDistance.length > 0
    ? completedTripsWithDistance.reduce((sum, t) => sum + (t.actual_distance_km || 0), 0) / completedTripsWithDistance.length
    : 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Route className="h-6 w-6" />
        Trip Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Trips"
          value={totalTrips}
          icon={Route}
          color="blue"
        />
        <MetricCard
          title="Completion Rate"
          value={`${completionRate}%`}
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Average Fare"
          value={`$${avgFare.toFixed(2)}`}
          icon={DollarSign}
          color="purple"
        />
        <MetricCard
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          color="emerald"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Trip Volume Over Time"
          description="Daily trip counts by status"
          isLoading={isLoading}
          isEmpty={tripVolumeChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={tripVolumeChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#3B82F6" name="Total" />
              <Line type="monotone" dataKey="completed" stroke="#10B981" name="Completed" />
              <Line type="monotone" dataKey="cancelled" stroke="#EF4444" name="Cancelled" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Trip Type Distribution"
          description="Distribution of completed trips by type"
          isLoading={isLoading}
          isEmpty={tripTypeChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={tripTypeChart}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {tripTypeChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Night vs Day Trips"
          description="Comparison of night and day trips"
          isLoading={isLoading}
          isEmpty={nightDayChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={nightDayChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Trip Status Breakdown"
          description="Distribution of trips by status"
          isLoading={isLoading}
          isEmpty={statusChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

