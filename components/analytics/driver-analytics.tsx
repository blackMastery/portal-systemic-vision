'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { ChartWrapper } from './chart-wrapper'
import { BarChart } from './charts/bar-chart'
import { Car, CheckCircle, Star } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'
import { formatStatus } from '@/lib/format'

type DriverData = {
  verification_status: string
  is_online: boolean
  rating_average: number
}

async function fetchDriverAnalytics() {
  const supabase = createClient()

  const drivers = await fetchAllRows<DriverData>(() =>
    supabase
      .from('driver_profiles')
      .select('verification_status, is_online, rating_average')
      .order('id', { ascending: true })
  )

  return { drivers }
}

export function DriverAnalytics() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['driver-analytics'],
    queryFn: fetchDriverAnalytics,
  })

  // Verification status
  const verificationData = data?.drivers.reduce((acc: any, driver) => {
    acc[driver.verification_status] = (acc[driver.verification_status] || 0) + 1
    return acc
  }, {}) || {}

  const verificationChart = Object.entries(verificationData).map(([name, value]) => ({
    name: formatStatus(name),
    value,
  }))

  // Calculate metrics
  const totalDrivers = data?.drivers?.length || 0
  const verifiedDrivers = data?.drivers?.filter(d => d.verification_status === 'approved').length || 0
  const onlineDrivers = data?.drivers?.filter(d => d.is_online).length || 0
  const avgRating = totalDrivers > 0 && data?.drivers
    ? data.drivers.reduce((sum, d) => sum + (d.rating_average || 0), 0) / totalDrivers
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Car className="h-6 w-6" />
          Driver Analytics
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Current driver roster — not affected by the date range filter
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
        <MetricCard
          title="Total Drivers"
          value={totalDrivers}
          icon={Car}
          color="blue"
        />
        <MetricCard
          title="Verified Drivers"
          value={verifiedDrivers}
          icon={CheckCircle}
          color="green"
        />
        <MetricCard
          title="Online Now"
          value={onlineDrivers}
          icon={Car}
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
      <ChartWrapper
        title="Driver Verification Status"
        description="Distribution of drivers by verification status"
        isLoading={isLoading}
        isError={isError}
        isEmpty={verificationChart.length === 0}
      >
        <BarChart data={verificationChart.map(d => ({ label: d.name, value: Number(d.value) }))} />
      </ChartWrapper>
    </div>
  )
}
