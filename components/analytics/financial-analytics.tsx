'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { format } from 'date-fns'

interface FinancialAnalyticsProps {
  dateRange: { start: Date; end: Date }
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
  payment_method: string
  amount: number
  created_at: string
}

async function fetchFinancialAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()
  const startDate = dateRange.start.toISOString()
  const endDate = dateRange.end.toISOString()

  // Subscription revenue
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('created_at, amount, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .eq('status', 'active')

  // Trip revenue
  const { data: trips } = await supabase
    .from('trips')
    .select('completed_at, actual_fare')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .gte('completed_at', startDate)
    .lte('completed_at', endDate)

  // Payment transactions
  const { data: transactions } = await supabase
    .from('payment_transactions')
    .select('status, payment_method, amount, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  return {
    subscriptions: (subscriptions as SubscriptionData[] | null) || [],
    trips: (trips as TripRevenueData[] | null) || [],
    transactions: (transactions as TransactionData[] | null) || [],
  }
}

export function FinancialAnalytics({ dateRange }: FinancialAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['financial-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchFinancialAnalytics(dateRange),
  })

  // Process revenue trends
  const revenueData: any = {}
  
  data?.subscriptions.forEach(sub => {
    const date = format(new Date(sub.created_at), 'MMM d')
    if (!revenueData[date]) {
      revenueData[date] = { date, subscription: 0, trip: 0, total: 0 }
    }
    revenueData[date].subscription += sub.amount
    revenueData[date].total += sub.amount
  })

  data?.trips.forEach(trip => {
    const date = format(new Date(trip.completed_at!), 'MMM d')
    if (!revenueData[date]) {
      revenueData[date] = { date, subscription: 0, trip: 0, total: 0 }
    }
    revenueData[date].trip += trip.actual_fare || 0
    revenueData[date].total += trip.actual_fare || 0
  })

  const revenueChart = Object.values(revenueData).slice(-30)

  // Revenue by source
  const subscriptionRevenue = data?.subscriptions.reduce((sum, s) => sum + s.amount, 0) || 0
  const tripRevenue = data?.trips.reduce((sum, t) => sum + (t.actual_fare || 0), 0) || 0
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

  // Payment method
  const paymentMethod = data?.transactions.reduce((acc: any, t) => {
    acc[t.payment_method] = (acc[t.payment_method] || 0) + 1
    return acc
  }, {}) || {}

  const paymentMethodChart = Object.entries(paymentMethod).map(([name, value]) => ({
    name: name.toUpperCase(),
    value,
  }))

  // Calculate metrics
  const totalRevenue = subscriptionRevenue + tripRevenue
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={DollarSign}
          color="emerald"
        />
        <MetricCard
          title="Subscription Revenue"
          value={`$${subscriptionRevenue.toFixed(2)}`}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Trip Revenue"
          value={`$${tripRevenue.toFixed(2)}`}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Revenue Trends"
          description="Daily revenue from subscriptions and trips"
          isLoading={isLoading}
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
          isEmpty={revenueBySource.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueBySource}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: $${value.toFixed(2)} (${(percent * 100).toFixed(0)}%)`}
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

        <ChartWrapper
          title="Payment Method Distribution"
          description="Transactions by payment method"
          isLoading={isLoading}
          isEmpty={paymentMethodChart.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={paymentMethodChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>
    </div>
  )
}

