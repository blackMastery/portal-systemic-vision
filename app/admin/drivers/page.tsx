'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Filter, UserCheck, UserX, Clock, Car } from 'lucide-react'
import Link from 'next/link'
import type { DriverWithDetails } from '@/types/database'

async function fetchDrivers(filters: {
  verificationStatus: string
  subscriptionStatus: string
  searchQuery: string
}) {
  const supabase = createClient()
  
  let query = supabase
    .from('driver_profiles')
    .select(`
      *,
      user:user_id (full_name, email, phone_number)
    `)
    .order('created_at', { ascending: false })

  if (filters.verificationStatus !== 'all') {
    query = query.eq('verification_status', filters.verificationStatus)
  }

  if (filters.subscriptionStatus !== 'all') {
    query = query.eq('subscription_status', filters.subscriptionStatus)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  // Client-side search filtering
  let results = data as DriverWithDetails[]
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(driver => 
      driver.user?.full_name?.toLowerCase().includes(searchLower) ||
      driver.user?.email?.toLowerCase().includes(searchLower) ||
      driver.user?.phone_number?.includes(searchLower) ||
      driver.drivers_license_number?.toLowerCase().includes(searchLower)
    )
  }

  return results
}

const verificationBadgeColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
}

export default function DriversPage() {
  const [verificationStatus, setVerificationStatus] = useState('all')
  const [subscriptionStatus, setSubscriptionStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers', verificationStatus, subscriptionStatus, searchQuery],
    queryFn: () => fetchDrivers({ verificationStatus, subscriptionStatus, searchQuery }),
  })

  const pendingCount = drivers?.filter(d => d.verification_status === 'pending').length || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Drivers</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage driver applications and accounts
          </p>
        </div>
        {pendingCount > 0 && (
          <Link
            href="/admin/drivers?status=pending"
            className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
          >
            <Clock className="h-5 w-5 mr-2" />
            {pendingCount} Pending Verification
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or license..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Verification Status */}
          <div>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Verification Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Subscription Status */}
          <div>
            <select
              value={subscriptionStatus}
              onChange={(e) => setSubscriptionStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Subscription Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Drivers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : drivers && drivers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Verification
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-medium">
                              {driver.user?.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {driver.user?.full_name ?? '—'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {driver.user?.email ?? driver.user?.phone_number ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {driver.vehicles && driver.vehicles[0] ? (
                        <div className="text-sm">
                          <div className="text-gray-900">
                            {driver.vehicles[0].make} {driver.vehicles[0].model}
                          </div>
                          <div className="text-gray-500">
                            {driver.vehicles[0].license_plate}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No vehicle</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        verificationBadgeColors[driver.verification_status]
                      }`}>
                        {driver.verification_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        driver.subscription_status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : driver.subscription_status === 'trial'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {driver.subscription_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{driver.total_trips} trips</div>
                      <div>⭐ {driver.rating_average.toFixed(1)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center ${
                        driver.is_online ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        <span className={`h-2 w-2 rounded-full mr-2 ${
                          driver.is_online ? 'bg-green-500' : 'bg-gray-400'
                        }`}></span>
                        {driver.is_online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/admin/drivers/${driver.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Car className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No drivers found</p>
          </div>
        )}
      </div>
    </div>
  )
}
