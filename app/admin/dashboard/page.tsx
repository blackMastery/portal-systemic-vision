'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Car, Route, TrendingUp, Clock, DollarSign, Megaphone, CalendarCheck, CalendarClock, UserX } from 'lucide-react'
import Link from 'next/link'
import { MetricCard } from '@/components/dashboard/metric-card'
import { RecentTrips } from '@/components/dashboard/recent-trips'
import { ActiveDriversMap } from '@/components/dashboard/active-drivers-map'
import { formatCurrency } from '@/lib/format'

async function fetchDashboardMetrics() {
  const supabase = createClient()

  // Days remaining uses the same ceil convention as the payments page:
  // 1-2 days left means end_date is within the next 2 days, 3+ means beyond that
  const now = new Date()
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  // Get real-time counts
  const [
    { count: activeDrivers },
    { count: activeRiders },
    { count: activeTrips },
    { count: pendingDrivers },
    { count: approvedDrivers },
    { count: subscribedDrivers },
    { count: expiringSoonDrivers },
    { data: recentAcceptedTrips },
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
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending'),
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'approved'),
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active')
      .gt('subscription_end_date', twoDaysFromNow.toISOString()),
    supabase
      .from('driver_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active')
      .gt('subscription_end_date', now.toISOString())
      .lte('subscription_end_date', twoDaysFromNow.toISOString()),
    supabase
      .from('trips')
      .select('driver_id')
      .gte('accepted_at', twoDaysAgo.toISOString())
      .not('driver_id', 'is', null),
  ])

  // Active-subscription drivers with no accepted trip in the last 2 days
  const recentlyActiveDriverIds = [...new Set(
    ((recentAcceptedTrips ?? []) as Array<{ driver_id: string | null }>)
      .map(trip => trip.driver_id)
      .filter((id): id is string => !!id)
  )]

  let idleQuery = supabase
    .from('driver_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'active')
  if (recentlyActiveDriverIds.length > 0) {
    idleQuery = idleQuery.not('id', 'in', `(${recentlyActiveDriverIds.join(',')})`)
  }
  const { count: idleSubscribedDrivers } = await idleQuery

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
    pendingDrivers: pendingDrivers || 0,
    approvedDrivers: approvedDrivers || 0,
    subscribedDrivers: subscribedDrivers || 0,
    expiringSoonDrivers: expiringSoonDrivers || 0,
    idleSubscribedDrivers: idleSubscribedDrivers || 0,
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-strong"></div>
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
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary-soft-deep bg-primary-soft px-3 py-2 text-sm font-medium text-info-soft-foreground hover:bg-primary-soft-deep transition-colors"
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
          title="Subscribed Drivers (3+ Days Left)"
          value={metrics?.subscribedDrivers || 0}
          icon={CalendarCheck}
          color="emerald"
          href="/admin/drivers?sub=active&subexpiry=3plus"
        />
        <MetricCard
          title="Subscriptions Expiring Soon (1-2 Days)"
          value={metrics?.expiringSoonDrivers || 0}
          icon={CalendarClock}
          color="red"
          href="/admin/drivers?sub=active&subexpiry=expiring"
        />
        <MetricCard
          title="Subscribed Drivers Idle 2+ Days"
          value={metrics?.idleSubscribedDrivers || 0}
          icon={UserX}
          color="yellow"
          href="/admin/drivers?sub=active&activity=idle"
        />
        <MetricCard
          title="Today's Trips"
          value={metrics?.todayTripsCount || 0}
          icon={TrendingUp}
          color="indigo"
          href="/admin/trips"
        />
        <MetricCard
          title="Today's Revenue"
          value={formatCurrency(metrics?.todayRevenue)}
          icon={DollarSign}
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
