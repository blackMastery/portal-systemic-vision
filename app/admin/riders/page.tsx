'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Clock, Users, Star, Route } from 'lucide-react'
import Link from 'next/link'
import type { RiderWithDetails } from '@/types/database'
import { format } from 'date-fns'

async function fetchRiders(filters: {
  subscriptionStatus: string
  searchQuery: string
}) {
  const supabase = createClient()
  
  let query = supabase
    .from('rider_profiles')
    .select(`
      *,
      user:user_id (*)
    `)
    .order('created_at', { ascending: false })

  if (filters.subscriptionStatus !== 'all') {
    query = query.eq('subscription_status', filters.subscriptionStatus)
  }

  const { data, error } = await query

  if (error) throw error

  // Client-side search filtering
  let results = data as RiderWithDetails[]
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(rider => 
      rider.user?.full_name?.toLowerCase().includes(searchLower) ||
      rider.user?.phone_number?.includes(searchLower) ||
      rider.user?.email?.toLowerCase().includes(searchLower)
    )
  }

  return results
}

const subscriptionBadgeColors = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

export default function RidersPage() {
  const [subscriptionStatus, setSubscriptionStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: riders, isLoading } = useQuery({
    queryKey: ['riders', subscriptionStatus, searchQuery],
    queryFn: () => fetchRiders({ subscriptionStatus, searchQuery }),
  })

  const expiredCount = riders?.filter(r => r.subscription_status === 'expired').length || 0
  const trialExpiringSoon = riders?.filter(r => {
    if (r.subscription_status !== 'trial' || !r.trial_end_date) return false
    const trialEnd = new Date(r.trial_end_date)
    const now = new Date()
    const daysUntilExpiry = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry <= 3 && daysUntilExpiry > 0
  }).length || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Riders</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage rider accounts and subscriptions
          </p>
        </div>
        {(expiredCount > 0 || trialExpiringSoon > 0) && (
          <div className="flex gap-2">
            {expiredCount > 0 && (
              <Link
                href="/admin/riders?status=expired"
                className="inline-flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors"
              >
                <Clock className="h-5 w-5 mr-2" />
                {expiredCount} Expired
              </Link>
            )}
            {trialExpiringSoon > 0 && (
              <Link
                href="/admin/riders?status=trial"
                className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
              >
                <Clock className="h-5 w-5 mr-2" />
                {trialExpiringSoon} Trials Expiring Soon
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
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
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Riders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : riders && riders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscription Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trial Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {riders.map((rider) => {
                  const isTrialExpiringSoon = rider.subscription_status === 'trial' && 
                    rider.trial_end_date && 
                    new Date(rider.trial_end_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
                    new Date(rider.trial_end_date) > new Date()

                  return (
                    <tr key={rider.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-green-600 font-medium">
                                {rider.user?.full_name?.charAt(0) || '?'}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {rider.user?.full_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {rider.user?.phone_number}
                            </div>
                            {rider.user?.email && (
                              <div className="text-xs text-gray-400">
                                {rider.user.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          subscriptionBadgeColors[rider.subscription_status]
                        }`}>
                          {rider.subscription_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rider.subscription_start_date && rider.subscription_end_date ? (
                          <div>
                            <div>Start: {format(new Date(rider.subscription_start_date), 'MMM d, yyyy')}</div>
                            <div>End: {format(new Date(rider.subscription_end_date), 'MMM d, yyyy')}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">No dates</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Route className="h-4 w-4 mr-1" />
                          {rider.total_trips} trips
                        </div>
                        <div className="flex items-center mt-1">
                          <Star className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" />
                          {rider.rating_average.toFixed(1)} ({rider.rating_count})
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {rider.subscription_status === 'trial' && rider.trial_end_date ? (
                          <div className="text-sm">
                            {isTrialExpiringSoon ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <Clock className="h-3 w-3 mr-1" />
                                Expires {format(new Date(rider.trial_end_date), 'MMM d')}
                              </span>
                            ) : (
                              <span className="text-gray-500">
                                Expires {format(new Date(rider.trial_end_date), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/riders/${rider.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No riders found</p>
          </div>
        )}
      </div>
    </div>
  )
}

