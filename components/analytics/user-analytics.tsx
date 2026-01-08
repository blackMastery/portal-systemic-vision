'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Users, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { format } from 'date-fns'

interface UserAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6']

type UserData = {
  created_at: string
  role: string
}

type ActiveUserData = {
  rider_id: string | null
  driver_id: string | null
  requested_at: string
}

async function fetchUserAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()
  const startDate = dateRange.start.toISOString()
  const endDate = dateRange.end.toISOString()

  // User growth
  const { data: users } = await supabase
    .from('users')
    .select('created_at, role')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // Active users (users with trips in date range)
  const { data: activeUsers } = await supabase
    .from('trips')
    .select('rider_id, driver_id, requested_at')
    .gte('requested_at', startDate)
    .lte('requested_at', endDate)

  return {
    users: (users as UserData[] | null) || [],
    activeUsers: (activeUsers as ActiveUserData[] | null) || [],
  }
}

export function UserAnalytics({ dateRange }: UserAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchUserAnalytics(dateRange),
  })

  // Process user growth
  const userGrowthData = data?.users.reduce((acc: any, user) => {
    const date = format(new Date(user.created_at), 'MMM d')
    if (!acc[date]) {
      acc[date] = { date, riders: 0, drivers: 0, total: 0 }
    }
    acc[date].total++
    if (user.role === 'rider') acc[date].riders++
    if (user.role === 'driver') acc[date].drivers++
    return acc
  }, {}) || {}

  const userGrowthChart = Object.values(userGrowthData).slice(-30)

  // Process active users
  const activeUsersData = data?.activeUsers.reduce((acc: any, trip) => {
    const date = format(new Date(trip.requested_at), 'MMM d')
    if (!acc[date]) {
      acc[date] = { date, riders: new Set(), drivers: new Set() }
    }
    if (trip.rider_id) acc[date].riders.add(trip.rider_id)
    if (trip.driver_id) acc[date].drivers.add(trip.driver_id)
    return acc
  }, {}) || {}

  const activeUsersChart = Object.entries(activeUsersData).map(([date, value]: [string, any]) => ({
    date,
    riders: value.riders.size,
    drivers: value.drivers.size,
  })).slice(-30)

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="User Growth Over Time"
          description="New user registrations by role"
          isLoading={isLoading}
          isEmpty={userGrowthChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={userGrowthChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="riders" stroke="#10B981" name="Riders" />
              <Line type="monotone" dataKey="drivers" stroke="#3B82F6" name="Drivers" />
              <Line type="monotone" dataKey="total" stroke="#8B5CF6" name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Active Users Trend"
          description="Daily active users by role"
          isLoading={isLoading}
          isEmpty={activeUsersChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={activeUsersChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="riders" stackId="1" stroke="#10B981" fill="#10B981" name="Active Riders" />
              <Area type="monotone" dataKey="drivers" stackId="1" stroke="#3B82F6" fill="#3B82F6" name="Active Drivers" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="User Role Distribution"
          description="Distribution of users by role"
          isLoading={isLoading}
          isEmpty={roleChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={roleChart}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {roleChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

