'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getAgreementAcceptanceDownloadUrl,
  getAgreementVersions,
  listAgreementAcceptances,
  publishOrSaveAgreement,
  setAgreementVersionPublishedState,
} from './agreement-actions'
import type { AgreementAcceptanceListRow, AgreementVersionRow } from './agreement-types'
import type { AgreementAudience } from '@/types/database'
import { FileText, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react'

const AUDIENCES: { id: AgreementAudience; label: string }[] = [
  { id: 'driver', label: 'Driver' },
  { id: 'rider', label: 'Rider' },
]

function versionBadge(v: AgreementVersionRow) {
  if (v.published_at) {
    return (
      <span className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-0.5">
        Published
      </span>
    )
  }
  return (
    <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-0.5">
      Draft
    </span>
  )
}

function hashPrefix(h: string | null) {
  if (!h) {
    return '—'
  }
  return `${h.slice(0, 12)}…`
}

export function AgreementSettingsSection() {
  const [driverVersions, setDriverVersions] = useState<AgreementVersionRow[] | null>(null)
  const [riderVersions, setRiderVersions] = useState<AgreementVersionRow[] | null>(null)
  const [vErr, setVErr] = useState<string | null>(null)
  const [vLoading, setVLoading] = useState(true)

  const [formDriver, setFormDriver] = useState({ version_label: '', title: '', body: '' })
  const [formRider, setFormRider] = useState({ version_label: '', title: '', body: '' })
  const [saving, setSaving] = useState<AgreementAudience | null>(null)
  const [togglingVersionId, setTogglingVersionId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [logAudience, setLogAudience] = useState<AgreementAudience | 'all'>('all')
  const [logSearch, setLogSearch] = useState('')
  const [logFrom, setLogFrom] = useState('')
  const [logTo, setLogTo] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')
  const [logPage, setLogPage] = useState(0)
  const [logRows, setLogRows] = useState<AgreementAcceptanceListRow[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logLoading, setLogLoading] = useState(true)
  const [logError, setLogError] = useState<string | null>(null)
  const [downloadErr, setDownloadErr] = useState<string | null>(null)

  const pageSize = 20

  const loadVersions = useCallback(async () => {
    setVErr(null)
    setVLoading(true)
    const [d, r] = await Promise.all([getAgreementVersions('driver'), getAgreementVersions('rider')])
    if (!d.ok) {
      setVErr(d.error)
      setDriverVersions(null)
    } else {
      setDriverVersions(d.versions)
    }
    if (!r.ok) {
      setVErr(r.error)
      setRiderVersions(null)
    } else {
      setRiderVersions(r.versions)
    }
    setVLoading(false)
  }, [])

  const loadLog = useCallback(
    async (page: number) => {
      setLogError(null)
      setLogLoading(true)
      const res = await listAgreementAcceptances({
        audience: logAudience,
        search: appliedSearch || undefined,
        fromDate: appliedFrom || undefined,
        toDate: appliedTo || undefined,
        page,
        pageSize,
      })
      if (!res.ok) {
        setLogError(res.error)
        setLogRows([])
        setLogTotal(0)
      } else {
        setLogRows(res.rows)
        setLogTotal(res.total)
      }
      setLogLoading(false)
    },
    [logAudience, appliedSearch, appliedFrom, appliedTo]
  )

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  useEffect(() => {
    void loadLog(logPage)
  }, [loadLog, logPage])

  async function onPublish(
    audience: AgreementAudience,
    asDraft: boolean
  ) {
    const f = audience === 'driver' ? formDriver : formRider
    setSaveMsg(null)
    setSaving(audience)
    const res = await publishOrSaveAgreement({
      audience,
      version_label: f.version_label,
      title: f.title,
      body: f.body,
      asDraft,
    })
    setSaving(null)
    if (!res.ok) {
      setSaveMsg({ kind: 'err', text: res.error })
      return
    }
    setSaveMsg({
      kind: 'ok',
      text: asDraft
        ? 'Draft saved. Publish a new version label when the legal text is final.'
        : 'Version published. Users will be prompted to accept on next app open.',
    })
    if (audience === 'driver') {
      setFormDriver({ version_label: '', title: '', body: '' })
    } else {
      setFormRider({ version_label: '', title: '', body: '' })
    }
    void loadVersions()
  }

  async function onToggleVersionPublished(
    versionId: string,
    nextPublished: boolean
  ) {
    setSaveMsg(null)
    setTogglingVersionId(versionId)
    const res = await setAgreementVersionPublishedState(versionId, nextPublished)
    setTogglingVersionId(null)
    if (!res.ok) {
      setSaveMsg({ kind: 'err', text: res.error })
      return
    }
    setSaveMsg({
      kind: 'ok',
      text: nextPublished
        ? 'Version is now live. Users will be prompted to accept on next app open if it is the latest published.'
        : 'Version unpublished. It is a draft again and no longer offered as current (unless you publish it again).',
    })
    void loadVersions()
  }

  async function onDownloadPdf(acceptanceId: string) {
    setDownloadErr(null)
    const res = await getAgreementAcceptanceDownloadUrl(acceptanceId)
    if (!res.ok) {
      setDownloadErr(res.error)
      return
    }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  const logPages = Math.max(1, Math.ceil(logTotal / pageSize))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">User agreements</h2>
        <p className="text-sm text-gray-600 mt-1">
          Publish and version the driver platform agreement and rider terms. The table has actions
          to publish a draft or unpublish a live version; the app always uses the latest published
          version for that role. New content can be added below as draft or published in one step.
        </p>
      </div>

      {vLoading && (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agreement versions…
        </div>
      )}

      {vErr && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{vErr}</span>
        </div>
      )}

      {saveMsg && (
        <div
          className={
            saveMsg.kind === 'ok'
              ? 'flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-900'
              : 'flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-800'
          }
        >
          {saveMsg.kind === 'ok' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <span>{saveMsg.text}</span>
        </div>
      )}

      {!vLoading && driverVersions && riderVersions && (
        <div className="space-y-8">
          {AUDIENCES.map(({ id: aud, label }) => {
            const vers = aud === 'driver' ? driverVersions : riderVersions
            const form = aud === 'driver' ? formDriver : formRider
            const setForm = aud === 'driver' ? setFormDriver : setFormRider
            return (
              <div
                key={aud}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4"
              >
                <h3 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  {label} agreement
                </h3>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="max-h-48 overflow-y-auto text-xs text-gray-600">
                    {vers.length === 0 ? (
                      <p className="p-3">No versions yet.</p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium">Version</th>
                            <th className="px-3 py-2 font-medium">Title</th>
                            <th className="px-3 py-2 font-medium">Hash (prefix)</th>
                            <th className="px-3 py-2 font-medium">State</th>
                            <th className="px-3 py-2 font-medium">Published / created</th>
                            <th className="px-3 py-2 font-medium w-[1%]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vers.map((v) => (
                            <tr key={v.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-mono">{v.version_label}</td>
                              <td className="px-3 py-2 max-w-xs truncate">{v.title}</td>
                              <td className="px-3 py-2 font-mono text-gray-500">
                                {hashPrefix(v.content_sha256)}
                              </td>
                              <td className="px-3 py-2">{versionBadge(v)}</td>
                              <td className="px-3 py-2 text-gray-500">
                                {v.published_at
                                  ? new Date(v.published_at).toLocaleString()
                                  : '—'}{' '}
                                / {new Date(v.created_at).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {v.published_at ? (
                                  <button
                                    type="button"
                                    disabled={togglingVersionId === v.id}
                                    onClick={() => void onToggleVersionPublished(v.id, false)}
                                    className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-50"
                                    title="Remove from the app as a published offer; becomes a draft again"
                                  >
                                    {togglingVersionId === v.id ? (
                                      <Loader2 className="h-3.5 w-3.5 inline animate-spin" />
                                    ) : (
                                      'Unpublish'
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={togglingVersionId === v.id}
                                    onClick={() => void onToggleVersionPublished(v.id, true)}
                                    className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-100 disabled:opacity-50"
                                    title="Set live with current body text; hash is recomputed"
                                  >
                                    {togglingVersionId === v.id ? (
                                      <Loader2 className="h-3.5 w-3.5 inline animate-spin" />
                                    ) : (
                                      'Publish'
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                <div className="grid gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Version label
                    </label>
                    <input
                      type="text"
                      value={form.version_label}
                      onChange={(e) => setForm((f) => ({ ...f, version_label: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="e.g. v1.0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Short title shown in admin and PDF"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Agreement text
                    </label>
                    <textarea
                      value={form.body}
                      onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                      className="w-full min-h-[160px] rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                      placeholder="Full agreement body (scrollable in the mobile app)…"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving === aud}
                    onClick={() => void onPublish(aud, true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving === aud && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save as draft
                  </button>
                  <button
                    type="button"
                    disabled={saving === aud}
                    onClick={() => void onPublish(aud, false)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === aud && <Loader2 className="h-4 w-4 animate-spin" />}
                    Publish
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-md font-semibold text-gray-900">Acceptance log</h3>
        <p className="text-sm text-gray-600">
          Each acceptance stores timestamp, IP, user agent, device (from the app), content hash, and
          a generated PDF in storage. Filter by role, name/phone, or date.
        </p>
        {downloadErr && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {downloadErr}
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={logAudience}
              onChange={(e) => {
                setLogAudience(e.target.value as AgreementAudience | 'all')
                setLogPage(0)
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="driver">Driver</option>
              <option value="rider">Rider</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Search name / phone</label>
            <input
              type="search"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAppliedSearch(logSearch)
                  setAppliedFrom(logFrom)
                  setAppliedTo(logTo)
                  setLogPage(0)
                }
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-48"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={logFrom}
              onChange={(e) => setLogFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={logTo}
              onChange={(e) => setLogTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setAppliedSearch(logSearch)
              setAppliedFrom(logFrom)
              setAppliedTo(logTo)
              setLogPage(0)
            }}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-200"
          >
            Apply filters
          </button>
        </div>

        {logLoading ? (
          <div className="flex items-center gap-2 text-gray-600 text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : logError ? (
          <p className="text-sm text-red-600">{logError}</p>
        ) : (
          <>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm text-left min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Accepted</th>
                    <th className="px-3 py-2">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                        No acceptances found.
                      </td>
                    </tr>
                  ) : (
                    logRows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          {r.full_name}
                          <span className="block text-xs text-gray-400 font-mono">{r.user_id}</span>
                        </td>
                        <td className="px-3 py-2 font-mono">{r.phone_number}</td>
                        <td className="px-3 py-2">{r.audience}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono">{r.version_label}</span>
                          <span className="block text-xs text-gray-500 truncate max-w-[180px]">
                            {r.version_title}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {new Date(r.accepted_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          {r.pdf_storage_path ? (
                            <button
                              type="button"
                              onClick={() => void onDownloadPdf(r.id)}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {logTotal > 0 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Page {logPage + 1} of {logPages} ({logTotal} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={logPage === 0}
                    onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={logPage >= logPages - 1}
                    onClick={() => setLogPage((p) => p + 1)}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
