'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Car, Route, TrendingUp, Clock, DollarSign, Megaphone } from 'lucide-react'
import Link from 'next/link'
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
    { count: pendingRequests },
    { count: pendingDrivers },
    { count: approvedDrivers },
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
      .eq('status', 'requested'),
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending'),
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'approved'),
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
    pendingDrivers: pendingDrivers || 0,
    approvedDrivers: approvedDrivers || 0,
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
        <Link
          href="/admin/notifications"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
        >
          <Megaphone className="h-4 w-4" />
          Broadcast push to all drivers or riders
        </Link>
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
          href="/admin/drivers"
        />
        <MetricCard
          title="Pending Drivers"
          value={metrics?.pendingDrivers || 0}
          icon={Clock}
          color="yellow"
          href="/admin/drivers?status=pending"
        />
        <MetricCard
          title="Approved Drivers"
          value={metrics?.approvedDrivers || 0}
          icon={Car}
          color="green"
          href="/admin/drivers?status=approved"
        />
        <MetricCard
          title="Active Riders"
          value={metrics?.activeRiders || 0}
          icon={Users}
          trend="+8%"
          trendUp={true}
          color="green"
          href="/admin/riders"
        />
        <MetricCard
          title="Active Trips"
          value={metrics?.activeTrips || 0}
          icon={Route}
          color="purple"
          href="/admin/trips"
        />
        <MetricCard
          title="Pending Requests"
          value={metrics?.pendingRequests || 0}
          icon={Clock}
          color="yellow"
          href="/admin/trips"
        />
        <MetricCard
          title="Today's Trips"
          value={metrics?.todayTripsCount || 0}
          icon={TrendingUp}
          trend="+23%"
          trendUp={true}
          color="indigo"
          href="/admin/trips"
        />
        <MetricCard
          title="Today's Revenue"
          value={`$${metrics?.todayRevenue?.toFixed(2) || '0.00'}`}
          icon={DollarSign}
          trend="+15%"
          trendUp={true}
          color="emerald"
          href="/admin/payments"
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
