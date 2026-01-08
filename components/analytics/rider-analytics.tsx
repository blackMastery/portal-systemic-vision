'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Star } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface RiderAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

const COLORS = ['#10B981', '#3B82F6', '#EF4444', '#6B7280']

type RiderData = {
  subscription_status: string
  rating_average: number
}

type SubscriptionData = {
  plan_type: string
  amount: number
  status: string
}

async function fetchRiderAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()

  // Rider profiles
  const { data: riders } = await supabase
    .from('rider_profiles')
    .select('subscription_status, rating_average')

  // Subscriptions
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('plan_type, amount, status')
    .eq('user_role', 'rider')
    .eq('status', 'active')

  return {
    riders: (riders as RiderData[] | null) || [],
    subscriptions: (subscriptions as SubscriptionData[] | null) || [],
  }
}

export function RiderAnalytics({ dateRange }: RiderAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['rider-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchRiderAnalytics(dateRange),
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
  const conversionRate = trialRiders > 0 ? ((activeSubscribers / (trialRiders + activeSubscribers)) * 100).toFixed(1) : '0'
  const avgRating = totalRiders > 0 && data?.riders
    ? data.riders.reduce((sum, r) => sum + (r.rating_average || 0), 0) / totalRiders
    : 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Users className="h-6 w-6" />
        Rider Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Subscription Status Distribution"
          description="Distribution of riders by subscription status"
          isLoading={isLoading}
          isEmpty={subscriptionStatusChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={subscriptionStatusChart}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {subscriptionStatusChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Subscription Plan Types"
          description="Active subscriptions by plan type"
          isLoading={isLoading}
          isEmpty={planTypesChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={planTypesChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

