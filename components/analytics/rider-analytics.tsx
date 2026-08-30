'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { ChartWrapper } from './chart-wrapper'
import { BarChart } from './charts/bar-chart'
import { PieChart } from './charts/pie-chart'
import { CHART_COLORS } from './chart-theme'
import { Users, Star } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

type RiderData = {
  subscription_status: string
  rating_average: number
}

type SubscriptionData = {
  plan_type: string
}

async function fetchRiderAnalytics() {
  const supabase = createClient()

  const riders = await fetchAllRows<RiderData>(() =>
    supabase
      .from('rider_profiles')
      .select('subscription_status, rating_average')
      .order('id', { ascending: true })
  )

  const subscriptions = await fetchAllRows<SubscriptionData>(() =>
    supabase
      .from('subscriptions')
      .select('plan_type')
      .eq('user_role', 'rider')
      .eq('status', 'active')
      .order('id', { ascending: true })
  )

  return { riders, subscriptions }
}

export function RiderAnalytics() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rider-analytics'],
    queryFn: fetchRiderAnalytics,
  })

  // Subscription status
  const subscriptionStatus = data?.riders.reduce((acc: any, rider) => {
    acc[rider.subscription_status] = (acc[rider.subscription_status] || 0) + 1
    return acc
  }, {}) || {}

  const subscriptionStatusChart = Object.entries(subscriptionStatus).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }))

  // Plan types
  const planTypes = data?.subscriptions.reduce((acc: any, sub) => {
    acc[sub.plan_type] = (acc[sub.plan_type] || 0) + 1
    return acc
  }, {}) || {}

  const planTypesChart = Object.entries(planTypes).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }))

  // Calculate metrics
  const totalRiders = data?.riders.length || 0
  const activeSubscribers = data?.riders.filter(r => r.subscription_status === 'active').length || 0
  const trialRiders = data?.riders.filter(r => r.subscription_status === 'trial').length || 0
  const conversionRate = (trialRiders + activeSubscribers) > 0
    ? ((activeSubscribers / (trialRiders + activeSubscribers)) * 100).toFixed(1)
    : '0'
  const avgRating = totalRiders > 0 && data?.riders
    ? data.riders.reduce((sum, r) => sum + (r.rating_average || 0), 0) / totalRiders
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6" />
          Rider Analytics
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Current rider base — not affected by the date range filter
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
        <MetricCard
          title="Total Riders"
          value={totalRiders}
          icon={Users}
          color="green"
        />
        <MetricCard
          title="Active Subscribers"
          value={activeSubscribers}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Trial Conversion"
          value={`${conversionRate}%`}
          icon={Users}
          color="purple"
        />
        <MetricCard
          title="Avg Rating"
          value={avgRating.toFixed(1)}
          icon={Star}
          color="yellow"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2 xl:grid-cols-1">
        <ChartWrapper
          title="Subscription Status Distribution"
          description="Distribution of riders by subscription status"
          isLoading={isLoading}
          isError={isError}
          isEmpty={subscriptionStatusChart.length === 0}
        >
          <PieChart
            data={subscriptionStatusChart.map(d => ({ id: d.name, value: Number(d.value) }))}
            colors={[CHART_COLORS.success, CHART_COLORS.info, CHART_COLORS.danger, CHART_COLORS.gray]}
            centerLabel={String(totalRiders)}
            centerCaption="riders"
          />
        </ChartWrapper>

        <ChartWrapper
          title="Subscription Plan Types"
          description="Active subscriptions by plan type"
          isLoading={isLoading}
          isError={isError}
          isEmpty={planTypesChart.length === 0}
        >
          <BarChart
            data={planTypesChart.map(d => ({ label: d.name, value: Number(d.value) }))}
            color={CHART_COLORS.success}
          />
        </ChartWrapper>
      </div>
    </div>
  )
}
