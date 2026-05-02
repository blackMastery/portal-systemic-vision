'use client'

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Megaphone,
  X,
} from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  recipientUserIds: string[]
  totalRidersShown: number
}

type SendResult = {
  success: true
  message: string
  requestedCount: number
  successCount: number
  failureCount: number
  invalidTokensRemoved: number
}

type ApiErrorBody = {
  error: string
  code?: string
  statusCode?: number
}

type Step = 'form' | 'confirming' | 'submitting' | 'result'

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

export function SendNotificationModal({
  open,
  onClose,
  recipientUserIds,
  totalRidersShown,
}: Props) {
  const idPrefix = useId()
  const [step, setStep] = useState<Step>('form')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notificationType, setNotificationType] = useState('')
  const [dataJson, setDataJson] = useState('')
  const [dataError, setDataError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (open) return
    setStep('form')
    setTitle('')
    setBody('')
    setNotificationType('')
    setDataJson('')
    setDataError(null)
    setError(null)
    setResult(null)
  }, [open])

  if (!open) return null

  const recipientCount = recipientUserIds.length
  const canSend = recipientCount > 0

  function handleProceedToConfirm(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDataError(null)

    if (dataJson.trim() && parseDataPayload(dataJson) === null) {
      setDataError(
        'Data must be a JSON object with string values only, e.g. {"trip_id":"123"}'
      )
      return
    }
    if (!canSend) return
    setStep('confirming')
  }

  async function handleConfirmSend() {
    setError(null)
    setStep('submitting')
    try {
      const supabase = createClient()
      const { error: userError } = await supabase.auth.getUser()
      if (userError) {
        setError('Session expired or invalid. Please sign in again.')
        setStep('form')
        return
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setError('You are not signed in. Please log in again.')
        setStep('form')
        return
      }

      const data = parseDataPayload(dataJson)
      const payload: Record<string, unknown> = {
        user_ids: recipientUserIds,
        title: title.trim(),
        body: body.trim(),
      }
      if (notificationType.trim()) {
        payload.notification_type = notificationType.trim()
      }
      if (data) {
        payload.data = data
      }

      const res = await fetch('/api/notifications/send/riders/targeted', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as SendResult | ApiErrorBody

      if (!res.ok) {
        const err = json as ApiErrorBody
        setError(err.error || `Request failed (${res.status})`)
        setStep('form')
        return
      }

      setResult(json as SendResult)
      setStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStep('form')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${idPrefix}-title`}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Megaphone className="h-5 w-5" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Push
              </span>
            </div>
            <h2
              id={`${idPrefix}-title`}
              className="text-lg font-semibold text-gray-900"
            >
              Send notification to filtered riders
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Sending to{' '}
              <span className="font-semibold text-gray-900">
                {totalRidersShown}
              </span>{' '}
              {totalRidersShown === 1 ? 'rider' : 'riders'} matched by the
              current filters. Only riders with a registered FCM token will
              actually receive the push.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'form' && (
          <form onSubmit={handleProceedToConfirm} className="px-6 py-5 space-y-5">
            <div>
              <label
                htmlFor={`${idPrefix}-push-title`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id={`${idPrefix}-push-title`}
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
                htmlFor={`${idPrefix}-push-body`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id={`${idPrefix}-push-body`}
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
                htmlFor={`${idPrefix}-push-type`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Notification type (optional)
              </label>
              <input
                id={`${idPrefix}-push-type`}
                type="text"
                value={notificationType}
                onChange={(e) => setNotificationType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. announcement"
              />
            </div>

            <div>
              <label
                htmlFor={`${idPrefix}-push-data`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Extra data JSON (optional)
              </label>
              <textarea
                id={`${idPrefix}-push-data`}
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

            {!canSend && (
              <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>No riders match the current filters.</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Megaphone className="h-4 w-4" />
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'confirming' && (
          <div className="px-6 py-6 space-y-5">
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                Send to {recipientCount}{' '}
                {recipientCount === 1 ? 'rider' : 'riders'}?
              </p>
              <p className="mt-1">
                This pushes immediately to every rider in the current filtered
                list who has a registered FCM token. This action cannot be
                undone.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 space-y-1">
              <p>
                <span className="font-medium text-gray-600">Title:</span>{' '}
                {title}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium text-gray-600">Message:</span>{' '}
                {body}
              </p>
              {notificationType.trim() && (
                <p>
                  <span className="font-medium text-gray-600">Type:</span>{' '}
                  {notificationType.trim()}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
              >
                <Megaphone className="h-4 w-4" />
                Confirm and send
              </button>
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="px-6 py-10 flex flex-col items-center justify-center gap-3 text-gray-700">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <p className="text-sm">Sending notifications…</p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-3 text-sm text-green-900">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{result.message}</p>
                <ul className="mt-2 space-y-1 text-green-800">
                  <li>Recipients targeted: {result.requestedCount}</li>
                  <li>Delivered (FCM success): {result.successCount}</li>
                  <li>Failed: {result.failureCount}</li>
                  <li>Invalid tokens cleared: {result.invalidTokensRemoved}</li>
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
