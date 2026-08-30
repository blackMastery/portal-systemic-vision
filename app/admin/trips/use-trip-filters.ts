'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatGuyana } from '@/lib/guyana-time'

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 280

const STATUS_VALUES = ['all', 'requested', 'accepted', 'picked_up', 'completed', 'cancelled'] as const
const TYPE_VALUES = ['all', 'airport', 'short_drop', 'market', 'other'] as const

const DEFAULTS = {
  status: 'all',
  type: 'all',
  q: '',
  start: '',
  end: '',
  page: '1',
  size: String(DEFAULT_PAGE_SIZE),
} as const

type FilterKey = keyof typeof DEFAULTS

function parseEnum(value: string | null, allowed: readonly string[], fallback: string): string {
  if (!value) return fallback
  return allowed.includes(value) ? value : fallback
}

// The dates default to today (Guyana time). An absent param means the default;
// an explicitly empty param (`start=`) means the user cleared the filter.
function parseDate(value: string | null, fallback: string): string {
  if (value === null) return fallback
  if (value === '') return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

export function useTripFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const today = formatGuyana(new Date(), 'yyyy-MM-dd')
  const defaults: Record<FilterKey, string> = { ...DEFAULTS, start: today, end: today }

  const status = parseEnum(searchParams.get('status'), STATUS_VALUES, 'all')
  const tripType = parseEnum(searchParams.get('type'), TYPE_VALUES, 'all')
  const urlSearch = searchParams.get('q') ?? ''
  const startDate = parseDate(searchParams.get('start'), defaults.start)
  const endDate = parseDate(searchParams.get('end'), defaults.end)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const rawSize = Number(searchParams.get('size') ?? String(DEFAULT_PAGE_SIZE))
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE

  const [searchInput, setSearchInput] = useState(urlSearch)

  useEffect(() => {
    setSearchInput(urlSearch)
  }, [urlSearch])

  function applyParams(updates: Partial<Record<FilterKey, string>>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates) as [FilterKey, string][]) {
      if (v === defaults[k]) {
        next.delete(k)
      } else {
        next.set(k, v)
      }
    }
    if (resetPage) next.delete('page')
    const qs = next.toString()
    router.replace(qs ? `/admin/trips?${qs}` : '/admin/trips', { scroll: false })
  }

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
    router.replace('/admin/trips', { scroll: false })
  }

  function clampPage(totalPages: number) {
    if (page > totalPages) {
      applyParams({ page: String(totalPages) }, false)
    }
  }

  const { activeFilterCount, hasActiveFilters } = useMemo(() => {
    let n = 0
    if (status !== 'all') n++
    if (tripType !== 'all') n++
    if (urlSearch !== '') n++
    if (startDate !== defaults.start) n++
    if (endDate !== defaults.end) n++
    return { activeFilterCount: n, hasActiveFilters: n > 0 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tripType, urlSearch, startDate, endDate, defaults.start, defaults.end])

  return {
    status,
    tripType,
    startDate,
    endDate,
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
