'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Siren, Volume2, VolumeX, BellRing, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PanicAlertStatus } from '@/types/database'

export const ACTIVE_PANIC_ALERTS_QUERY_KEY = ['panic-alerts-active'] as const

const MUTE_STORAGE_KEY = 'panic-alert-muted'
const ACK_STORAGE_KEY = 'panic-alert-acknowledged-ids'
const CHIME_INTERVAL_MS = 10_000
const FALLBACK_REFETCH_MS = 30_000

type ActivePanicAlert = {
  id: string
  incident_id: string
  trip_id: string
  role: 'rider' | 'driver'
  status: PanicAlertStatus
  created_at: string
  tracking_token: string
  user: { full_name: string | null } | null
}

type PanicAlertChangeRow = {
  id: string
  incident_id: string
  trip_id: string
  role: 'rider' | 'driver'
  status: PanicAlertStatus
  created_at: string
  tracking_token: string
}

async function fetchActivePanicAlerts(): Promise<ActivePanicAlert[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('panic_alerts')
    .select('id, incident_id, trip_id, role, status, created_at, tracking_token, user:user_id(full_name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ActivePanicAlert[]
}

function readAckIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ACK_STORAGE_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeAckIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

/** Two-tone alarm chime rendered with the Web Audio API (no asset needed). */
function playChime(ctx: AudioContext) {
  const t0 = ctx.currentTime
  const tones: { freq: number; at: number; dur: number }[] = [
    { freq: 880, at: 0, dur: 0.18 },
    { freq: 1175, at: 0.22, dur: 0.18 },
    { freq: 880, at: 0.5, dur: 0.18 },
    { freq: 1175, at: 0.72, dur: 0.28 },
  ]
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = tone.freq
    gain.gain.setValueAtTime(0.0001, t0 + tone.at)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + tone.at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0 + tone.at)
    osc.stop(t0 + tone.at + tone.dur + 0.05)
  }
}

function minutesAgo(iso: string, now: number): string {
  const diffMin = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const h = Math.floor(diffMin / 60)
  return `${h} h ${diffMin % 60} min ago`
}

export function PanicAlertBanner() {
  const queryClient = useQueryClient()
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [armed, setArmed] = useState(false)
  const [muted, setMuted] = useState(false)
  const [ackIds, setAckIds] = useState<Set<string>>(() => new Set())
  const [now, setNow] = useState(() => Date.now())

  const { data: alerts = [] } = useQuery({
    queryKey: ACTIVE_PANIC_ALERTS_QUERY_KEY,
    queryFn: fetchActivePanicAlerts,
    refetchInterval: FALLBACK_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Read persisted prefs after mount so SSR markup matches.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === 'true')
    } catch {
      // ignore
    }
    setAckIds(readAckIds())
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const invalidateIncidentQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ACTIVE_PANIC_ALERTS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] })
    void queryClient.invalidateQueries({ queryKey: ['incidents-open-count'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-incident-detail'] })
  }, [queryClient])

  const armAudio = useCallback(() => {
    if (typeof window === 'undefined') return
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor()
      const ctx = audioCtxRef.current
      const finish = () => {
        if (ctx.state === 'running') setArmed(true)
      }
      if (ctx.state === 'suspended') {
        void ctx.resume().then(finish, () => undefined)
      } else {
        finish()
      }
    } catch {
      // Audio unavailable; banner still works visually.
    }
  }, [])

  // Browsers require a user gesture before audio can play: arm on the first click anywhere.
  useEffect(() => {
    if (armed) return
    const handler = () => armAudio()
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [armed, armAudio])

  // Realtime: INSERT adds (and re-alarms), UPDATE to a non-active status removes.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('panic_alerts_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'panic_alerts' },
        (payload) => {
          const next = payload.new as Partial<PanicAlertChangeRow> | undefined
          if (payload.eventType === 'INSERT' && next?.id && next.status === 'active') {
            queryClient.setQueryData<ActivePanicAlert[]>(ACTIVE_PANIC_ALERTS_QUERY_KEY, (prev) => {
              const list = prev ?? []
              if (list.some((a) => a.id === next.id)) return list
              return [{ ...(next as PanicAlertChangeRow), user: null }, ...list]
            })
          } else if (payload.eventType === 'UPDATE' && next?.id && next.status !== 'active') {
            queryClient.setQueryData<ActivePanicAlert[]>(ACTIVE_PANIC_ALERTS_QUERY_KEY, (prev) =>
              (prev ?? []).filter((a) => a.id !== next.id)
            )
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<PanicAlertChangeRow> | undefined
            if (old?.id) {
              queryClient.setQueryData<ActivePanicAlert[]>(ACTIVE_PANIC_ALERTS_QUERY_KEY, (prev) =>
                (prev ?? []).filter((a) => a.id !== old.id)
              )
            }
          }
          // Refetch to pick up the joined presser name and keep incident views in sync.
          invalidateIncidentQueries()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, invalidateIncidentQueries])

  const unacknowledged = useMemo(
    () => alerts.filter((a) => !ackIds.has(a.id)),
    [alerts, ackIds]
  )
  const shouldChime = armed && !muted && unacknowledged.length > 0

  // Chime immediately when a new unacknowledged alert appears, then every 10s until acknowledged.
  useEffect(() => {
    if (!shouldChime) return
    const ctx = audioCtxRef.current
    if (!ctx) return
    playChime(ctx)
    const id = setInterval(() => playChime(ctx), CHIME_INTERVAL_MS)
    return () => clearInterval(id)
  }, [shouldChime, unacknowledged.length])

  function acknowledge() {
    const next = new Set(ackIds)
    for (const a of alerts) next.add(a.id)
    setAckIds(next)
    writeAckIds(next)
  }

  function toggleMute() {
    setMuted((prev) => {
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(!prev))
      } catch {
        // ignore
      }
      return !prev
    })
  }

  if (alerts.length === 0) {
    if (armed) return null
    return (
      <div className="flex justify-end px-4 py-1 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onClick={armAudio}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
          title="Browsers block sound until you interact with the page. Click to enable the panic alert chime."
        >
          <BellRing className="h-3 w-3" aria-hidden />
          Enable alert sound
        </button>
      </div>
    )
  }

  return (
    <div role="alert" aria-live="assertive" className="bg-red-600 text-white shadow-md">
      <div className="px-4 py-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide">
            <Siren className="h-5 w-5 animate-pulse" aria-hidden />
            {alerts.length === 1 ? 'Panic alert active' : `${alerts.length} panic alerts active`}
          </div>
          <div className="flex items-center gap-2">
            {!armed && (
              <button
                type="button"
                onClick={armAudio}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/40 px-2.5 py-0.5 text-[11px] font-medium hover:bg-white/25"
              >
                <BellRing className="h-3 w-3" aria-hidden />
                Enable alert sound
              </button>
            )}
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium hover:bg-white/25"
              aria-pressed={muted}
              title={muted ? 'Unmute chime' : 'Mute chime'}
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
              {muted ? 'Muted' : 'Sound on'}
            </button>
            {unacknowledged.length > 0 && (
              <button
                type="button"
                onClick={acknowledge}
                className="inline-flex items-center rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Acknowledge
              </button>
            )}
          </div>
        </div>

        <ul className="divide-y divide-white/20">
          {alerts.map((a) => (
            <li key={a.id} className="py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="font-semibold">PANIC</span> — {a.role}{' '}
                <span className="font-medium">{a.user?.full_name ?? 'Unknown user'}</span> —{' '}
                {minutesAgo(a.created_at, now)}
                {!ackIds.has(a.id) && (
                  <span className="ml-2 inline-flex items-center rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                    New
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <Link
                  href={`/admin/incidents/${a.incident_id}`}
                  className="underline underline-offset-2 font-medium hover:text-red-100"
                >
                  Open incident
                </Link>
                <a
                  href={`/track/${a.tracking_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 font-medium hover:text-red-100"
                >
                  Tracking
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
