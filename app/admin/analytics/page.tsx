'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Calendar, RefreshCw } from 'lucide-react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { ChartWrapper } from '@/components/analytics/chart-wrapper'
import { TripAnalytics } from '@/components/analytics/trip-analytics'
import { UserAnalytics } from '@/components/analytics/user-analytics'
import { DriverAnalytics } from '@/components/analytics/driver-analytics'
import { RiderAnalytics } from '@/components/analytics/rider-analytics'
import { FinancialAnalytics } from '@/components/analytics/financial-analytics'
import { OperationalAnalytics } from '@/components/analytics/operational-analytics'
import { SubscriptionAnalytics } from '@/components/analytics/subscription-analytics'

type DateRange = '7d' | '30d' | '90d' | 'all' | 'custom'

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  const getDateRange = () => {
    const now = new Date()
    let startDate: Date

    switch (dateRange) {
      case '7d':
        startDate = subDays(now, 7)
        break
      case '30d':
        startDate = subDays(now, 30)
        break
      case '90d':
        startDate = subDays(now, 90)
        break
      case 'custom':
        if (customStartDate && customEndDate) {
          return {
            start: startOfDay(new Date(customStartDate)),
            end: endOfDay(new Date(customEndDate)),
          }
        }
        startDate = subDays(now, 30)
        break
      default:
        startDate = new Date(0) // All time
    }

    return {
      start: dateRange === 'all' ? new Date(0) : startOfDay(startDate),
      end: endOfDay(now),
    }
  }

  const dateRangeValue = getDateRange()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">
            Comprehensive insights into your Links transportation platform
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
              />
            </div>
          )}
        </div>
      </div>

      {/* Analytics Sections */}
      <div className="space-y-6">
        {/* Trip Analytics */}
        <TripAnalytics dateRange={dateRangeValue} />

        {/* Financial Analytics */}
        <FinancialAnalytics dateRange={dateRangeValue} />

        {/* User Analytics */}
        <UserAnalytics dateRange={dateRangeValue} />

        {/* Driver & Rider Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DriverAnalytics dateRange={dateRangeValue} />
          <RiderAnalytics dateRange={dateRangeValue} />
        </div>

        {/* Operational Analytics */}
        <OperationalAnalytics dateRange={dateRangeValue} />

        {/* Subscription Analytics */}
        <SubscriptionAnalytics dateRange={dateRangeValue} />
      </div>
    </div>
  )
}

