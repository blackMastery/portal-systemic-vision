'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CreditCard, TrendingUp, AlertCircle } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { format } from 'date-fns'

interface SubscriptionAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

type SubscriptionAnalyticsData = {
  created_at: string
  status: string
  plan_type: string
  amount: number
  end_date: string
}

async function fetchSubscriptionAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()
  const startDate = dateRange.start.toISOString()
  const endDate = dateRange.end.toISOString()

  // Subscriptions
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('created_at, status, plan_type, amount, end_date')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  return {
    subscriptions: (subscriptions as SubscriptionAnalyticsData[] | null) || [],
  }
}

export function SubscriptionAnalytics({ dateRange }: SubscriptionAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['subscription-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchSubscriptionAnalytics(dateRange),
  })

  // Subscription trends
  const subscriptionTrends: any = {}
  data?.subscriptions.forEach(sub => {
    const date = format(new Date(sub.created_at), 'MMM d')
    if (!subscriptionTrends[date]) {
      subscriptionTrends[date] = { date, new: 0, active: 0, expired: 0 }
    }
    subscriptionTrends[date].new++
    if (sub.status === 'active') subscriptionTrends[date].active++
    if (sub.status === 'expired' || sub.status === 'cancelled') subscriptionTrends[date].expired++
  })

  const subscriptionTrendsChart = Object.values(subscriptionTrends).slice(-30)

  // Revenue by plan type
  const planRevenue = data?.subscriptions
    .filter(s => s.status === 'active')
    .reduce((acc: any, sub) => {
      acc[sub.plan_type] = (acc[sub.plan_type] || 0) + sub.amount
      return acc
    }, {}) || {}

  const planRevenueChart = Object.entries(planRevenue).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    revenue: value,
  }))

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          value={`$${avgSubscriptionValue.toFixed(2)}`}
          icon={CreditCard}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Subscription Trends"
          description="New, active, and expired subscriptions over time"
          isLoading={isLoading}
          isEmpty={subscriptionTrendsChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={subscriptionTrendsChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="new" stroke="#3B82F6" name="New" />
              <Line type="monotone" dataKey="active" stroke="#10B981" name="Active" />
              <Line type="monotone" dataKey="expired" stroke="#EF4444" name="Expired" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Revenue by Plan Type"
          description="Total revenue from each subscription plan"
          isLoading={isLoading}
          isEmpty={planRevenueChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={planRevenueChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

