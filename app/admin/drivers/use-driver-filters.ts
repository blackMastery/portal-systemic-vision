'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 280

const DEFAULTS = {
  status:  'all',
  sub:     'all',
  q:       '',
  online:  'all',
  sort:    'newest',
  expiry:  'all',
  vehicle: 'all',
  ldoc:    'all',
  nid:     'all',
  indoc:   'all',
  trips:   'all',
  page:    '1',
  size:    String(DEFAULT_PAGE_SIZE),
} as const

type FilterKey = keyof typeof DEFAULTS

export function useDriverFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read all filter values from URL
  const verificationStatus = searchParams.get('status') ?? 'all'
  const subscriptionStatus  = searchParams.get('sub')    ?? 'all'
  const urlSearch           = searchParams.get('q')      ?? ''
  const onlineStatus        = searchParams.get('online') ?? 'all'
  const sortBy              = searchParams.get('sort')   ?? 'newest'
  const licenseExpiry       = searchParams.get('expiry') ?? 'all'
  const hasVehicle          = searchParams.get('vehicle') ?? 'all'
  const licenseDoc          = searchParams.get('ldoc')   ?? 'all'
  const nationalIdDoc       = searchParams.get('nid')    ?? 'all'
  const insuranceDoc        = searchParams.get('indoc')  ?? 'all'
  const tripsFilter         = searchParams.get('trips')  ?? 'all'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const rawSize = Number(searchParams.get('size') ?? String(DEFAULT_PAGE_SIZE))
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE

  // Local state for the search input — URL is the debounced value
  const [searchInput, setSearchInput] = useState(urlSearch)

  function applyParams(updates: Partial<Record<FilterKey, string>>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates) as [FilterKey, string][]) {
      if (v === DEFAULTS[k]) {
        next.delete(k)
      } else {
        next.set(k, v)
      }
    }
    if (resetPage) next.delete('page')
    const qs = next.toString()
    router.replace(qs ? `/admin/drivers?${qs}` : '/admin/drivers')
  }

  // Debounce search input to URL
  useEffect(() => {
    if (searchInput.trim() === urlSearch) return
    const t = setTimeout(() => {
      applyParams({ q: searchInput.trim() }, true)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function setFilter(key: FilterKey, value: string) {
    applyParams({ [key]: value } as Partial<Record<FilterKey, string>>, true)
  }

  function setPage(p: number) {
    applyParams({ page: String(p) }, false)
  }

  function setPageSize(s: number) {
    applyParams({ size: String(s) }, true)
  }

  function clearFilters() {
    setSearchInput('')
    router.replace('/admin/drivers')
  }

  function clampPage(totalPages: number) {
    if (page > totalPages) {
      applyParams({ page: String(totalPages) }, false)
    }
  }

  const { activeFilterCount, hasActiveFilters } = useMemo(() => {
    let n = 0
    if (verificationStatus !== 'all') n++
    if (subscriptionStatus !== 'all') n++
    if (urlSearch !== '') n++
    if (onlineStatus !== 'all') n++
    if (licenseExpiry !== 'all') n++
    if (hasVehicle !== 'all') n++
    if (licenseDoc !== 'all') n++
    if (nationalIdDoc !== 'all') n++
    if (insuranceDoc !== 'all') n++
    if (tripsFilter !== 'all') n++
    if (sortBy !== 'newest') n++
    return { activeFilterCount: n, hasActiveFilters: n > 0 }
  }, [
    verificationStatus, subscriptionStatus, urlSearch, onlineStatus,
    licenseExpiry, hasVehicle, licenseDoc, nationalIdDoc, insuranceDoc, tripsFilter, sortBy,
  ])

  return {
    verificationStatus,
    subscriptionStatus,
    onlineStatus,
    sortBy,
    licenseExpiry,
    hasVehicle,
    licenseDoc,
    nationalIdDoc,
    insuranceDoc,
    tripsFilter,
    searchInput,
    setSearchInput,
    debouncedSearch: urlSearch,
    page,
    pageSize,
    setPage,
    setPageSize,
    clampPage,
    setFilter,
    clearFilters,
    activeFilterCount,
    hasActiveFilters,
  }
}
