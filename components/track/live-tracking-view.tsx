'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, Car, AlertTriangle } from 'lucide-react'
import type { TrackingSnapshot } from '@/lib/panic/tracking-loader'
import { formatGuyana, parseLocationHistoryRecordedAt } from '@/lib/guyana-time'
import { TrackingMap } from './tracking-map'

type ExpiredData = { state: 'expired'; expires_at: string | null }
export type TrackingData = TrackingSnapshot | ExpiredData

const LIVE_INTERVAL_MS = 5_000
const GRACE_INTERVAL_MS = 30_000

class TrackingFetchError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchTracking(token: string): Promise<TrackingData> {
  const res = await fetch(`/api/track/${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { expires_at?: string }
    return { state: 'expired', expires_at: body.expires_at ?? null }
  }
  if (!res.ok) {
    throw new TrackingFetchError(res.status, `Tracking request failed (${res.status})`)
  }
  return (await res.json()) as TrackingSnapshot
}

function isSnapshot(d: TrackingData): d is TrackingSnapshot {
  return d.state !== 'expired'
}

function relativeAgo(from: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} min ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function StatusPill({ state }: { state: TrackingData['state'] }) {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
        </span>
        Live
      </span>
    )
  }
  if (state === 'grace') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-xs font-semibold">
        Last known position — updates stopped
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-200 text-gray-800 px-3 py-1 text-xs font-semibold">
      Expired
    </span>
  )
}

export function LiveTrackingView({
  token,
  initial,
}: {
  token: string
  initial: TrackingSnapshot
}) {
  const { data, isError, dataUpdatedAt } = useQuery<TrackingData, Error>({
    queryKey: ['track', token],
    queryFn: () => fetchTracking(token),
    initialData: initial,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      if (state === 'live') return LIVE_INTERVAL_MS
      if (state === 'grace') return GRACE_INTERVAL_MS
      return false
    },
    retry: (count, err) => {
      if (err instanceof TrackingFetchError && err.status >= 400 && err.status < 500) return false
      return count < 3
    },
  })

  // 1s ticker so "Updated X ago" stays honest between polls.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const snapshot: TrackingSnapshot | null = data && isSnapshot(data) ? data : null
  const state: TrackingData['state'] = data?.state ?? initial.state
  const alert = snapshot?.alert ?? initial.alert
  const driver = snapshot?.driver ?? initial.driver
  const supportPhone = snapshot?.support_phone_display ?? initial.support_phone_display
  const positions = snapshot?.positions ?? initial.positions
  const lastPosition = snapshot?.last_position ?? initial.last_position

  const lastUpdate = lastPosition ? parseLocationHistoryRecordedAt(lastPosition.recorded_at) : null
  const lastUpdateValid = lastUpdate != null && !Number.isNaN(lastUpdate.getTime())

  const vehicle = driver.vehicle
  const vehicleLine = vehicle
    ? [vehicle.color, vehicle.make, vehicle.model].filter((p) => p && p.trim()).join(' ')
    : ''
  const telHref = supportPhone ? `tel:${supportPhone.replace(/[^\d+]/g, '')}` : null

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-red-600 text-white px-4 py-4 shadow">
        <div className="max-w-2xl mx-auto flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">
              Emergency alert — {alert.presser_first_name}
            </h1>
            <p className="text-xs text-red-100 mt-0.5">
              {alert.role === 'rider' ? 'Rider' : 'Driver'} pressed the panic button at{' '}
              {formatGuyana(alert.created_at, 'HH:mm, d MMM')} (Guyana time)
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusPill state={state} />
          <p className="text-xs text-gray-600">
            {lastUpdateValid && lastUpdate
              ? `Updated ${relativeAgo(lastUpdate, now)}`
              : 'No location received yet'}
          </p>
        </div>

        {state === 'expired' && (
          <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-700">
            Location sharing for this alert has ended. The last known position is shown below.
          </div>
        )}
        {state === 'grace' && snapshot?.grace_ends_at && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
            {alert.status === 'resolved'
              ? `${alert.presser_first_name} marked this alert as resolved. `
              : 'The trip has ended. '}
            This link stays available until {formatGuyana(snapshot.grace_ends_at, 'HH:mm')}.
          </div>
        )}
        {isError && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
            Could not refresh the location. Retrying… (last data{' '}
            {relativeAgo(new Date(dataUpdatedAt), now)})
          </div>
        )}

        <TrackingMap
          positions={positions}
          lastPosition={lastPosition}
          pressLocation={alert.press_location}
        />

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Car className="h-4 w-4 text-gray-500" aria-hidden />
            Driver &amp; vehicle
          </h2>
          <p className="text-base font-medium text-gray-900">{driver.name ?? 'Driver not assigned'}</p>
          {vehicle ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span>{vehicleLine || 'Vehicle'}</span>
              {vehicle.plate && (
                <span className="inline-flex items-center rounded border border-gray-400 bg-gray-50 px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-gray-900">
                  {vehicle.plate}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Vehicle details unavailable</p>
          )}
        </section>

        {telHref && (
          <a
            href={telHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3.5 text-base font-semibold text-white shadow hover:bg-gray-800 active:bg-gray-950"
          >
            <Phone className="h-5 w-5" aria-hidden />
            Call Links support {supportPhone}
          </a>
        )}

        <p className="text-xs text-gray-500 text-center pb-4">
          If someone is in immediate danger, call the police (911) first.
        </p>
      </div>
    </main>
  )
}
