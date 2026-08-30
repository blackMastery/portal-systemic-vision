'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana } from '@/lib/guyana-time'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { formatCurrency } from '@/lib/format'
import { LineChart, toLineSeries } from './charts/line-chart'
import { CHART_COLORS } from './chart-theme'
import { CreditCard, TrendingUp, AlertCircle } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface SubscriptionAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type SubscriptionAnalyticsData = {
  created_at: string
  status: string
  amount: number
  end_date: string
}

async function fetchSubscriptionAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // Subscriptions
  const subscriptions = await fetchAllRows<SubscriptionAnalyticsData>(() => {
    let query = supabase
      .from('subscriptions')
      .select('created_at, status, amount, end_date')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  return { subscriptions }
}

export function SubscriptionAnalytics({ dateRange }: SubscriptionAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscription-analytics', dateRange.start?.toISOString() ?? 'all', dateRange.end.toISOString()],
    queryFn: () => fetchSubscriptionAnalytics(dateRange),
  })

  // Subscription trends (bucketed by Guyana calendar day)
  const subscriptionTrends: any = {}
  data?.subscriptions.forEach(sub => {
    const day = formatGuyana(sub.created_at, 'yyyy-MM-dd')
    if (!subscriptionTrends[day]) {
      subscriptionTrends[day] = { day, date: formatGuyana(sub.created_at, 'MMM d'), new: 0, active: 0, expired: 0 }
    }
    subscriptionTrends[day].new++
    if (sub.status === 'active') subscriptionTrends[day].active++
    if (sub.status === 'expired' || sub.status === 'cancelled') subscriptionTrends[day].expired++
  })

  const subscriptionTrendsChart = Object.values(subscriptionTrends as Record<string, { day: string }>)
    .sort((a, b) => a.day.localeCompare(b.day))

  // Calculate metrics
  const activeSubscriptions = data?.subscriptions.filter(s => s.status === 'active').length || 0
  const expiringSoon = data?.subscriptions.filter(s => {
    if (s.status !== 'active' || !s.end_date) return false
    const endDate = new Date(s.end_date)
    const now = new Date()
    const daysUntilExpiry = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0
  }).length || 0

  const totalRevenue = data?.subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + s.amount, 0) || 0

  const avgSubscriptionValue = activeSubscriptions > 0 ? totalRevenue / activeSubscriptions : 0

  const expiredCount = data?.subscriptions.filter(s => s.status === 'expired' || s.status === 'cancelled').length || 0
  const totalCount = data?.subscriptions.length || 0
  const churnRate = totalCount > 0 ? ((expiredCount / totalCount) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <CreditCard className="h-6 w-6" />
        Subscription Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Subscriptions"
          value={activeSubscriptions}
          icon={CreditCard}
          color="green"
        />
        <MetricCard
          title="Expiring Soon"
          value={expiringSoon}
          icon={AlertCircle}
          color="yellow"
        />
        <MetricCard
          title="Churn Rate"
          value={`${churnRate}%`}
          icon={TrendingUp}
          color="red"
        />
        <MetricCard
          title="Avg Subscription Value"
          value={formatCurrency(avgSubscriptionValue)}
          icon={CreditCard}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6">
        <ChartWrapper
          title="Subscription Trends"
          description="New, active, and expired subscriptions over time"
          isLoading={isLoading}
          isError={isError}
          isEmpty={subscriptionTrendsChart.length === 0}
        >
          <LineChart
            series={toLineSeries(subscriptionTrendsChart as Record<string, unknown>[], [
              { id: 'New', key: 'new', color: CHART_COLORS.info },
              { id: 'Active', key: 'active', color: CHART_COLORS.success },
              { id: 'Expired', key: 'expired', color: CHART_COLORS.danger },
            ])}
          />
        </ChartWrapper>
      </div>
    </div>
  )
}

