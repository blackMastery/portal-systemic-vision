'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana } from '@/lib/guyana-time'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, toLineSeries } from './charts/line-chart'
import { PieChart } from './charts/pie-chart'
import { CHART_COLORS } from './chart-theme'
import { Users, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface UserAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type UserData = {
  created_at: string
  role: string
}

type ActiveUserData = {
  rider_id: string | null
  driver_id: string | null
  requested_at: string
}

async function fetchUserAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // User growth
  const users = await fetchAllRows<UserData>(() => {
    let query = supabase
      .from('users')
      .select('created_at, role')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  // Active users (users with trips in date range)
  const activeUsers = await fetchAllRows<ActiveUserData>(() => {
    let query = supabase
      .from('trips')
      .select('rider_id, driver_id, requested_at')
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: true })
    if (startDate) query = query.gte('requested_at', startDate)
    return query
  })

  return { users, activeUsers }
}

export function UserAnalytics({ dateRange }: UserAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['user-analytics', dateRange.start?.toISOString() ?? 'all', dateRange.end.toISOString()],
    queryFn: () => fetchUserAnalytics(dateRange),
  })

  // Process user growth (bucketed by Guyana calendar day)
  const userGrowthData = data?.users.reduce((acc: any, user) => {
    const day = formatGuyana(user.created_at, 'yyyy-MM-dd')
    if (!acc[day]) {
      acc[day] = { day, date: formatGuyana(user.created_at, 'MMM d'), riders: 0, drivers: 0, total: 0 }
    }
    acc[day].total++
    if (user.role === 'rider') acc[day].riders++
    if (user.role === 'driver') acc[day].drivers++
    return acc
  }, {}) || {}

  const userGrowthChart = Object.values(userGrowthData as Record<string, { day: string }>)
    .sort((a, b) => a.day.localeCompare(b.day))

  // Process active users
  const activeUsersData = data?.activeUsers.reduce((acc: any, trip) => {
    const day = formatGuyana(trip.requested_at, 'yyyy-MM-dd')
    if (!acc[day]) {
      acc[day] = { day, date: formatGuyana(trip.requested_at, 'MMM d'), riders: new Set(), drivers: new Set() }
    }
    if (trip.rider_id) acc[day].riders.add(trip.rider_id)
    if (trip.driver_id) acc[day].drivers.add(trip.driver_id)
    return acc
  }, {}) || {}

  const activeUsersChart = Object.values(activeUsersData as Record<string, any>)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(value => ({
      date: value.date,
      riders: value.riders.size,
      drivers: value.drivers.size,
    }))

  // Role distribution
  const roleData = data?.users.reduce((acc: any, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1
    return acc
  }, {}) || {}

  const roleChart = Object.entries(roleData).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }))

  // Calculate metrics
  const totalUsers = data?.users.length || 0
  const totalRiders = data?.users.filter(u => u.role === 'rider').length || 0
  const totalDrivers = data?.users.filter(u => u.role === 'driver').length || 0
  const activeRiders = new Set(data?.activeUsers.map(t => t.rider_id).filter(Boolean)).size
  const activeDrivers = new Set(data?.activeUsers.map(t => t.driver_id).filter(Boolean)).size

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Users className="h-6 w-6" />
        User Growth & Engagement
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Users"
          value={totalUsers}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="New Riders"
          value={totalRiders}
          icon={Users}
          color="green"
        />
        <MetricCard
          title="New Drivers"
          value={totalDrivers}
          icon={Users}
          color="purple"
        />
        <MetricCard
          title="Active Users"
          value={activeRiders + activeDrivers}
          icon={TrendingUp}
          color="indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="User Growth Over Time"
          description="New user registrations by role"
          isLoading={isLoading}
          isError={isError}
          isEmpty={userGrowthChart.length === 0}
        >
          <LineChart
            series={toLineSeries(userGrowthChart as Record<string, unknown>[], [
              { id: 'Riders', key: 'riders', color: CHART_COLORS.success },
              { id: 'Drivers', key: 'drivers', color: CHART_COLORS.info },
              { id: 'Total', key: 'total', color: CHART_COLORS.violet },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="Active Users Trend"
          description="Daily active users by role"
          isLoading={isLoading}
          isError={isError}
          isEmpty={activeUsersChart.length === 0}
        >
          <LineChart
            stacked
            series={toLineSeries(activeUsersChart as Record<string, unknown>[], [
              { id: 'Active Riders', key: 'riders', color: CHART_COLORS.success },
              { id: 'Active Drivers', key: 'drivers', color: CHART_COLORS.info },
            ])}
          />
        </ChartWrapper>

        <ChartWrapper
          title="User Role Distribution"
          description="Distribution of users by role"
          isLoading={isLoading}
          isError={isError}
          isEmpty={roleChart.length === 0}
        >
          <PieChart
            data={roleChart.map(d => ({ id: d.name, value: Number(d.value) }))}
            centerLabel={String(totalUsers)}
            centerCaption="users"
          />
        </ChartWrapper>
      </div>
    </div>
  )
}
