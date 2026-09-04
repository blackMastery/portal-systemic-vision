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
  List,
  LayoutGrid,
  Megaphone,
  AlertTriangle,
  Star,
} from 'lucide-react'
import Link from 'next/link'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { Database, DriverWithDetails } from '@/types/database'
import { SendNotificationModal } from './send-notification-modal'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { formatStatus } from '@/lib/format'
import { formatGuyana, parseApiTimestamptz } from '@/lib/guyana-time'

const SELECT_CLASS =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Days after which a license/subscription counts as "expiring soon" rather than valid. */
const LICENSE_WARN_DAYS = 30
const REGISTRATION_WARN_DAYS = 30
const SUBSCRIPTION_WARN_DAYS = 7

type Vehicle = Database['public']['Tables']['vehicles']['Row']

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-success-soft text-success-soft-foreground',
  warn: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  muted: 'bg-muted text-secondary-foreground',
}

function Pill({
  tone,
  title,
  children,
}: {
  tone: Tone
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

/** Expiry columns are calendar dates — read them as local days, not UTC instants. */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDay(value: string | null | undefined): string | null {
  const parsed = parseDay(value)
  return parsed ? format(parsed, 'dd MMM yyyy') : null
}

/** Whole days from now until `value`; negative once it is in the past. */
function daysUntil(value: string | null | undefined): number | null {
  const parsed = parseDay(value)
  return parsed ? Math.ceil((parsed.getTime() - Date.now()) / MS_PER_DAY) : null
}

/** How urgent an expiry is, plus a long and a compact way to say it. */
function expiryMeta(value: string | null | undefined, warnWithinDays: number) {
  const days = daysUntil(value)
  const date = formatDay(value)
  if (days === null || !date) {
    return { tone: 'muted' as Tone, label: 'No expiry on file', short: 'No expiry' }
  }
  if (days < 0) return { tone: 'danger' as Tone, label: `Expired ${date}`, short: 'Expired' }
  if (days === 0) return { tone: 'danger' as Tone, label: `Expires today (${date})`, short: 'Expires today' }
  if (days <= warnWithinDays) {
    return { tone: 'warn' as Tone, label: `Expires in ${days}d (${date})`, short: `${days}d left` }
  }
  return { tone: 'ok' as Tone, label: `Valid until ${date}`, short: date }
}

function relativeTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = parseApiTimestamptz(value)
  return Number.isNaN(parsed.getTime()) ? null : `${formatDistanceToNowStrict(parsed)} ago`
}

function driverName(driver: DriverWithDetails): string {
  return driver.user?.full_name?.trim() || 'Unnamed driver'
}

/** Blank strings come back from the app as often as nulls — treat both as missing. */
function driverContacts(driver: DriverWithDetails) {
  return {
    phone: driver.user?.phone_number?.trim() || null,
    email: driver.user?.email?.trim() || null,
  }
}

function driverInitial(driver: DriverWithDetails): string {
  return driver.user?.full_name?.trim()?.charAt(0).toUpperCase() || '?'
}

/** The vehicle an admin should see first: primary, else active, else whatever exists. */
function primaryVehicle(driver: DriverWithDetails): Vehicle | null {
  const vehicles = driver.vehicles ?? []
  return vehicles.find(v => v.is_primary) ?? vehicles.find(v => v.is_active) ?? vehicles[0] ?? null
}

function vehicleTitle(vehicle: Vehicle): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'
}

function subscriptionMeta(driver: DriverWithDetails) {
  const tone: Tone =
    driver.subscription_status === 'active'
      ? 'ok'
      : driver.subscription_status === 'trial'
        ? 'info'
        : 'danger'
  const date = formatDay(driver.subscription_end_date)
  const days = daysUntil(driver.subscription_end_date)

  let detail = 'No end date'
  if (date && days !== null) {
    if (days <= 0) detail = `Ended ${date}`
    else if (days <= SUBSCRIPTION_WARN_DAYS) detail = `${days}d left · ${date}`
    else detail = `Renews ${date}`
  }

  return { tone, detail, isLapsing: days !== null && days <= SUBSCRIPTION_WARN_DAYS }
}

/** The vetting checklist: what still has to land before this driver can be approved. */
function missingForApproval(driver: DriverWithDetails): string[] {
  const missing: string[] = []
  if (!driver.user?.full_name?.trim()) missing.push('Name')
  if (!driver.user?.phone_number?.trim()) missing.push('Phone')
  if (!driver.national_id_url?.trim()) missing.push('ID photo')
  if (!driver.drivers_license_url?.trim()) missing.push('License photo')
  if (!driver.insurance_document_url?.trim()) missing.push('Insurance')
  if (!driver.drivers_license_number?.trim()) missing.push('License #')
  if (!driver.drivers_license_expiry) missing.push('License expiry')
  const vehicle = primaryVehicle(driver)
  if (!vehicle) missing.push('Vehicle')
  else {
    if (!vehicle.vehicle_photo_url?.trim()) missing.push('Vehicle photo')
    if (!vehicle.registration_url?.trim()) missing.push('Registration')
  }
  return missing
}

function OnlineDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span className={`inline-flex items-center ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
      <span
        className={`mr-1.5 h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
        aria-hidden
      />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  )
}

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
  subscriptionExpiry: string
  searchQuery: string
  onlineStatus: string
  sortBy: string
  licenseExpiry: string
  hasVehicle: string
  licenseDoc: string
  nationalIdDoc: string
  insuranceDoc: string
  tripsFilter: string
  tripActivity: string
}) {
  const supabase = createClient()
  const allRows: DriverWithDetails[] = []
  const batchSize = 1000
  let from = 0

  // Supabase/PostgREST caps response size; fetch drivers in pages.
  while (true) {
    let query = supabase
      .from('driver_profiles')
      .select(`
      *,
      user:user_id (full_name, email, phone_number),
      vehicles (id, make, model, year, color, license_plate, is_primary, is_active, vehicle_photo_url, registration_url, registration_number, registration_expiry, insurance_expiry)
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

    if (filters.sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else if (filters.sortBy === 'rating') {
      query = query.order('rating_average', { ascending: false })
    } else if (filters.sortBy === 'trips') {
      query = query.order('total_trips', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query.range(from, from + batchSize - 1)

    if (error) {
      throw error
    }

    const batch = (data ?? []) as DriverWithDetails[]
    allRows.push(...batch)

    if (batch.length < batchSize) break
    from += batchSize
  }

  // Client-side filtering
  let results = allRows

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

  if (filters.insuranceDoc !== 'all') {
    results = results.filter(driver =>
      filters.insuranceDoc === 'uploaded'
        ? !!driver.insurance_document_url
        : !driver.insurance_document_url
    )
  }

  if (filters.subscriptionExpiry !== 'all') {
    // Same ceil days-remaining convention as the payments page and dashboard
    const msPerDay = 1000 * 60 * 60 * 24
    const now = Date.now()

    results = results.filter(driver => {
      if (!driver.subscription_end_date) return filters.subscriptionExpiry === 'missing'
      const daysRemaining = Math.ceil(
        (new Date(driver.subscription_end_date).getTime() - now) / msPerDay
      )
      if (filters.subscriptionExpiry === '3plus') return daysRemaining >= 3
      if (filters.subscriptionExpiry === 'expiring') return daysRemaining >= 1 && daysRemaining <= 2
      if (filters.subscriptionExpiry === 'ended') return daysRemaining <= 0
      return true
    })
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

  if (filters.tripActivity !== 'all') {
    // Drivers who accepted a trip within the last 2 days; same window as the dashboard idle metric
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const recentlyActiveIds = new Set<string>()
    let tripFrom = 0

    while (true) {
      const { data, error } = await supabase
        .from('trips')
        .select('driver_id')
        .gte('accepted_at', twoDaysAgo.toISOString())
        .not('driver_id', 'is', null)
        .range(tripFrom, tripFrom + batchSize - 1)

      if (error) {
        throw error
      }

      const batch = (data ?? []) as Array<{ driver_id: string | null }>
      for (const trip of batch) {
        if (trip.driver_id) recentlyActiveIds.add(trip.driver_id)
      }

      if (batch.length < batchSize) break
      tripFrom += batchSize
    }

    results = results.filter(driver =>
      filters.tripActivity === 'recent'
        ? recentlyActiveIds.has(driver.id)
        : !recentlyActiveIds.has(driver.id)
    )
  }

  return results
}

const verificationBadgeColors = {
  pending: 'bg-warning-soft text-warning-soft-foreground',
  approved: 'bg-success-soft text-success-soft-foreground',
  rejected: 'bg-danger-soft text-danger-soft-foreground',
  suspended: 'bg-muted text-secondary-foreground',
}

const THUMB_SIZE = {
  sm: 'h-12 w-16',
  md: 'h-16 w-24',
} as const

/**
 * A driver document rendered as a clickable thumbnail. Images open in a lightbox so an
 * admin can read an ID without leaving the list; anything that is not an image falls back
 * to a link. Missing documents keep the same footprint so rows and cards stay aligned.
 */
function DocumentThumb({
  url,
  label,
  size = 'md',
}: {
  url: string | null | undefined
  label: string
  size?: keyof typeof THUMB_SIZE
}) {
  const [imgError, setImgError] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const box = THUMB_SIZE[size]

  useEffect(() => {
    setImgError(false)
  }, [url])

  if (!url?.trim()) {
    return (
      <div
        className={`${box} flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-[10px] font-medium uppercase tracking-wide text-gray-400`}
        title={`${label} not uploaded`}
      >
        Missing
      </div>
    )
  }

  if (imgError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${box} flex flex-col items-center justify-center gap-1 rounded-md border border-gray-200 bg-gray-50 text-[10px] font-medium text-primary-strong hover:bg-gray-100`}
        title={`Open ${label}`}
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden />
        Open
      </a>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={`${box} block overflow-hidden rounded-md border border-gray-200 bg-gray-50 hover:ring-2 hover:ring-ring hover:ring-offset-1`}
        title={`View ${label}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className={`${box} object-cover`}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </button>
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={url}
        title={label}
      />
    </>
  )
}

/**
 * Every document an admin reviews before approving, in review order. Registration lives on
 * the vehicle rather than the profile, so it only appears once a vehicle is registered.
 */
function DocumentStrip({
  driver,
  size = 'md',
}: {
  driver: DriverWithDetails
  size?: keyof typeof THUMB_SIZE
}) {
  const vehicle = primaryVehicle(driver)
  const docs = [
    { label: 'National ID', short: 'ID', url: driver.national_id_url },
    { label: 'Driver license', short: 'License', url: driver.drivers_license_url },
    { label: 'Insurance', short: 'Insurance', url: driver.insurance_document_url },
    ...(vehicle
      ? [{ label: 'Vehicle registration', short: 'Registration', url: vehicle.registration_url }]
      : []),
  ]

  return (
    <div className="flex flex-wrap items-start gap-3">
      {docs.map((doc) => (
        <div key={doc.label}>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {doc.short}
          </p>
          <DocumentThumb url={doc.url} label={doc.label} size={size} />
        </div>
      ))}
    </div>
  )
}

function DriversContent() {
  const filterIdPrefix = useId()

  const {
    verificationStatus, subscriptionStatus, subscriptionExpiry, onlineStatus, sortBy, licenseExpiry,
    hasVehicle, licenseDoc, nationalIdDoc, insuranceDoc, tripsFilter, tripActivity,
    searchInput, setSearchInput, debouncedSearch,
    page, pageSize, setPage, setPageSize, clampPage,
    setFilter, clearFilters: clearAllFilters,
    activeFilterCount, hasActiveFilters,
  } = useDriverFilters()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card')
  const [notificationModalOpen, setNotificationModalOpen] = useState(false)

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
      subscriptionExpiry,
      debouncedSearch,
      onlineStatus,
      sortBy,
      licenseExpiry,
      hasVehicle,
      licenseDoc,
      nationalIdDoc,
      insuranceDoc,
      tripsFilter,
      tripActivity,
    ],
    queryFn: () =>
      fetchDrivers({
        verificationStatus,
        subscriptionStatus,
        subscriptionExpiry,
        searchQuery: debouncedSearch,
        onlineStatus,
        sortBy,
        licenseExpiry,
        hasVehicle,
        licenseDoc,
        nationalIdDoc,
        insuranceDoc,
        tripsFilter,
        tripActivity,
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
          <FilterField id={fid('sub-expiry')} label="Subscription days left">
            <select
              id={fid('sub-expiry')}
              value={subscriptionExpiry}
              onChange={(e) => setFilter('subexpiry', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="3plus">3+ days left</option>
              <option value="expiring">Expiring soon (1–2 days)</option>
              <option value="ended">Ended</option>
              <option value="missing">No end date</option>
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
          <FilterField id={fid('insurance-doc')} label="Insurance file">
            <select
              id={fid('insurance-doc')}
              value={insuranceDoc}
              onChange={(e) => setFilter('indoc', e.target.value)}
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
          <FilterField id={fid('activity')} label="Trip activity">
            <select
              id={fid('activity')}
              value={tripActivity}
              onChange={(e) => setFilter('activity', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All</option>
              <option value="recent">Accepted a trip (last 2 days)</option>
              <option value="idle">Idle (no accepted trips in 2+ days)</option>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Drivers</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage driver applications and accounts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && (
            <Link
              href="/admin/drivers?status=pending"
              className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
            >
              <Clock className="h-5 w-5 mr-2" />
              {pendingCount} Pending Verification
            </Link>
          )}
          <button
            type="button"
            onClick={() => setNotificationModalOpen(true)}
            disabled={isLoading || totalCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title={
              totalCount === 0
                ? 'No drivers match the current filters'
                : `Send a push to the ${totalCount} filtered ${
                    totalCount === 1 ? 'driver' : 'drivers'
                  }`
            }
          >
            <Megaphone className="h-5 w-5" />
            Send notification
            {totalCount > 0 && (
              <span className="min-w-[1.5rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
                {totalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <SendNotificationModal
        open={notificationModalOpen}
        onClose={() => setNotificationModalOpen(false)}
        recipientUserIds={
          drivers
            ?.map((d) => d.user_id)
            .filter((id): id is string => typeof id === 'string') ?? []
        }
        totalDriversShown={totalCount}
      />

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
                <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="hidden md:inline text-sm font-medium text-primary-strong hover:text-primary-hover self-start sm:self-auto"
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
              <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
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
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary-hover"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{totalCount} drivers</p>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'card'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Drivers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-strong mx-auto"></div>
          </div>
        ) : drivers && drivers.length > 0 ? (
          <>
            {viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        'Driver',
                        'Verification',
                        'License',
                        'Documents',
                        'Vehicle',
                        'Subscription',
                        'Activity',
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {heading}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedDrivers.map((driver) => {
                      const { phone, email } = driverContacts(driver)
                      const vehicle = primaryVehicle(driver)
                      const extraVehicles = (driver.vehicles?.length ?? 0) - (vehicle ? 1 : 0)
                      const license = expiryMeta(driver.drivers_license_expiry, LICENSE_WARN_DAYS)
                      const registration = expiryMeta(vehicle?.registration_expiry, REGISTRATION_WARN_DAYS)
                      const subscription = subscriptionMeta(driver)
                      const missing = missingForApproval(driver)
                      const lastSeen = relativeTime(driver.location_updated_at)

                      return (
                      <tr key={driver.id} className="hover:bg-gray-50 align-top">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 shrink-0 bg-primary-soft-deep rounded-full flex items-center justify-center">
                              <span className="text-primary-strong font-medium">
                                {driverInitial(driver)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {driverName(driver)}
                              </div>
                              {phone && (
                                <div className="text-sm text-gray-500 tabular-nums">{phone}</div>
                              )}
                              {email && (
                                <div className="max-w-[16rem] truncate text-xs text-gray-500" title={email}>
                                  {email}
                                </div>
                              )}
                              <div className="mt-1 text-xs text-gray-400">
                                Joined {formatGuyana(driver.created_at, 'dd MMM yyyy')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            verificationBadgeColors[driver.verification_status]
                          }`}>
                            {formatStatus(driver.verification_status)}
                          </span>
                          {driver.verified_at ? (
                            <p className="mt-1 text-xs text-gray-500">
                              {formatGuyana(driver.verified_at, 'dd MMM yyyy')}
                            </p>
                          ) : missing.length > 0 ? (
                            <p
                              className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700"
                              title={`Missing: ${missing.join(', ')}`}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {missing.length} missing
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-gray-500">Complete</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-mono tabular-nums text-gray-900">
                            {driver.drivers_license_number?.trim() || '—'}
                          </div>
                          <div className="mt-1">
                            <Pill tone={license.tone} title={license.label}>
                              {license.short}
                            </Pill>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <DocumentStrip driver={driver} size="sm" />
                        </td>
                        <td className="px-6 py-4">
                          {vehicle ? (
                            <div className="flex items-start gap-3 text-sm">
                              <DocumentThumb
                                url={vehicle.vehicle_photo_url}
                                label={`${vehicleTitle(vehicle)} photo`}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="text-gray-900">{vehicleTitle(vehicle)}</div>
                                <div className="font-mono text-xs uppercase tracking-wide text-gray-700">
                                  {vehicle.license_plate}
                                </div>
                                {vehicle.color && (
                                  <div className="text-xs text-gray-500">{vehicle.color}</div>
                                )}
                                <div className="mt-1 text-xs text-gray-500">
                                  Reg{' '}
                                  <span className="font-mono">
                                    {vehicle.registration_number?.trim() || '—'}
                                  </span>
                                </div>
                                <div className="mt-1">
                                  <Pill
                                    tone={registration.tone}
                                    title={`Registration: ${registration.label}`}
                                  >
                                    {registration.short}
                                  </Pill>
                                </div>
                                {extraVehicles > 0 && (
                                  <div className="mt-1 text-xs text-gray-400">
                                    +{extraVehicles} more
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">No vehicle</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            TONE_CLASS[subscription.tone]
                          }`}>
                            {formatStatus(driver.subscription_status)}
                          </span>
                          <p className={`mt-1 text-xs ${
                            subscription.isLapsing ? 'text-amber-700' : 'text-gray-500'
                          }`}>
                            {subscription.detail}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <OnlineDot isOnline={driver.is_online} />
                          <div className="mt-1 text-xs text-gray-500">
                            {driver.total_trips} trips · {driver.acceptance_rate.toFixed(0)}% accepted
                          </div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
                            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                            {driver.rating_average.toFixed(1)}
                            <span className="text-gray-400">({driver.rating_count})</span>
                          </div>
                          {lastSeen && (
                            <div className="mt-0.5 text-xs text-gray-400">Seen {lastSeen}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium">
                          <Link
                            href={`/admin/drivers/${driver.id}`}
                            className="text-primary-strong hover:text-primary-hover"
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
              <div className="grid grid-cols-1 items-stretch gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {paginatedDrivers.map((driver) => {
                  const { phone, email } = driverContacts(driver)
                  const vehicle = primaryVehicle(driver)
                  const extraVehicles = (driver.vehicles?.length ?? 0) - (vehicle ? 1 : 0)
                  const license = expiryMeta(driver.drivers_license_expiry, LICENSE_WARN_DAYS)
                  const registration = expiryMeta(vehicle?.registration_expiry, REGISTRATION_WARN_DAYS)
                  const subscription = subscriptionMeta(driver)
                  const missing = missingForApproval(driver)
                  const lastSeen = relativeTime(driver.location_updated_at)

                  return (
                  <div
                    key={driver.id}
                    className="flex h-full flex-col rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-primary-soft-deep flex items-center justify-center">
                          <span className="font-medium text-primary-strong">
                            {driverInitial(driver)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {driverName(driver)}
                          </p>
                          <p className="truncate text-xs text-gray-500 tabular-nums">
                            {phone ?? email ?? 'No contact on file'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            Joined {formatGuyana(driver.created_at, 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        verificationBadgeColors[driver.verification_status]
                      }`}>
                        {formatStatus(driver.verification_status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-gray-100 py-2 text-xs text-gray-600">
                      <OnlineDot isOnline={driver.is_online} />
                      <span>{driver.total_trips} trips</span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                        {driver.rating_average.toFixed(1)}
                        <span className="text-gray-400">({driver.rating_count})</span>
                      </span>
                      <span>{driver.acceptance_rate.toFixed(0)}% accepted</span>
                      {lastSeen && <span className="text-gray-400">Seen {lastSeen}</span>}
                    </div>

                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex gap-3">
                        <dt className="w-16 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          License
                        </dt>
                        <dd className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-mono tabular-nums text-gray-900">
                            {driver.drivers_license_number?.trim() || '—'}
                          </span>
                          <Pill tone={license.tone} title={license.label}>
                            {license.short}
                          </Pill>
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="w-16 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          Vehicle
                        </dt>
                        <dd className="min-w-0 flex-1 text-gray-700">
                          {vehicle ? (
                            <div className="flex items-start gap-2">
                              <DocumentThumb
                                url={vehicle.vehicle_photo_url}
                                label={`${vehicleTitle(vehicle)} photo`}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-gray-900">{vehicleTitle(vehicle)}</p>
                                <p className="font-mono text-xs uppercase text-gray-600">
                                  {vehicle.license_plate}
                                </p>
                                {vehicle.color && (
                                  <p className="text-xs text-gray-500">{vehicle.color}</p>
                                )}
                                {extraVehicles > 0 && (
                                  <p className="text-xs text-gray-400">+{extraVehicles} more</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">No vehicle registered</span>
                          )}
                        </dd>
                      </div>
                      {vehicle && (
                        <div className="flex gap-3">
                          <dt className="w-16 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Reg
                          </dt>
                          <dd className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-mono tabular-nums text-gray-900">
                              {vehicle.registration_number?.trim() || '—'}
                            </span>
                            <Pill
                              tone={registration.tone}
                              title={`Registration: ${registration.label}`}
                            >
                              {registration.short}
                            </Pill>
                          </dd>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <dt className="w-16 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          Plan
                        </dt>
                        <dd className="flex min-w-0 flex-wrap items-center gap-2">
                          <Pill tone={subscription.tone}>
                            {formatStatus(driver.subscription_status)}
                          </Pill>
                          <span className={`text-xs ${
                            subscription.isLapsing ? 'text-amber-700' : 'text-gray-500'
                          }`}>
                            {subscription.detail}
                          </span>
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <DocumentStrip driver={driver} />
                    </div>

                    {missing.length > 0 && (
                      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning-soft-foreground">
                        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>Missing: {missing.join(', ')}</span>
                      </p>
                    )}

                    <div className="mt-auto border-t border-gray-100 pt-3">
                      <Link
                        href={`/admin/drivers/${driver.id}`}
                        className="text-sm font-medium text-primary-strong hover:text-primary-hover"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
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
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-ring focus:border-ring"
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
