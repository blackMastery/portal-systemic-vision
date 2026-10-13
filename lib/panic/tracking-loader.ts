import { createServiceRoleClient } from '@/lib/supabase-service'
import { loadPanicConfig } from './config'
import { computeTrackingState, type TrackingState } from './tracking'
import { loadPanicTripBundle } from './trip-bundle'

export const TRACKING_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/

export type TrackingPosition = {
  lat: number
  lng: number
  recorded_at: string
  speed_kmh: number | null
  heading: number | null
}

export type TrackingSnapshot = {
  state: TrackingState
  grace_ends_at: string | null
  alert: {
    status: string
    created_at: string
    resolved_at: string | null
    role: 'rider' | 'driver'
    presser_first_name: string
    press_location: { lat: number; lng: number } | null
  }
  trip_status: string
  driver: {
    name: string | null
    vehicle: { make: string | null; model: string | null; color: string | null; plate: string | null } | null
  }
  support_phone_display: string
  /** Vehicle trail (driver app `location_history`). */
  positions: TrackingPosition[]
  last_position: TrackingPosition | null
  /** True when the presser's phone streams its own location (rider alerts). */
  presser_streams: boolean
  /** Presser's phone trail (`panic_location_points`); empty for driver alerts. */
  presser_positions: TrackingPosition[]
  presser_last_position: TrackingPosition | null
  generated_at: string
}

export type TrackingLoadResult =
  | { kind: 'not_found' }
  | { kind: 'expired'; expires_at: string }
  | { kind: 'ok'; snapshot: TrackingSnapshot }

/** Phone trail points returned per poll (~10 min at one fix every 5s). */
const PRESSER_POINTS_LIMIT = 120

type PresserRow = {
  latitude: number
  longitude: number
  recorded_at: string
  speed_mps: number | null
  heading: number | null
}

function firstName(full: string | null | undefined): string {
  const f = (full ?? '').trim().split(/\s+/)[0]
  return f || 'Links user'
}

/**
 * Token-gated read used by both `/track/[token]` and `/api/track/[token]`.
 * Uses the service role on the server only and returns no phone numbers,
 * addresses, trip ids or incident ids.
 */
export async function loadTrackingSnapshot(token: string): Promise<TrackingLoadResult> {
  if (!TRACKING_TOKEN_RE.test(token)) return { kind: 'not_found' }
  const service = createServiceRoleClient()

  await service.rpc('expire_stale_panic_alerts').then(() => undefined, () => undefined)

  const { data: alert } = await service
    .from('panic_alerts')
    .select('*')
    .eq('tracking_token', token)
    .maybeSingle()
  if (!alert) return { kind: 'not_found' }

  const bundle = await loadPanicTripBundle(service, alert.trip_id)
  const presserStreams = alert.role === 'rider'
  const { state, graceEndsAt } = computeTrackingState(alert, bundle?.trip ?? null, new Date(), {
    presserStreams,
  })
  if (state === 'expired') return { kind: 'expired', expires_at: alert.expires_at }

  const [{ data: rows }, { data: presserRows }, cfg] = await Promise.all([
    service
      .from('location_history')
      .select('latitude, longitude, recorded_at, speed_kmh, heading')
      .eq('trip_id', alert.trip_id)
      .order('recorded_at', { ascending: false })
      .limit(60),
    presserStreams
      ? service
          .from('panic_location_points')
          .select('latitude, longitude, recorded_at, speed_mps, heading')
          .eq('alert_id', alert.id)
          .order('recorded_at', { ascending: false })
          .limit(PRESSER_POINTS_LIMIT)
      : Promise.resolve({ data: [] as PresserRow[] }),
    loadPanicConfig(service),
  ])

  const positions: TrackingPosition[] = (rows ?? [])
    .map((r) => ({
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      recorded_at: r.recorded_at,
      speed_kmh: r.speed_kmh == null ? null : Number(r.speed_kmh),
      heading: r.heading == null ? null : Number(r.heading),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .reverse()

  const presserPositions: TrackingPosition[] = (presserRows ?? [])
    .map((r) => ({
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      recorded_at: r.recorded_at,
      speed_kmh: r.speed_mps == null ? null : Number(r.speed_mps) * 3.6,
      heading: r.heading == null ? null : Number(r.heading),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .reverse()

  const presser = alert.role === 'rider' ? bundle?.rider : bundle?.driver

  return {
    kind: 'ok',
    snapshot: {
      state,
      grace_ends_at: graceEndsAt ? graceEndsAt.toISOString() : null,
      alert: {
        status: alert.status,
        created_at: alert.created_at,
        resolved_at: alert.resolved_at,
        role: alert.role,
        presser_first_name: firstName(presser?.fullName),
        press_location:
          alert.latitude != null && alert.longitude != null
            ? { lat: Number(alert.latitude), lng: Number(alert.longitude) }
            : null,
      },
      trip_status: bundle?.trip.status ?? 'unknown',
      driver: {
        name: bundle?.driver?.fullName ?? null,
        vehicle: bundle?.vehicle
          ? {
              make: bundle.vehicle.make,
              model: bundle.vehicle.model,
              color: bundle.vehicle.color,
              plate: bundle.vehicle.licensePlate,
            }
          : null,
      },
      support_phone_display: cfg.supportDisplay,
      positions,
      last_position: positions.length ? positions[positions.length - 1] : null,
      presser_streams: presserStreams,
      presser_positions: presserPositions,
      presser_last_position: presserPositions.length ? presserPositions[presserPositions.length - 1] : null,
      generated_at: new Date().toISOString(),
    },
  }
}
