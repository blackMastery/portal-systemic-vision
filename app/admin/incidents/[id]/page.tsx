'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchTripRoute } from '@/lib/admin/fetch-trip-route'
import { TripRouteMap } from '@/components/drivers/trip-route-map'
import type { TripRoutePoint } from '@/types/trip-route-point'
import type { Json } from '@/types/database'
import type {
  IncidentCategory,
  IncidentReporterRole,
  IncidentStatus,
  DashcamRequestStatus,
} from '@/types/database'
import {
  ArrowLeft,
  User,
  MapPin,
  Video,
  History,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { updateIncidentStatus, assignAdmin, addAdminNote } from '../actions'

const categoryLabels: Record<IncidentCategory, string> = {
  safety_concern: 'Safety concern',
  harassment: 'Harassment',
  assault: 'Assault',
  robbery: 'Robbery',
  accident: 'Accident',
  payment_dispute: 'Payment dispute',
  driver_conduct: 'Driver conduct',
  passenger_conduct: 'Passenger conduct',
  other: 'Other',
}

const statusColors: Record<IncidentStatus, string> = {
  open: 'bg-red-100 text-red-800',
  under_review: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  escalated: 'bg-purple-100 text-purple-800',
}

const dashcamStatusLabels: Record<DashcamRequestStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

type IncidentDetail = {
  id: string
  trip_id: string | null
  reporter_user_id: string
  reporter_role: IncidentReporterRole
  subject_user_id: string | null
  category: IncidentCategory
  description: string
  status: IncidentStatus
  evidence_paths: string[]
  trip_snapshot: Json | null
  location_history_snapshot: Json | null
  admin_notes: string | null
  assigned_admin_id: string | null
  resolved_at: string | null
  created_at: string
  reporter: {
    id: string
    full_name: string | null
    phone_number: string | null
    email: string | null
    role: string
  } | null
  subject: {
    id: string
    full_name: string | null
    phone_number: string | null
    email: string | null
    role: string
  } | null
  trip: {
    id: string
    pickup_address: string | null
    pickup_latitude: number | null
    pickup_longitude: number | null
    destination_address: string | null
    destination_latitude: number | null
    destination_longitude: number | null
    status: string | null
    actual_fare: number | null
    requested_at: string | null
  } | null
}

type DashcamRow = {
  id: string
  status: DashcamRequestStatus
  requested_at: string
  deadline_at: string
  submitted_at: string | null
}

type HistoryRow = {
  id: string
  from_status: IncidentStatus | null
  to_status: IncidentStatus
  changed_at: string
  note: string | null
  changer: { full_name: string | null } | null
}

type TripForMap = {
  id: string
  pickup_latitude: number
  pickup_longitude: number
  pickup_address: string
  destination_latitude: number | null
  destination_longitude: number | null
  destination_address: string | null
  status: string
  actual_fare: number | null
  requested_at: string
}

function tripForMapFromSnapshot(snap: Json, tripId: string): TripForMap | null {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null
  const o = snap as Record<string, unknown>
  return {
    id: typeof o.id === 'string' ? o.id : tripId,
    pickup_latitude: Number(o.pickup_latitude) || 0,
    pickup_longitude: Number(o.pickup_longitude) || 0,
    pickup_address: String(o.pickup_address ?? ''),
    destination_latitude:
      o.destination_latitude != null ? Number(o.destination_latitude) : null,
    destination_longitude:
      o.destination_longitude != null ? Number(o.destination_longitude) : null,
    destination_address:
      o.destination_address != null ? String(o.destination_address) : null,
    status: String(o.status ?? 'completed'),
    actual_fare: o.actual_fare != null ? Number(o.actual_fare) : null,
    requested_at: String(o.requested_at ?? new Date().toISOString()),
  }
}

function tripForMapFromJoinedTrip(trip: IncidentDetail['trip']): TripForMap | null {
  if (!trip?.id) return null
  return {
    id: trip.id,
    pickup_latitude: trip.pickup_latitude ?? 0,
    pickup_longitude: trip.pickup_longitude ?? 0,
    pickup_address: trip.pickup_address ?? '',
    destination_latitude: trip.destination_latitude,
    destination_longitude: trip.destination_longitude,
    destination_address: trip.destination_address,
    status: trip.status ?? 'completed',
    actual_fare: trip.actual_fare,
    requested_at: trip.requested_at ?? new Date().toISOString(),
  }
}

function pointsFromLocationSnapshot(snap: Json): TripRoutePoint[] {
  if (!Array.isArray(snap)) return []
  const out: TripRoutePoint[] = []
  for (const p of snap) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue
    const o = p as Record<string, unknown>
    const lat = Number(o.latitude)
    const lng = Number(o.longitude)
    const rec = o.recorded_at
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof rec !== 'string') continue
    out.push({ latitude: lat, longitude: lng, recorded_at: rec })
  }
  return out
}

async function fetchIncidentBundle(id: string) {
  const supabase = createClient()

  const [incRes, dashRes, histRes] = await Promise.all([
    supabase
      .from('incidents')
      .select(
        `
        *,
        reporter:reporter_user_id (id, full_name, phone_number, email, role),
        subject:subject_user_id (id, full_name, phone_number, email, role),
        trip:trip_id (
          id,
          pickup_address,
          pickup_latitude,
          pickup_longitude,
          destination_address,
          destination_latitude,
          destination_longitude,
          status,
          actual_fare,
          requested_at
        )
      `,
      )
      .eq('id', id)
      .single(),
    supabase.from('dashcam_requests').select('*').eq('incident_id', id).maybeSingle(),
    supabase
      .from('incident_status_history')
      .select('*, changer:changed_by (full_name)')
      .eq('incident_id', id)
      .order('changed_at', { ascending: false }),
  ])

  if (incRes.error) throw incRes.error
  if (!incRes.data) throw new Error('Incident not found')

  const incident = incRes.data as unknown as IncidentDetail
  const dashcam = (dashRes.data as DashcamRow | null) ?? null
  const history = (histRes.data ?? []) as unknown as HistoryRow[]

  const evidenceUrls: Record<string, string> = {}
  for (const path of incident.evidence_paths ?? []) {
    const { data } = await supabase.storage
      .from('incident_evidence')
      .createSignedUrl(path, 3600)
    if (data?.signedUrl) evidenceUrls[path] = data.signedUrl
  }

  return { incident, dashcam, history, evidenceUrls }
}

async function fetchAdminOptions() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as { id: string; full_name: string | null; email: string | null }[]
}

export default function AdminIncidentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  const [statusDraft, setStatusDraft] = useState<IncidentStatus>('open')
  const [assignDraft, setAssignDraft] = useState<string>('')
  const [noteDraft, setNoteDraft] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-incident-detail', params.id],
    queryFn: () => fetchIncidentBundle(params.id),
  })

  // Sync form drafts when the loaded incident row changes (e.g. after save / refetch).
  useEffect(() => {
    if (data?.incident) {
      setStatusDraft(data.incident.status)
      setAssignDraft(data.incident.assigned_admin_id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when these server fields change
  }, [data?.incident?.id, data?.incident?.status, data?.incident?.assigned_admin_id])

  const { data: admins } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: fetchAdminOptions,
  })

  const tripForMap =
    data?.incident.trip != null
      ? tripForMapFromJoinedTrip(data.incident.trip)
      : data?.incident.trip_id && data.incident.trip_snapshot
        ? tripForMapFromSnapshot(data.incident.trip_snapshot, data.incident.trip_id)
        : null

  const { data: routePoints = [], isLoading: routeLoading } = useQuery({
    queryKey: ['admin-incident-route', params.id, data?.incident.trip_id],
    enabled: !!data?.incident.trip_id && !!tripForMap,
    queryFn: async () => {
      const tid = data!.incident.trip_id!
      const live = await fetchTripRoute(tid)
      if (live.length > 0) return live
      return pointsFromLocationSnapshot(data!.incident.location_history_snapshot)
    },
  })

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/incidents"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to incidents
        </Link>
        <div className="bg-white rounded-xl border p-6 text-sm text-red-700">
          Could not load this incident.
        </div>
      </div>
    )
  }

  const { incident, dashcam, history, evidenceUrls } = data

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-incident-detail', params.id] })
    queryClient.invalidateQueries({ queryKey: ['admin-incidents'] })
    queryClient.invalidateQueries({ queryKey: ['incidents-open-count'] })
  }

  function handleStatusSave() {
    if (statusDraft === incident.status) {
      setActionError('Pick a different status to save.')
      return
    }
    setActionError(null)
    startTransition(async () => {
      const r = await updateIncidentStatus(incident.id, statusDraft)
      if (!r.success) {
        setActionError(r.error ?? 'Failed to update status.')
        return
      }
      invalidate()
    })
  }

  function handleAssignSave() {
    setActionError(null)
    const next = assignDraft === '' ? null : assignDraft
    const current = incident.assigned_admin_id ?? null
    if (next === current) {
      setActionError('Change the assignee before saving.')
      return
    }
    startTransition(async () => {
      const r = await assignAdmin(incident.id, next)
      if (!r.success) {
        setActionError(r.error ?? 'Failed to assign.')
        return
      }
      invalidate()
    })
  }

  function handleAddNote() {
    setActionError(null)
    startTransition(async () => {
      const r = await addAdminNote(incident.id, noteDraft)
      if (!r.success) {
        setActionError(r.error ?? 'Failed to add note.')
        return
      }
      setNoteDraft('')
      invalidate()
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/incidents"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to incidents
        </Link>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Incident</h1>
            <p className="text-sm text-gray-500 mt-1">
              {categoryLabels[incident.category]} ·{' '}
              {format(new Date(incident.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
              statusColors[incident.status]
            }`}
          >
            {incident.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-gray-500" />
          Description
        </h2>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{incident.description}</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-5 w-5 text-gray-500" />
            Reporter
          </h2>
          <p className="text-sm font-medium text-gray-900">
            {incident.reporter?.full_name ?? '—'}
          </p>
          <p className="text-xs text-gray-500 capitalize">{incident.reporter_role}</p>
          {incident.reporter?.phone_number && (
            <p className="text-sm text-gray-600">{incident.reporter.phone_number}</p>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-5 w-5 text-gray-500" />
            Subject (other party)
          </h2>
          {incident.subject ? (
            <>
              <p className="text-sm font-medium text-gray-900">
                {incident.subject.full_name ?? '—'}
              </p>
              <p className="text-xs text-gray-500 capitalize">{incident.subject.role}</p>
              {incident.subject.phone_number && (
                <p className="text-sm text-gray-600">{incident.subject.phone_number}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Not specified</p>
          )}
        </section>
      </div>

      {incident.trip_id && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-gray-500" />
            Trip & route
          </h2>
          <Link
            href={`/admin/trips/${incident.trip_id}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Open trip {incident.trip_id.slice(0, 8)}… →
          </Link>
          {tripForMap && (
            <TripRouteMap
              trip={tripForMap}
              routePoints={routePoints}
              isLoadingRoute={routeLoading}
              showTripInfo
            />
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 font-medium">
              Frozen trip snapshot (JSON)
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded-lg overflow-x-auto text-xs max-h-64 overflow-y-auto">
              {JSON.stringify(incident.trip_snapshot, null, 2)}
            </pre>
          </details>
        </section>
      )}

      {incident.evidence_paths?.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Evidence</h2>
          <div className="flex flex-wrap gap-4">
            {incident.evidence_paths.map((path) => {
              const url = evidenceUrls[path]
              const isImg = /\.(jpe?g|png|gif|webp)$/i.test(path)
              return (
                <div key={path} className="border rounded-lg p-2 max-w-xs">
                  {url && isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="max-h-48 rounded" />
                  ) : url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 break-all"
                    >
                      {path}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500 break-all">{path}</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {dashcam && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Video className="h-5 w-5 text-gray-500" />
            Dashcam request
          </h2>
          <p className="text-sm text-gray-700">
            Status:{' '}
            <span className="font-medium">{dashcamStatusLabels[dashcam.status]}</span>
          </p>
          <p className="text-xs text-gray-500">
            Requested {format(new Date(dashcam.requested_at), 'MMM d, yyyy h:mm a')} · Deadline{' '}
            {format(new Date(dashcam.deadline_at), 'MMM d, yyyy h:mm a')}
          </p>
          {dashcam.submitted_at && (
            <p className="text-xs text-gray-500">
              Submitted {format(new Date(dashcam.submitted_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History className="h-5 w-5 text-gray-500" />
            Status history
          </h2>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-blue-200 pl-3">
                <span className="text-gray-500">
                  {format(new Date(h.changed_at), 'MMM d, yyyy h:mm a')}
                </span>
                {' · '}
                <span className="font-medium text-gray-800">
                  {h.from_status ? `${h.from_status} → ` : ''}
                  {h.to_status}
                </span>
                {h.changer?.full_name && (
                  <span className="text-gray-600"> by {h.changer.full_name}</span>
                )}
                {h.note && <p className="text-gray-600 mt-1">{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-gray-500" />
          Admin actions
        </h2>
        {incident.admin_notes && (
          <div className="rounded-lg bg-gray-50 border p-3 text-sm text-gray-800 whitespace-pre-wrap">
            <p className="text-xs font-medium text-gray-500 mb-1">Admin notes</p>
            {incident.admin_notes}
          </div>
        )}
        {actionError && <p className="text-sm text-red-700">{actionError}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <div className="flex gap-2">
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as IncidentStatus)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              >
                <option value="open">open</option>
                <option value="under_review">under_review</option>
                <option value="resolved">resolved</option>
                <option value="escalated">escalated</option>
              </select>
              <button
                type="button"
                disabled={isPending}
                onClick={handleStatusSave}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Assigned admin
            </label>
            <div className="flex gap-2">
              <select
                value={assignDraft}
                onChange={(e) => setAssignDraft(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">— Unassigned —</option>
                {(admins ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name ?? a.email ?? a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending}
                onClick={handleAssignSave}
                className="px-3 py-2 bg-gray-800 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Append admin note</label>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Visible on this incident record…"
          />
          <button
            type="button"
            disabled={isPending || !noteDraft.trim()}
            onClick={handleAddNote}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Add note
          </button>
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/incidents')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Back to list
        </button>
      </section>
    </div>
  )
}
