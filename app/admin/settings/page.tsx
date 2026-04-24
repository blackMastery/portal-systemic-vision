'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Settings, CheckCircle2, AlertCircle, Ban, Play } from 'lucide-react'
import {
  getAppVersionConfig,
  getTripRequestsConfig,
  setTripRequestsEnabled,
  updateAppVersionConfig,
} from './actions'
import { AgreementSettingsSection } from './agreement-section'
import { APP_VERSION_UI_ROWS } from './constants'
import type { AppVersionConfigInput } from './types'
import type { AppVersionAppType, AppVersionPlatform } from '@/types/database'

type FormRow = AppVersionConfigInput & { label: string }

function rowsToFormState(
  loaded: {
    app_type: AppVersionAppType
    platform: AppVersionPlatform
    version_string: string
    build_number: number
    mandatory_update?: boolean
  }[]
): FormRow[] {
  return APP_VERSION_UI_ROWS.map((meta) => {
    const match = loaded.find(
      (r) => r.app_type === meta.app_type && r.platform === meta.platform
    )
    return {
      app_type: meta.app_type,
      platform: meta.platform,
      label: meta.label,
      version_string: match?.version_string ?? '',
      build_number: match != null ? String(match.build_number) : '',
      mandatory_update: match?.mandatory_update ?? false,
    }
  })
}

export default function AdminSettingsPage() {
  const [rows, setRows] = useState<FormRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tripEnabled, setTripEnabled] = useState<boolean | null>(null)
  const [tripError, setTripError] = useState<string | null>(null)
  const [tripSaving, setTripSaving] = useState(false)
  const [tripSaveOk, setTripSaveOk] = useState(false)
  const [tripSaveError, setTripSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setTripError(null)
    setTripSaveOk(false)
    const [res, tripRes] = await Promise.all([
      getAppVersionConfig(),
      getTripRequestsConfig(),
    ])
    if (!tripRes.ok) {
      setTripError(tripRes.error)
      setTripEnabled(true)
    } else {
      setTripEnabled(tripRes.enabled)
    }
    if (!res.ok) {
      setLoadError(res.error)
      setRows(null)
      setLoading(false)
      return
    }
    if (res.rows.length !== APP_VERSION_UI_ROWS.length) {
      setLoadError(
        `Expected ${APP_VERSION_UI_ROWS.length} app version rows in the database; found ${res.rows.length}. Run migrations 005_app_version_config.sql and 006_app_version_config_mandatory_update.sql.`
      )
      setRows(rowsToFormState(res.rows))
      setLoading(false)
      return
    }
    setRows(rowsToFormState(res.rows))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateRow(
    app_type: AppVersionAppType,
    platform: AppVersionPlatform,
    field: 'version_string' | 'build_number',
    value: string
  ) {
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.app_type === app_type && r.platform === platform ? { ...r, [field]: value } : r
          )
        : prev
    )
    setSaveOk(false)
  }

  function updateMandatory(
    app_type: AppVersionAppType,
    platform: AppVersionPlatform,
    mandatory_update: boolean
  ) {
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.app_type === app_type && r.platform === platform ? { ...r, mandatory_update } : r
          )
        : prev
    )
    setSaveOk(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rows) return
    setSaveError(null)
    setSaveOk(false)
    setSaving(true)
    try {
      const payload: AppVersionConfigInput[] = rows.map(
        ({ app_type, platform, version_string, build_number, mandatory_update }) => ({
          app_type,
          platform,
          version_string,
          build_number,
          mandatory_update,
        })
      )
      const res = await updateAppVersionConfig(payload)
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      setSaveOk(true)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTripToggle(nextEnabled: boolean) {
    setTripSaveError(null)
    setTripSaveOk(false)
    setTripSaving(true)
    try {
      const res = await setTripRequestsEnabled(nextEnabled)
      if (!res.ok) {
        setTripSaveError(res.error)
        return
      }
      setTripEnabled(nextEnabled)
      setTripSaveOk(true)
    } catch (err) {
      setTripSaveError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setTripSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-gray-600 mb-1">
          <Settings className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">System</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          System-wide options and published mobile app versions. Riders create trip requests with{' '}
          <code className="text-sm bg-gray-100 px-1 rounded">POST /api/trip-requests</code>; you can
          pause new requests here without deploying. App versions: mobile clients call{' '}
          <code className="text-sm bg-gray-100 px-1 rounded">GET /api/app/version</code> to compare
          against the published build. Turn on <strong>mandatory update</strong> to return{' '}
          <code className="text-sm bg-gray-100 px-1 rounded">update_required: true</code> when the
          client is behind the published version/build.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-600 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading settings…
        </div>
      )}

      {!loading && (
        <>
          <AgreementSettingsSection />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Trip requests</h2>
              <p className="text-sm text-gray-600 mt-1">
                When stopped, the API returns <code className="text-sm bg-gray-100 px-1 rounded">403</code>{' '}
                with code <code className="text-sm bg-gray-100 px-1 rounded">TRIP_REQUESTS_DISABLED</code>{' '}
                for <code className="text-sm bg-gray-100 px-1 rounded">POST /api/trip-requests</code>. Existing
                trips are not cancelled.
              </p>
            </div>
            {tripError && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{tripError} Showing assumed state: accepting requests.</span>
              </div>
            )}
            {tripSaveError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{tripSaveError}</span>
              </div>
            )}
            {tripSaveOk && (
              <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <span>Trip request setting updated.</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {tripEnabled ? (
                <button
                  type="button"
                  disabled={tripSaving || tripEnabled === null}
                  onClick={() => void handleTripToggle(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {tripSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  Stop accepting requests
                </button>
              ) : (
                <button
                  type="button"
                  disabled={tripSaving || tripEnabled === null}
                  onClick={() => void handleTripToggle(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {tripSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Resume accepting requests
                </button>
              )}
              <span className="text-sm text-gray-600">
                Status:{' '}
                {tripEnabled === null ? (
                  '…'
                ) : tripEnabled ? (
                  <span className="font-medium text-emerald-800">Accepting new requests</span>
                ) : (
                  <span className="font-medium text-red-800">Not accepting new requests</span>
                )}
              </span>
            </div>
          </div>

          {loadError && !rows && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {rows && (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6"
            >
              <h2 className="text-lg font-semibold text-gray-900">App versions</h2>
              {loadError && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{loadError}</span>
                </div>
              )}

              <div className="space-y-6">
                {rows.map((row) => (
                  <div
                    key={`${row.app_type}-${row.platform}`}
                    className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50/50"
                  >
                    <h2 className="text-sm font-semibold text-gray-900">{row.label}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Version string
                        </label>
                        <input
                          type="text"
                          required
                          value={row.version_string}
                          onChange={(e) =>
                            updateRow(row.app_type, row.platform, 'version_string', e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                          placeholder="e.g. 1.0.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Build number
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          pattern="\d+"
                          value={row.build_number}
                          onChange={(e) =>
                            updateRow(row.app_type, row.platform, 'build_number', e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                          placeholder="e.g. 37"
                        />
                      </div>
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={row.mandatory_update}
                        onChange={(e) =>
                          updateMandatory(row.app_type, row.platform, e.target.checked)
                        }
                        className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">Mandatory update</span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          Outdated clients receive <code className="bg-gray-100 px-1 rounded">update_required: true</code>{' '}
                          from the version API (block or hard gate in the app).
                        </span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>

              {saveError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveOk && (
                <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>Saved. Mobile apps will see the new values on the next version check.</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving || !!loadError}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Settings className="h-4 w-4" />
                      Save app versions
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
          )}
        </>
      )}
    </div>
  )
}
