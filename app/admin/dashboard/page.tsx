'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Car, Route, TrendingUp, Clock, DollarSign } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { RecentTrips } from '@/components/dashboard/recent-trips'
import { ActiveDriversMap } from '@/components/dashboard/active-drivers-map'

async function fetchDashboardMetrics() {
  const supabase = createClient()
  
  // Get real-time counts
  const [
    { count: activeDrivers },
    { count: activeRiders },
    { count: activeTrips },
    { count: pendingRequests }
  ] = await Promise.all([
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true),
    supabase
      .from('rider_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
    supabase
      .from('trips')
      .select('*', { count: 'exact', head: true })
      .in('status', ['accepted', 'picked_up']),
    supabase
      .from('trip_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'requested')
  ])

  // Get today's trips
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const { data: todayTrips } = await supabase
    .from('trips')
    .select('actual_fare')
    .gte('requested_at', today.toISOString())
    .eq('status', 'completed')

  const todayRevenue = (todayTrips as Array<{ actual_fare: number | null }> | null)?.reduce((sum, trip) => sum + (trip.actual_fare || 0), 0) || 0

  return {
    activeDrivers: activeDrivers || 0,
    activeRiders: activeRiders || 0,
    activeTrips: activeTrips || 0,
    pendingRequests: pendingRequests || 0,
    todayTripsCount: todayTrips?.length || 0,
    todayRevenue
  }
}

export default function DashboardPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of your Links transportation system
        </p>
      </div>

      {/* Real-time Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Active Drivers"
          value={metrics?.activeDrivers || 0}
          icon={Car}
          trend="+12%"
          trendUp={true}
          color="blue"
        />
        <MetricCard
          title="Active Riders"
          value={metrics?.activeRiders || 0}
          icon={Users}
          trend="+8%"
          trendUp={true}
          color="green"
        />
        <MetricCard
          title="Active Trips"
          value={metrics?.activeTrips || 0}
          icon={Route}
          color="purple"
        />
        <MetricCard
          title="Pending Requests"
          value={metrics?.pendingRequests || 0}
          icon={Clock}
          color="yellow"
        />
        <MetricCard
          title="Today's Trips"
          value={metrics?.todayTripsCount || 0}
          icon={TrendingUp}
          trend="+23%"
          trendUp={true}
          color="indigo"
        />
        <MetricCard
          title="Today's Revenue"
          value={`$${metrics?.todayRevenue?.toFixed(2) || '0.00'}`}
          icon={DollarSign}
          trend="+15%"
          trendUp={true}
          color="emerald"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Trips */}
        <RecentTrips />

        {/* Active Drivers Map */}
        <ActiveDriversMap />
      </div>
    </div>
  )
}
