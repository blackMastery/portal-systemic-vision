'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, AlertCircle, Loader2 } from 'lucide-react'
import { getAgreementAcceptanceDownloadUrl, listAgreementAcceptances } from './agreement-actions'
import type { AgreementAcceptanceListRow } from './agreement-types'
import type { AgreementAudience } from '@/types/database'

type Props = {
  title?: string
  description?: string
  initialAudience?: AgreementAudience | 'all'
  initialUserId?: string
}

export function AgreementAcceptancesLog({
  title = 'Acceptance log',
  description = 'Each acceptance stores timestamp, IP, user agent, device (from the app), content hash, and a generated PDF in storage. Filter by role, name/phone, or date.',
  initialAudience = 'all',
  initialUserId,
}: Props) {
  const [logAudience, setLogAudience] = useState<AgreementAudience | 'all'>(initialAudience)
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

  const loadLog = useCallback(
    async (page: number) => {
      setLogError(null)
      setLogLoading(true)
      const res = await listAgreementAcceptances({
        audience: logAudience,
        search: appliedSearch || undefined,
        userId: initialUserId || undefined,
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
    [logAudience, appliedSearch, appliedFrom, appliedTo, initialUserId]
  )

  useEffect(() => {
    void loadLog(logPage)
  }, [loadLog, logPage])

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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-md font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
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
  )
}
