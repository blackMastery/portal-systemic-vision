'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Megaphone, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

type Audience = 'driver' | 'rider'

type BroadcastSuccess = {
  success: true
  message: string
  requestedCount: number
  successCount: number
  failureCount: number
  invalidTokensRemoved: number
}

type BroadcastErrorBody = {
  error: string
  code?: string
  statusCode?: number
}

function parseDataPayload(raw: string): Record<string, string> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') return null
    out[k] = v
  }
  return out
}

export default function AdminNotificationsPage() {
  const [audience, setAudience] = useState<Audience>('driver')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notificationType, setNotificationType] = useState('')
  const [dataJson, setDataJson] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BroadcastSuccess | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setDataError(null)

    const data = parseDataPayload(dataJson)
    if (dataJson.trim() && data === null) {
      setDataError(
        'Data must be a JSON object with string values only, e.g. {"trip_id":"123"}'
      )
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: userError } = await supabase.auth.getUser()
      if (userError) {
        setError('Session expired or invalid. Please sign in again.')
        setSubmitting(false)
        return
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setError('You are not signed in. Please log in again.')
        setSubmitting(false)
        return
      }

      const payload: Record<string, unknown> = {
        audience,
        title: title.trim(),
        body: body.trim(),
      }
      if (notificationType.trim()) {
        payload.notification_type = notificationType.trim()
      }
      if (data) {
        payload.data = data
      }

      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as BroadcastSuccess | BroadcastErrorBody

      if (!res.ok) {
        const err = json as BroadcastErrorBody
        setError(err.error || `Request failed (${res.status})`)
        return
      }

      setResult(json as BroadcastSuccess)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <Megaphone className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Push
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Broadcast notifications</h1>
        <p className="mt-2 text-gray-600">
          Send the same notification to every{' '}
          <strong>driver</strong> or <strong>rider</strong> who has an FCM token
          registered. Uses the correct Firebase project per audience.
        </p>
        <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          This affects all users in the selected group. Use clear, accurate copy.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Audience
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="audience"
                checked={audience === 'driver'}
                onChange={() => setAudience('driver')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-800">All drivers (driver Firebase)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="audience"
                checked={audience === 'rider'}
                onChange={() => setAudience('rider')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-800">All riders (rider Firebase)</span>
            </label>
          </div>
        </div>

        <div>
          <label
            htmlFor="push-title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="push-title"
            type="text"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. Service update"
          />
          <p className="mt-1 text-xs text-gray-500">{title.length}/100</p>
        </div>

        <div>
          <label
            htmlFor="push-body"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            id="push-body"
            required
            maxLength={500}
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Notification body shown on the device"
          />
          <p className="mt-1 text-xs text-gray-500">{body.length}/500</p>
        </div>

        <div>
          <label
            htmlFor="push-type"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notification type (optional)
          </label>
          <input
            id="push-type"
            type="text"
            value={notificationType}
            onChange={(e) => setNotificationType(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. announcement"
          />
        </div>

        <div>
          <label
            htmlFor="push-data"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Extra data JSON (optional)
          </label>
          <textarea
            id="push-data"
            rows={3}
            value={dataJson}
            onChange={(e) => {
              setDataJson(e.target.value)
              setDataError(null)
            }}
            className="w-full font-mono text-sm rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder='{"screen":"home"} — keys and values must be strings'
          />
          {dataError && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {dataError}
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{result.message}</p>
              <ul className="mt-2 space-y-1 text-green-800">
                <li>Recipients (with token): {result.requestedCount}</li>
                <li>Delivered (FCM success): {result.successCount}</li>
                <li>Failed: {result.failureCount}</li>
                <li>Invalid tokens cleared: {result.invalidTokensRemoved}</li>
              </ul>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Megaphone className="h-4 w-4" />
                Send broadcast
              </>
            )}
          </button>
          <Link
            href="/admin/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Back to dashboard
          </Link>
        </div>
      </form>
    </div>
  )
}
