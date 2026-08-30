'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { formatGuyana } from '@/lib/guyana-time'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import { ChartWrapper } from './chart-wrapper'
import { formatCurrency } from '@/lib/format'
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface FinancialAnalyticsProps {
  dateRange: AnalyticsDateRange
}

const COLORS = ['#10B981', '#3B82F6']

type SubscriptionData = {
  created_at: string
  amount: number
  status: string
}

type TripRevenueData = {
  completed_at: string
  actual_fare: number | null
}

type TransactionData = {
  status: string
  created_at: string
}

async function fetchFinancialAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  // Subscription revenue
  const subscriptions = await fetchAllRows<SubscriptionData>(() => {
    let query = supabase
      .from('subscriptions')
      .select('created_at, amount, status')
      .eq('status', 'active')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  // Trip revenue
  const trips = await fetchAllRows<TripRevenueData>(() => {
    let query = supabase
      .from('trips')
      .select('completed_at, actual_fare')
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .lte('completed_at', endDate)
      .order('completed_at', { ascending: true })
    if (startDate) query = query.gte('completed_at', startDate)
    return query
  })

  // Payment transactions
  const transactions = await fetchAllRows<TransactionData>(() => {
    let query = supabase
      .from('payment_transactions')
      .select('status, created_at')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  return { subscriptions, trips, transactions }
}

export function FinancialAnalytics({ dateRange }: FinancialAnalyticsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['financial-analytics', dateRange.start?.toISOString() ?? 'all', dateRange.end.toISOString()],
    queryFn: () => fetchFinancialAnalytics(dateRange),
  })

  // Process revenue trends (bucketed by Guyana calendar day)
  const revenueData: any = {}

  data?.subscriptions.forEach(sub => {
    const day = formatGuyana(sub.created_at, 'yyyy-MM-dd')
    if (!revenueData[day]) {
      revenueData[day] = { day, date: formatGuyana(sub.created_at, 'MMM d'), subscription: 0, trip: 0, total: 0 }
    }
    revenueData[day].subscription += sub.amount
    revenueData[day].total += sub.amount
  })

  data?.trips.forEach(trip => {
    const day = formatGuyana(trip.completed_at, 'yyyy-MM-dd')
    if (!revenueData[day]) {
      revenueData[day] = { day, date: formatGuyana(trip.completed_at, 'MMM d'), subscription: 0, trip: 0, total: 0 }
    }
    revenueData[day].trip += trip.actual_fare || 0
    revenueData[day].total += trip.actual_fare || 0
  })

  const revenueChart = Object.values(revenueData as Record<string, { day: string }>)
    .sort((a, b) => a.day.localeCompare(b.day))

  // Revenue by source
  const subscriptionRevenue = data?.subscriptions.reduce((sum, s) => sum + s.amount, 0) || 0
  const tripRevenue = data?.trips.reduce((sum, t) => sum + (t.actual_fare || 0), 0) || 0
  const totalRevenue = subscriptionRevenue + tripRevenue
  const revenueBySource = [
    { name: 'Subscriptions', value: subscriptionRevenue },
    { name: 'Trips', value: tripRevenue },
  ]

  // Payment status
  const paymentStatus = data?.transactions.reduce((acc: any, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {}) || {}

  const paymentStatusChart = Object.entries(paymentStatus).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }))

  // Calculate metrics
  const completedTransactions = data?.transactions.filter(t => t.status === 'completed').length || 0
  const totalTransactions = data?.transactions.length || 0
  const successRate = totalTransactions > 0 ? ((completedTransactions / totalTransactions) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        Financial Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          color="emerald"
        />
        <MetricCard
          title="Subscription Revenue"
          value={formatCurrency(subscriptionRevenue)}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Trip Revenue"
          value={formatCurrency(tripRevenue)}
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="Payment Success Rate"
          value={`${successRate}%`}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Revenue Trends"
          description="Daily revenue from subscriptions and trips"
          isLoading={isLoading}
          isError={isError}
          isEmpty={revenueChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="subscription" stroke="#3B82F6" name="Subscription Revenue" />
              <Line type="monotone" dataKey="trip" stroke="#10B981" name="Trip Revenue" />
              <Line type="monotone" dataKey="total" stroke="#8B5CF6" name="Total Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Revenue by Source"
          description="Revenue breakdown by source"
          isLoading={isLoading}
          isError={isError}
          isEmpty={totalRevenue === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueBySource}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${formatCurrency(value)} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {revenueBySource.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Payment Transaction Status"
          description="Distribution of payment transactions by status"
          isLoading={isLoading}
          isError={isError}
          isEmpty={paymentStatusChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={paymentStatusChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}
