'use client'

import { useState, useEffect, useMemo, useId, Suspense, type ReactNode } from 'react'
import { useDriverFilters } from './use-driver-filters'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Search,
  Clock,
  Car,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import type { DriverWithDetails } from '@/types/database'

const SELECT_CLASS =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function FilterField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 sm:min-w-[12rem]">
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

async function fetchDrivers(filters: {
  verificationStatus: string
  subscriptionStatus: string
  searchQuery: string
  onlineStatus: string
  sortBy: string
  licenseExpiry: string
  hasVehicle: string
  licenseDoc: string
  nationalIdDoc: string
  tripsFilter: string
}) {
  const supabase = createClient()

  let query = supabase
    .from('driver_profiles')
    .select(`
      *,
      user:user_id (full_name, email, phone_number),
      vehicles (id)
    `)

  if (filters.verificationStatus !== 'all') {
    query = query.eq('verification_status', filters.verificationStatus)
  }

  if (filters.subscriptionStatus !== 'all') {
    query = query.eq('subscription_status', filters.subscriptionStatus)
  }

  if (filters.onlineStatus !== 'all') {
    query = query.eq('is_online', filters.onlineStatus === 'online')
  }

  // Server-side sort
  if (filters.sortBy === 'oldest') {
    query = query.order('created_at', { ascending: true })
  } else if (filters.sortBy === 'rating') {
    query = query.order('rating_average', { ascending: false })
  } else if (filters.sortBy === 'trips') {
    query = query.order('total_trips', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  // Client-side filtering
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

  if (filters.hasVehicle !== 'all') {
    results = results.filter(driver =>
      filters.hasVehicle === 'yes'
        ? (driver.vehicles?.length ?? 0) > 0
        : (driver.vehicles?.length ?? 0) === 0
    )
  }

  if (filters.licenseDoc !== 'all') {
    results = results.filter(driver =>
      filters.licenseDoc === 'uploaded'
        ? !!driver.drivers_license_url
        : !driver.drivers_license_url
    )
  }

  if (filters.nationalIdDoc !== 'all') {
    results = results.filter(driver =>
      filters.nationalIdDoc === 'uploaded'
        ? !!driver.national_id_url
        : !driver.national_id_url
    )
  }

  if (filters.licenseExpiry !== 'all') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30Days = new Date(today)
    in30Days.setDate(today.getDate() + 30)

    results = results.filter(driver => {
      if (!driver.drivers_license_expiry) return filters.licenseExpiry === 'missing'
      const expiry = new Date(driver.drivers_license_expiry)
      if (filters.licenseExpiry === 'expired') return expiry < today
      if (filters.licenseExpiry === 'expiring_soon') return expiry >= today && expiry <= in30Days
      if (filters.licenseExpiry === 'valid') return expiry > in30Days
      return true
    })
  }

  if (filters.tripsFilter !== 'all') {
    results = results.filter(driver => {
      const trips = driver.total_trips ?? 0
      if (filters.tripsFilter === 'none') return trips === 0
      if (filters.tripsFilter === 'new') return trips >= 1 && trips <= 10
      if (filters.tripsFilter === 'active') return trips >= 11 && trips <= 100
      if (filters.tripsFilter === 'veteran') return trips > 100
      return true
    })
  }

  return results
}

const verificationBadgeColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
}

function DocumentThumb({
  url,
  label,
}: {
  url: string | null | undefined
  label: string
}) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [url])

  if (!url?.trim()) {
    return <span className="text-xs text-gray-400">—</span>
  }

  if (imgError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-gray-100"
        title={`Open ${label}`}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
        File
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded border border-gray-200 bg-gray-50 overflow-hidden hover:ring-2 hover:ring-blue-400 hover:ring-offset-1"
      title={`Open ${label}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-14 w-[3.5rem] object-cover"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    </a>
  )
}

function DriversContent() {
  const filterIdPrefix = useId()

  const {
    verificationStatus, subscriptionStatus, onlineStatus, sortBy, licenseExpiry,
    hasVehicle, licenseDoc, nationalIdDoc, tripsFilter,
    searchInput, setSearchInput, debouncedSearch,
    page, pageSize, setPage, setPageSize, clampPage,
    setFilter, clearFilters: clearAllFilters,
    activeFilterCount, hasActiveFilters,
  } = useDriverFilters()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(true)

  useEffect(() => {
    if (!filtersOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [filtersOpen])

  const { data: drivers, isLoading } = useQuery({
    queryKey: [
      'drivers',
      verificationStatus,
      subscriptionStatus,
      debouncedSearch,
      onlineStatus,
      sortBy,
      licenseExpiry,
      hasVehicle,
      licenseDoc,
      nationalIdDoc,
      tripsFilter,
    ],
    queryFn: () =>
      fetchDrivers({
        verificationStatus,
        subscriptionStatus,
        searchQuery: debouncedSearch,
        onlineStatus,
        sortBy,
        licenseExpiry,
        hasVehicle,
        licenseDoc,
        nationalIdDoc,
        tripsFilter,
      }),
  })

  const pendingCount = drivers?.filter(d => d.verification_status === 'pending').length || 0

  const totalCount = drivers?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    clampPage(totalPages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages])

  const currentPage = Math.min(page, totalPages)
  const paginatedDrivers = useMemo(() => {
    if (!drivers?.length) return []
    return drivers.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [drivers, currentPage, pageSize])

  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalCount)

  const filterSections = (idSuffix: string) => {
    const fid = (key: string) => `${filterIdPrefix}-${key}${idSuffix}`
    return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Account &amp; presence</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FilterField id={fid('verification')} label="Verification">
            <select
              id={fid('verification')}
              value={verificationStatus}
              onChange={(e) => setFilter('status', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </FilterField>
          <FilterField id={fid('subscription')} label="Subscription">
            <select
              id={fid('subscription')}
              value={subscriptionStatus}
              onChange={(e) => setFilter('sub', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
            </select>
          </FilterField>
          <FilterField id={fid('online')} label="Online status">
            <select
              id={fid('online')}
              value={onlineStatus}
              onChange={(e) => setFilter('online', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </FilterField>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">License &amp; documents</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <FilterField id={fid('license-expiry')} label="License expiry">
            <select
              id={fid('license-expiry')}
              value={licenseExpiry}
              onChange={(e) => setFilter('expiry', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="expired">Expired</option>
              <option value="expiring_soon">Expiring soon (30 days)</option>
              <option value="valid">Valid</option>
              <option value="missing">No expiry date</option>
            </select>
          </FilterField>
          <FilterField id={fid('vehicle')} label="Vehicle">
            <select
              id={fid('vehicle')}
              value={hasVehicle}
              onChange={(e) => setFilter('vehicle', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="yes">Has vehicle</option>
              <option value="no">No vehicle</option>
            </select>
          </FilterField>
          <FilterField id={fid('license-doc')} label="Driver license file">
            <select
              id={fid('license-doc')}
              value={licenseDoc}
              onChange={(e) => setFilter('ldoc', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="uploaded">Uploaded</option>
              <option value="missing">Missing</option>
            </select>
          </FilterField>
          <FilterField id={fid('national-id')} label="National ID file">
            <select
              id={fid('national-id')}
              value={nationalIdDoc}
              onChange={(e) => setFilter('nid', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="uploaded">Uploaded</option>
              <option value="missing">Missing</option>
            </select>
          </FilterField>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Trips &amp; sort</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FilterField id={fid('trips')} label="Trip count">
            <select
              id={fid('trips')}
              value={tripsFilter}
              onChange={(e) => setFilter('trips', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="none">None (0)</option>
              <option value="new">New (1–10)</option>
              <option value="active">Active (11–100)</option>
              <option value="veteran">Veteran (100+)</option>
            </select>
          </FilterField>
          <FilterField id={fid('sort')} label="Sort by">
            <select
              id={fid('sort')}
              value={sortBy}
              onChange={(e) => setFilter('sort', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="rating">Highest rating</option>
              <option value="trips">Most trips</option>
            </select>
          </FilterField>
        </div>
      </div>
    </div>
    )
  }

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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <button
              type="button"
              onClick={() => setAdvancedFiltersExpanded((v) => !v)}
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              aria-expanded={advancedFiltersExpanded}
              aria-controls={`${filterIdPrefix}-advanced-filters`}
              id={`${filterIdPrefix}-advanced-filters-toggle`}
            >
              {advancedFiltersExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-500" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden />
              )}
              {advancedFiltersExpanded ? 'Hide options' : 'Show options'}
              {!advancedFiltersExpanded && activeFilterCount > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="hidden md:inline text-sm font-medium text-blue-600 hover:text-blue-800 self-start sm:self-auto"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor={`${filterIdPrefix}-search`} className="block text-xs font-medium text-gray-600 mb-1">
              Search
            </label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none"
                aria-hidden
              />
              <input
                id={`${filterIdPrefix}-search`}
                type="search"
                placeholder="Name, email, phone, or license…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                autoComplete="off"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="md:hidden inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 shrink-0"
          >
            <SlidersHorizontal className="h-5 w-5 text-gray-600" aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {advancedFiltersExpanded && (
          <div
            id={`${filterIdPrefix}-advanced-filters`}
            className="hidden md:block pt-2 border-t border-gray-100"
            role="region"
            aria-labelledby={`${filterIdPrefix}-advanced-filters-toggle`}
          >
            {filterSections('')}
          </div>
        )}
      </div>

      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${filterIdPrefix}-drawer-title`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
            <h2 id={`${filterIdPrefix}-drawer-title`} className="text-lg font-semibold text-gray-900">
              Filters
            </h2>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Close filters"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {filterSections('-drawer')}
          </div>
          <div className="shrink-0 border-t border-gray-200 p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between bg-gray-50">
            <button
              type="button"
              onClick={() => {
                clearAllFilters()
              }}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Drivers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : drivers && drivers.length > 0 ? (
          <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    License #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    National ID / License
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
                {paginatedDrivers.map((driver) => (
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
                      <span className="text-sm text-gray-900 font-mono tabular-nums">
                        {driver.drivers_license_number?.trim()
                          ? driver.drivers_license_number
                          : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1">
                            National ID
                          </p>
                          <DocumentThumb url={driver.national_id_url} label="National ID" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1">
                            License
                          </p>
                          <DocumentThumb
                            url={driver.drivers_license_url}
                            label="Driver license"
                          />
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
                      <div className="space-y-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          driver.subscription_status === 'active' 
                            ? 'bg-green-100 text-green-800'
                            : driver.subscription_status === 'trial'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {driver.subscription_status}
                        </span>
                        <p className="text-xs text-gray-500">
                          Ends:{' '}
                          {driver.subscription_end_date
                            ? new Date(driver.subscription_end_date).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
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
            <div className="border-t border-gray-200 px-4 py-3 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-gray-50/80">
              <p className="text-sm text-gray-600">
                Showing{' '}
                <span className="font-medium text-gray-900">{rangeStart}</span>
                {'–'}
                <span className="font-medium text-gray-900">{rangeEnd}</span>
                {' of '}
                <span className="font-medium text-gray-900">{totalCount}</span>
                {' drivers'}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="whitespace-nowrap">Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </>
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

export default function DriversPage() {
  return (
    <Suspense>
      <DriversContent />
    </Suspense>
  )
}
