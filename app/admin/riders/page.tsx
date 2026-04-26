'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Clock, Users, Star, Route, List, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import type { RiderWithDetails, VerificationStatus } from '@/types/database'
import { format } from 'date-fns'

async function fetchRiders(filters: {
  subscriptionStatus: string
  searchQuery: string
  accountStatus: string
  verificationStatus: string
  idCardStatus: string
  profilePhotoStatus: string
}) {
  const supabase = createClient()

  const query = supabase
    .from('rider_profiles')
    .select(
      `
      *,
      user:user_id (*)
    `
    )
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) throw error

  const allRows = data as RiderWithDetails[]
  const pendingVerificationTotal = allRows.filter(
    (r) => r.verification_status === 'pending'
  ).length

  let results = allRows
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(
      (rider) =>
        rider.user?.full_name?.toLowerCase().includes(searchLower) ||
        rider.user?.phone_number?.includes(searchLower) ||
        rider.user?.email?.toLowerCase().includes(searchLower)
    )
  }
  if (filters.accountStatus === 'active') {
    results = results.filter((rider) => rider.user?.is_active === true)
  } else if (filters.accountStatus === 'inactive') {
    results = results.filter((rider) => rider.user?.is_active === false)
  }
  if (filters.subscriptionStatus !== 'all') {
    results = results.filter((rider) => rider.subscription_status === filters.subscriptionStatus)
  }
  if (filters.verificationStatus !== 'all') {
    results = results.filter(
      (rider) => rider.verification_status === (filters.verificationStatus as VerificationStatus)
    )
  }
  if (filters.idCardStatus === 'has') {
    results = results.filter((rider) => !!rider.id_card_storage_path?.trim())
  } else if (filters.idCardStatus === 'missing') {
    results = results.filter((rider) => !rider.id_card_storage_path?.trim())
  }
  if (filters.profilePhotoStatus === 'has') {
    results = results.filter((rider) => !!rider.user?.profile_photo_url?.trim())
  } else if (filters.profilePhotoStatus === 'missing') {
    results = results.filter((rider) => !rider.user?.profile_photo_url?.trim())
  }

  return { riders: results, pendingVerificationTotal }
}

const subscriptionBadgeColors = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const verificationBadgeColors: Record<VerificationStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
}

export default function RidersPage() {
  const [subscriptionStatus, setSubscriptionStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [accountStatus, setAccountStatus] = useState('all')
  const [verificationStatus, setVerificationStatus] = useState('all')
  const [idCardStatus, setIdCardStatus] = useState('all')
  const [profilePhotoStatus, setProfilePhotoStatus] = useState('all')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

  const { data: ridersData, isLoading } = useQuery({
    queryKey: [
      'riders',
      subscriptionStatus,
      searchQuery,
      accountStatus,
      verificationStatus,
      idCardStatus,
      profilePhotoStatus,
    ],
    queryFn: () =>
      fetchRiders({
        subscriptionStatus,
        searchQuery,
        accountStatus,
        verificationStatus,
        idCardStatus,
        profilePhotoStatus,
      }),
  })

  const riders = ridersData?.riders
  const pendingVerificationCount = ridersData?.pendingVerificationTotal ?? 0

  const expiredCount = riders?.filter((r) => r.subscription_status === 'expired').length || 0
  const trialExpiringSoon = riders?.filter((r) => {
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
        {(expiredCount > 0 || trialExpiringSoon > 0 || pendingVerificationCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {pendingVerificationCount > 0 && (
              <span className="inline-flex items-center px-4 py-2 bg-amber-100 text-amber-900 rounded-lg">
                {pendingVerificationCount} verification pending
              </span>
            )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
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

          {/* Account Status */}
          <div>
            <select
              value={accountStatus}
              onChange={(e) => setAccountStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Account Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Verification */}
          <div>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Verification</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* ID Card Status */}
          <div>
            <select
              value={idCardStatus}
              onChange={(e) => setIdCardStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All ID Card Status</option>
              <option value="has">Has ID Card</option>
              <option value="missing">Missing ID Card</option>
            </select>
          </div>

          {/* Profile Photo Status */}
          <div>
            <select
              value={profilePhotoStatus}
              onChange={(e) => setProfilePhotoStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Profile Photo Status</option>
              <option value="has">Has Profile Photo</option>
              <option value="missing">Missing Profile Photo</option>
            </select>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{riders?.length ?? 0} riders</p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : riders && riders.length > 0 ? (
          viewMode === 'card' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {riders.map((rider) => {
                const isTrialExpiringSoon = rider.subscription_status === 'trial' &&
                  rider.trial_end_date &&
                  new Date(rider.trial_end_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
                  new Date(rider.trial_end_date) > new Date()

                return (
                  <div key={rider.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-green-600 font-medium">
                          {rider.user?.full_name?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{rider.user?.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{rider.user?.phone_number}</p>
                        {rider.user?.email && <p className="text-xs text-gray-400 truncate">{rider.user.email}</p>}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${rider.user?.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {rider.user?.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${verificationBadgeColors[rider.verification_status]}`}
                      >
                        {rider.verification_status}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${subscriptionBadgeColors[rider.subscription_status]}`}>
                        {rider.subscription_status}
                      </span>
                      {isTrialExpiringSoon && rider.trial_end_date && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Clock className="h-3 w-3 mr-1" />
                          Expires {format(new Date(rider.trial_end_date), 'MMM d')}
                        </span>
                      )}
                    </div>

                    {/* Stats + action */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Route className="h-3.5 w-3.5" />
                          {rider.total_trips} trips
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          {rider.rating_average.toFixed(1)}
                        </span>
                      </div>
                      <Link href={`/admin/riders/${rider.id}`} className="text-xs text-blue-600 hover:text-blue-900 font-medium">
                        View →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Verification
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
                          rider.user?.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {rider.user?.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            verificationBadgeColors[rider.verification_status]
                          }`}
                        >
                          {rider.verification_status}
                        </span>
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
          )
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

