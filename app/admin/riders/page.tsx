'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, Clock, Users, Star, Route, List, LayoutGrid, Megaphone } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RiderWithDetails, VerificationStatus } from '@/types/database'
import { format } from 'date-fns'
import { SendNotificationModal } from './send-notification-modal'

async function fetchRiders(filters: {
  subscriptionStatus: string
  searchQuery: string
  accountStatus: string
  verificationStatus: string
  idCardStatus: string
  profilePhotoStatus: string
}) {
  const supabase = createClient()
  const allRows: RiderWithDetails[] = []
  const pageSize = 1000
  let from = 0

  // Supabase/PostgREST can cap response size; fetch riders in pages.
  while (true) {
    const { data, error } = await supabase
      .from('rider_profiles')
      .select(
        `
        *,
        user:user_id (*)
      `
      )
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error

    const batch = (data ?? []) as RiderWithDetails[]
    allRows.push(...batch)

    if (batch.length < pageSize) break
    from += pageSize
  }

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

  return results
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

const subscriptionValues = ['all', 'active', 'trial', 'expired', 'cancelled'] as const
const accountValues = ['all', 'active', 'inactive'] as const
const verificationValues = ['all', 'pending', 'approved', 'rejected', 'suspended'] as const
const idCardValues = ['all', 'has', 'missing'] as const
const photoValues = ['all', 'has', 'missing'] as const
const viewValues = ['table', 'card'] as const

function parseEnumParam<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  fallback: T[number]
): T[number] {
  if (!value) return fallback
  return allowed.includes(value as T[number]) ? (value as T[number]) : fallback
}

function parsePageParam(value: string | null): number {
  if (!value) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default function RidersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const [subscriptionStatus, setSubscriptionStatus] = useState(() =>
    parseEnumParam(searchParams.get('subscription'), subscriptionValues, 'all')
  )
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [accountStatus, setAccountStatus] = useState(() =>
    parseEnumParam(searchParams.get('account'), accountValues, 'all')
  )
  const [verificationStatus, setVerificationStatus] = useState(() =>
    parseEnumParam(searchParams.get('verification'), verificationValues, 'all')
  )
  const [idCardStatus, setIdCardStatus] = useState(() =>
    parseEnumParam(searchParams.get('idCard'), idCardValues, 'all')
  )
  const [profilePhotoStatus, setProfilePhotoStatus] = useState(() =>
    parseEnumParam(searchParams.get('photo'), photoValues, 'all')
  )
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() =>
    parseEnumParam(searchParams.get('view'), viewValues, 'table')
  )
  const [currentPage, setCurrentPage] = useState(() => parsePageParam(searchParams.get('page')))
  const [notificationModalOpen, setNotificationModalOpen] = useState(false)
  const pageSize = 25

  const { data: riders, isLoading } = useQuery({
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

  const verificationCounts: Record<string, number> = {
    total: riders?.length ?? 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
  }
  for (const rider of riders ?? []) {
    if (rider.verification_status in verificationCounts) {
      verificationCounts[rider.verification_status]++
    }
  }

  const verificationStats = [
    { key: 'total', label: 'Total', color: 'bg-yellow-50 border-yellow-200 text-yellow-800', dot: 'bg-yellow-400' },
    { key: 'approved', label: 'Approved', color: 'bg-green-50 border-green-200 text-green-800', dot: 'bg-green-400' },
    { key: 'pending', label: 'Pending', color: 'bg-blue-50 border-blue-200 text-blue-800', dot: 'bg-blue-400' },
    { key: 'rejected', label: 'Rejected', color: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-400' },
    { key: 'suspended', label: 'Suspended', color: 'bg-gray-50 border-gray-300 text-gray-800', dot: 'bg-gray-400' },
  ]

  const totalRiders = riders?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRiders / pageSize))
  const pageStart = (currentPage - 1) * pageSize
  const paginatedRiders = (riders ?? []).slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    const nextSubscription = parseEnumParam(searchParams.get('subscription'), subscriptionValues, 'all')
    const nextSearch = searchParams.get('q') ?? ''
    const nextAccount = parseEnumParam(searchParams.get('account'), accountValues, 'all')
    const nextVerification = parseEnumParam(
      searchParams.get('verification'),
      verificationValues,
      'all'
    )
    const nextIdCard = parseEnumParam(searchParams.get('idCard'), idCardValues, 'all')
    const nextPhoto = parseEnumParam(searchParams.get('photo'), photoValues, 'all')
    const nextView = parseEnumParam(searchParams.get('view'), viewValues, 'table')
    const nextPage = parsePageParam(searchParams.get('page'))

    if (subscriptionStatus !== nextSubscription) setSubscriptionStatus(nextSubscription)
    if (searchQuery !== nextSearch) setSearchQuery(nextSearch)
    if (accountStatus !== nextAccount) setAccountStatus(nextAccount)
    if (verificationStatus !== nextVerification) setVerificationStatus(nextVerification)
    if (idCardStatus !== nextIdCard) setIdCardStatus(nextIdCard)
    if (profilePhotoStatus !== nextPhoto) setProfilePhotoStatus(nextPhoto)
    if (viewMode !== nextView) setViewMode(nextView)
    if (currentPage !== nextPage) setCurrentPage(nextPage)
  }, [searchParamsString])

  useEffect(() => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (subscriptionStatus !== 'all') params.set('subscription', subscriptionStatus)
    if (accountStatus !== 'all') params.set('account', accountStatus)
    if (verificationStatus !== 'all') params.set('verification', verificationStatus)
    if (idCardStatus !== 'all') params.set('idCard', idCardStatus)
    if (profilePhotoStatus !== 'all') params.set('photo', profilePhotoStatus)
    if (viewMode !== 'table') params.set('view', viewMode)
    if (currentPage > 1) params.set('page', String(currentPage))

    const nextSearch = params.toString()
    if (nextSearch !== searchParamsString) {
      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false })
    }
  }, [
    pathname,
    router,
    searchParamsString,
    searchQuery,
    subscriptionStatus,
    accountStatus,
    verificationStatus,
    idCardStatus,
    profilePhotoStatus,
    viewMode,
    currentPage,
  ])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Riders</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage rider accounts and subscriptions
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotificationModalOpen(true)}
          disabled={isLoading || totalRiders === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title={
            totalRiders === 0
              ? 'No riders match the current filters'
              : `Send a push to the ${totalRiders} filtered ${
                  totalRiders === 1 ? 'rider' : 'riders'
                }`
          }
        >
          <Megaphone className="h-5 w-5" />
          Send notification
          {totalRiders > 0 && (
            <span className="min-w-[1.5rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
              {totalRiders}
            </span>
          )}
        </button>
      </div>

      <SendNotificationModal
        open={notificationModalOpen}
        onClose={() => setNotificationModalOpen(false)}
        recipientUserIds={
          (riders ?? [])
            .map((r) => r.user_id)
            .filter((id): id is string => typeof id === 'string')
        }
        totalRidersShown={totalRiders}
      />

      {/* Verification Status Count Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {verificationStats.map(({ key, label, color, dot }) => (
          <button
            key={key}
            onClick={() =>
              {
                const nextStatus = key === 'total' ? 'all' : verificationStatus === key ? 'all' : key
                setVerificationStatus(
                  parseEnumParam(nextStatus, verificationValues, 'all')
                )
                setCurrentPage(1)
              }
            }
            className={`border rounded-xl p-4 text-left transition-all hover:shadow-sm ${color} ${(key === 'total' ? verificationStatus === 'all' : verificationStatus === key) ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold">{verificationCounts?.[key] ?? '—'}</p>
          </button>
        ))}
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
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Subscription Status */}
          <div>
            <select
              value={subscriptionStatus}
              onChange={(e) => {
                setSubscriptionStatus(
                  parseEnumParam(e.target.value, subscriptionValues, 'all')
                )
                setCurrentPage(1)
              }}
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
              onChange={(e) => {
                setAccountStatus(parseEnumParam(e.target.value, accountValues, 'all'))
                setCurrentPage(1)
              }}
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
              onChange={(e) => {
                setVerificationStatus(
                  parseEnumParam(e.target.value, verificationValues, 'all')
                )
                setCurrentPage(1)
              }}
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
              onChange={(e) => {
                setIdCardStatus(parseEnumParam(e.target.value, idCardValues, 'all'))
                setCurrentPage(1)
              }}
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
              onChange={(e) => {
                setProfilePhotoStatus(parseEnumParam(e.target.value, photoValues, 'all'))
                setCurrentPage(1)
              }}
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
        <p className="text-sm text-gray-500">
          {totalRiders} riders {totalRiders > 0 ? `(Page ${currentPage} of ${totalPages})` : ''}
        </p>
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
              {paginatedRiders.map((rider) => {
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
                {paginatedRiders.map((rider) => {
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

      {totalRiders > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {pageStart + 1}-{Math.min(pageStart + pageSize, totalRiders)} of {totalRiders}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

