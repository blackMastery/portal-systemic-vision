'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Clock, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { format } from 'date-fns'

interface OperationalAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

type TripTimingData = {
  requested_at: string
  accepted_at: string | null
  completed_at: string | null
  actual_duration_minutes: number | null
  estimated_duration_minutes: number | null
  status: string
}

type TripRequestData = {
  created_at: string
  expires_at: string | null
  status: string
}

async function fetchOperationalAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()
  const startDate = dateRange.start.toISOString()
  const endDate = dateRange.end.toISOString()

  // Trips with timing data
  const { data: trips } = await supabase
    .from('trips')
    .select('requested_at, accepted_at, completed_at, actual_duration_minutes, estimated_duration_minutes, status')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  // Trip requests (for expiration rate)
  const { data: requests } = await supabase
    .from('trip_requests')
    .select('created_at, expires_at, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  return {
    trips: (trips as TripTimingData[] | null) || [],
    requests: (requests as TripRequestData[] | null) || [],
  }
}

export function OperationalAnalytics({ dateRange }: OperationalAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['operational-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchOperationalAnalytics(dateRange),
  })

  // Peak hours
  const peakHoursData: any = {}
  data?.trips
    ?.filter(t => t.status === 'completed')
    ?.forEach(trip => {
      const hour = new Date(trip.requested_at).getHours()
      peakHoursData[hour] = (peakHoursData[hour] || 0) + 1
    })

  const peakHoursChart = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    trips: peakHoursData[i] || 0,
  }))

  // Trip duration trends
  const durationData: any = {}
  data?.trips
    ?.filter(t => t.status === 'completed' && t.completed_at)
    ?.forEach(trip => {
      const date = format(new Date(trip.completed_at!), 'MMM d')
      if (!durationData[date]) {
        durationData[date] = { date, actual: [], estimated: [] }
      }
      if (trip.actual_duration_minutes) durationData[date].actual.push(trip.actual_duration_minutes)
      if (trip.estimated_duration_minutes) durationData[date].estimated.push(trip.estimated_duration_minutes)
    })

  const durationChart = Object.entries(durationData).map(([date, value]: [string, any]) => ({
    date,
    actual: value.actual.length > 0 ? value.actual.reduce((a: number, b: number) => a + b, 0) / value.actual.length : 0,
    estimated: value.estimated.length > 0 ? value.estimated.reduce((a: number, b: number) => a + b, 0) / value.estimated.length : 0,
  })).slice(-30)

  // Response times
  const responseTimes = data?.trips
    ?.filter(t => t.accepted_at && t.requested_at)
    ?.map(trip => {
      const requested = new Date(trip.requested_at).getTime()
      const accepted = new Date(trip.accepted_at!).getTime()
      return (accepted - requested) / 1000 / 60 // minutes
    }) || []

  // Calculate metrics
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0

  const completedTripsWithDuration = data?.trips?.filter(t => t.status === 'completed' && t.actual_duration_minutes) || []
  const avgDuration = completedTripsWithDuration.length > 0
    ? completedTripsWithDuration.reduce((sum, t) => sum + (t.actual_duration_minutes || 0), 0) / completedTripsWithDuration.length
    : 0

  const expiredRequests = data?.requests.filter(r => r.status === 'requested' && r.expires_at && new Date(r.expires_at) < new Date()).length || 0
  const totalRequests = data?.requests.length || 0
  const expirationRate = totalRequests > 0 ? ((expiredRequests / totalRequests) * 100).toFixed(1) : '0'

  const peakHour = peakHoursChart.reduce((max, hour) => hour.trips > max.trips ? hour : max, peakHoursChart[0] || { hour: 'N/A', trips: 0 })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Clock className="h-6 w-6" />
        Operational Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Avg Response Time"
          value={`${avgResponseTime.toFixed(1)} min`}
          icon={Clock}
          color="blue"
        />
        <MetricCard
          title="Avg Trip Duration"
          value={`${avgDuration.toFixed(0)} min`}
          icon={Clock}
          color="green"
        />
        <MetricCard
          title="Request Expiration Rate"
          value={`${expirationRate}%`}
          icon={TrendingUp}
          color="yellow"
        />
        <MetricCard
          title="Peak Hour"
          value={peakHour.hour}
          icon={Clock}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Peak Hours Analysis"
          description="Trips by hour of day"
          isLoading={isLoading}
          isEmpty={peakHoursChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={peakHoursChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="trips" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Trip Duration Trends"
          description="Average trip duration: estimated vs actual"
          isLoading={isLoading}
          isEmpty={durationChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={durationChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="estimated" stroke="#F59E0B" name="Estimated" />
              <Line type="monotone" dataKey="actual" stroke="#10B981" name="Actual" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

