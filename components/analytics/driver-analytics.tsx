'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChartWrapper } from './chart-wrapper'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Car, CheckCircle, Star } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface DriverAnalyticsProps {
  dateRange: { start: Date; end: Date }
}

type DriverData = {
  verification_status: string
  is_online: boolean
  is_available: boolean
  rating_average: number
  total_trips: number
  acceptance_rate: number
  user: { full_name: string } | null
}

type DriverTripData = {
  driver_id: string
  actual_fare: number | null
}

async function fetchDriverAnalytics(dateRange: { start: Date; end: Date }) {
  const supabase = createClient()

  // Driver profiles
  const { data: drivers } = await supabase
    .from('driver_profiles')
    .select(`
      verification_status,
      is_online,
      is_available,
      rating_average,
      total_trips,
      acceptance_rate,
      user:users!driver_profiles_user_id_fkey(full_name)
    `)

  // Driver revenue
  const { data: trips } = await supabase
    .from('trips')
    .select('driver_id, actual_fare')
    .eq('status', 'completed')
    .not('driver_id', 'is', null)

  return {
    drivers: (drivers as DriverData[] | null) || [],
    trips: (trips as DriverTripData[] | null) || [],
  }
}

export function DriverAnalytics({ dateRange }: DriverAnalyticsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['driver-analytics', dateRange.start, dateRange.end],
    queryFn: () => fetchDriverAnalytics(dateRange),
  })

  // Verification status
  const verificationData = data?.drivers.reduce((acc: any, driver) => {
    acc[driver.verification_status] = (acc[driver.verification_status] || 0) + 1
    return acc
  }, {}) || {}

  const verificationChart = Object.entries(verificationData).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }))

  // Calculate metrics
  const totalDrivers = data?.drivers?.length || 0
  const verifiedDrivers = data?.drivers?.filter(d => d.verification_status === 'approved').length || 0
  const onlineDrivers = data?.drivers?.filter(d => d.is_online).length || 0
  const avgRating = totalDrivers > 0 && data?.drivers
    ? data.drivers.reduce((sum, d) => sum + (d.rating_average || 0), 0) / totalDrivers
    : 0
  const avgAcceptanceRate = totalDrivers > 0 && data?.drivers
    ? data.drivers.reduce((sum, d) => sum + (d.acceptance_rate || 0), 0) / totalDrivers
    : 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Car className="h-6 w-6" />
        Driver Analytics
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
        isEmpty={verificationChart.length === 0}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={verificationChart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}

