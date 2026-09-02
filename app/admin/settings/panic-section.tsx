'use client'

import { useCallback, useEffect, useState } from 'react'
import { Siren, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Send } from 'lucide-react'
import { getPanicSettings, setPanicSettings, sendPanicTestSms } from './actions'
import type { PanicSettings } from './types'

type Draft = {
  enabled: boolean
  numbers: string[]
  display: string
  testMode: boolean
  testNumber: string
}

function toDraft(s: PanicSettings): Draft {
  return {
    enabled: s.enabled,
    numbers: s.numbers.length > 0 ? [...s.numbers] : [''],
    display: s.display,
    testMode: s.testMode,
    testNumber: s.testNumber ?? '',
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-ring focus:ring-1 focus:ring-ring text-sm'

export function PanicSettingsSection() {
  const [settings, setSettings] = useState<PanicSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [testSending, setTestSending] = useState(false)
  const [testMsg, setTestMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getPanicSettings()
    if (!res.ok) {
      setLoadError(res.error)
      setSettings(null)
      setDraft(null)
    } else {
      setSettings(res.settings)
      setDraft(toDraft(res.settings))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
    setSaveMsg(null)
  }

  function updateNumber(idx: number, value: string) {
    setDraft((prev) =>
      prev ? { ...prev, numbers: prev.numbers.map((n, i) => (i === idx ? value : n)) } : prev
    )
    setSaveMsg(null)
  }

  function removeNumber(idx: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = prev.numbers.filter((_, i) => i !== idx)
      return { ...prev, numbers: next.length > 0 ? next : [''] }
    })
    setSaveMsg(null)
  }

  function addNumber() {
    setDraft((prev) => (prev ? { ...prev, numbers: [...prev.numbers, ''] } : prev))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await setPanicSettings({
        enabled: draft.enabled,
        numbers: draft.numbers.map((n) => n.trim()).filter(Boolean),
        display: draft.display,
        testMode: draft.testMode,
        testNumber: draft.testNumber.trim() || null,
      })
      if (!res.ok) {
        setSaveMsg({ kind: 'err', text: res.error })
        return
      }
      setSettings(res.settings)
      setDraft(toDraft(res.settings))
      setSaveMsg({ kind: 'ok', text: 'Panic button settings saved.' })
    } catch (err) {
      setSaveMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTest() {
    setTestSending(true)
    setTestMsg(null)
    try {
      const res = await sendPanicTestSms()
      if (!res.ok) {
        setTestMsg({ kind: 'err', text: res.error })
        return
      }
      setTestMsg({ kind: 'ok', text: `Test SMS sent to ${res.to} (Twilio SID ${res.sid}). See Message Logs → Panic test.` })
    } catch (err) {
      setTestMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Sending failed.' })
    } finally {
      setTestSending(false)
    }
  }

  const testNumberDirty =
    draft != null && (draft.testNumber.trim() || null) !== (settings?.testNumber ?? null)

  return (
    <form
      onSubmit={handleSave}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Siren className="h-5 w-5 text-red-600" aria-hidden />
          Panic button
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Riders and drivers can hold the in-app panic button during a trip. It creates an escalated
          incident, SMSes the support numbers below (and the rider&apos;s emergency contact) and opens a
          live tracking link. Values here override the <code className="text-sm bg-gray-100 px-1 rounded">PANIC_*</code>{' '}
          environment variables.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading panic settings…
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {!loading && draft && settings && (
        <>
          {!settings.twilioConfigured && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>
                Twilio is not configured on the server. Alerts will still create incidents, but no SMS
                can be sent until <code className="bg-amber-100 px-1 rounded">TWILIO_ACCOUNT_SID</code>,{' '}
                <code className="bg-amber-100 px-1 rounded">TWILIO_AUTH_TOKEN</code> and{' '}
                <code className="bg-amber-100 px-1 rounded">TWILIO_FROM_NUMBER</code> are set.
              </span>
            </div>
          )}

          {/* Kill switch */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Panic button</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When disabled, <code className="bg-gray-100 px-1 rounded">POST /api/panic</code> returns{' '}
                  <code className="bg-gray-100 px-1 rounded">403 PANIC_DISABLED</code> and the apps hide the button.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => update('enabled', e.target.checked)}
                  className="rounded border-gray-300 text-primary-strong focus:ring-ring"
                />
                <span className={`text-sm font-medium ${draft.enabled ? 'text-emerald-800' : 'text-red-800'}`}>
                  {draft.enabled ? 'Enabled' : 'Disabled (kill switch on)'}
                </span>
              </label>
            </div>
          </div>

          {/* Support numbers */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Support numbers</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Every number receives the alert SMS (with trip, driver and tracking link). Accepts{' '}
                <code className="bg-gray-100 px-1 rounded">+592XXXXXXX</code> or 7 local digits.
              </p>
            </div>
            <div className="space-y-2">
              {draft.numbers.map((n, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="tel"
                    value={n}
                    onChange={(e) => updateNumber(idx, e.target.value)}
                    placeholder="+5926XXXXXX"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeNumber(idx)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remove number"
                    title="Remove number"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addNumber}
                disabled={draft.numbers.length >= 10}
                className="inline-flex items-center gap-1.5 text-sm text-primary-strong hover:text-primary-hover disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add number
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Display number (shown on the tracking page and in SMS)
              </label>
              <input
                type="text"
                value={draft.display}
                onChange={(e) => update('display', e.target.value)}
                placeholder="Defaults to the first support number"
                maxLength={40}
                className={inputClass}
              />
            </div>
          </div>

          {/* Test mode */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Test mode</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Redirects every alert and resolved SMS to the test number instead of support and emergency
                  contacts. Recipients are labelled &quot;test&quot; on the incident.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.testMode}
                  disabled={settings.envTestModeForced}
                  onChange={(e) => update('testMode', e.target.checked)}
                  className="rounded border-gray-300 text-primary-strong focus:ring-ring disabled:opacity-50"
                />
                <span className={`text-sm font-medium ${draft.testMode ? 'text-amber-800' : 'text-gray-700'}`}>
                  {draft.testMode ? 'Test mode on' : 'Off (live SMS)'}
                </span>
              </label>
            </div>
            {settings.envTestModeForced && (
              <p className="text-xs text-amber-800">
                <code className="bg-amber-100 px-1 rounded">PANIC_TEST_MODE=true</code> is set on the server, so
                test mode cannot be turned off from here.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Test number</label>
                <input
                  type="tel"
                  value={draft.testNumber}
                  onChange={(e) => update('testNumber', e.target.value)}
                  placeholder="+5926XXXXXX"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSendTest()}
                disabled={testSending || !settings.testNumber || testNumberDirty || !settings.twilioConfigured}
                title={
                  testNumberDirty
                    ? 'Save the test number first'
                    : !settings.testNumber
                      ? 'Add and save a test number first'
                      : 'Send a test SMS to the saved test number'
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-gray-900 disabled:opacity-50 disabled:pointer-events-none"
              >
                {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test SMS
              </button>
            </div>
            {testMsg && (
              <div
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
                  testMsg.kind === 'ok'
                    ? 'bg-green-50 border-green-100 text-green-900'
                    : 'bg-red-50 border-red-100 text-red-800'
                }`}
              >
                {testMsg.kind === 'ok' ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                )}
                <span>{testMsg.text}</span>
              </div>
            )}
          </div>

          {saveMsg && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
                saveMsg.kind === 'ok'
                  ? 'bg-green-50 border-green-100 text-green-900'
                  : 'bg-red-50 border-red-100 text-red-800'
              }`}
            >
              {saveMsg.kind === 'ok' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              )}
              <span>{saveMsg.text}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save panic settings'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={saving || loading}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </>
      )}
    </form>
  )
}
