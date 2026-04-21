'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
  List,
  LayoutGrid,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Database } from '@/types/database'

const PAGE_SIZE = 50
const AUDITED_TABLES = [
  'users',
  'rider_profiles',
  'driver_profiles',
  'vehicles',
  'trips',
  'trip_requests',
  'subscriptions',
  'payment_transactions',
  'notifications',
  'verification_logs',
] as const

type AuditLogRow = Database['public']['Tables']['audit_logs']['Row']

async function fetchAuditLogs(filters: {
  tableName: string
  action: string
  dateFrom: string
  dateTo: string
  page: number
}) {
  const supabase = createClient()
  const from = filters.page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .range(from, to)

  if (filters.tableName !== 'all') {
    query = query.eq('table_name', filters.tableName)
  }
  if (filters.action !== 'all') {
    query = query.eq('action', filters.action)
  }
  if (filters.dateFrom) {
    query = query.gte('changed_at', `${filters.dateFrom}T00:00:00.000Z`)
  }
  if (filters.dateTo) {
    query = query.lte('changed_at', `${filters.dateTo}T23:59:59.999Z`)
  }

  const { data, error, count } = await query

  if (error) throw error
  return { rows: (data ?? []) as AuditLogRow[], total: count ?? 0 }
}

type UserActor = Pick<Database['public']['Tables']['users']['Row'], 'auth_id' | 'full_name'>

async function fetchActors(actorIds: string[]) {
  if (actorIds.length === 0) return new Map<string, string>()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('auth_id, full_name')
    .in('auth_id', actorIds)
  if (error) return new Map<string, string>()
  const map = new Map<string, string>()
  const rows = (data ?? []) as UserActor[]
  rows.forEach((u) => {
    if (u.auth_id) map.set(u.auth_id, u.full_name ?? 'Unknown')
  })
  return map
}

const actionColors = {
  INSERT: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
}

export default function AuditLogPage() {
  const [tableName, setTableName] = useState('all')
  const [action, setAction] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedEntry, setSelectedEntry] = useState<AuditLogRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', tableName, action, dateFrom, dateTo, page],
    queryFn: () =>
      fetchAuditLogs({ tableName, action, dateFrom, dateTo, page }),
  })

  const actorIds = Array.from(
    new Set((data?.rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[])
  )
  const { data: actorMap } = useQuery({
    queryKey: ['audit-actors', [...actorIds].sort().join(',')],
    queryFn: () => fetchActors(actorIds),
    enabled: actorIds.length > 0,
  })
  const actors = actorMap ?? new Map<string, string>()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const from = page * PAGE_SIZE
  const to = Math.min(from + PAGE_SIZE, total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track all changes to the database across tables
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Table</label>
            <select
              value={tableName}
              onChange={(e) => {
                setTableName(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">All tables</option>
              {AUDITED_TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">All</option>
              <option value="INSERT">Insert</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {rows.length} entry{rows.length === 1 ? '' : 'ies'} on this page
        </p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : rows.length > 0 ? (
          <>
            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedEntry(row)}
                    className="text-left border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionColors[row.action]}`}
                      >
                        {row.action}
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(row.changed_at), 'MMM d')}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-semibold text-gray-900">{row.table_name}</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{row.record_id}</p>
                      <p className="text-xs text-gray-600">
                        {row.actor_id ? actors.get(row.actor_id) ?? row.actor_id : 'System'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(row.changed_at), 'MMM d, yyyy h:mm:ss a')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Table
                      </th>
                      <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Record ID
                      </th>
                      <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedEntry(row)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(row.changed_at), 'MMM d, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.table_name}
                        </td>
                        <td
                          className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600 font-mono truncate max-w-[8rem] md:max-w-[12rem]"
                          title={row.record_id}
                        >
                          {row.record_id}
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionColors[row.action]}`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                          {row.actor_id ? (
                            <span className="inline-flex items-center">
                              <User className="h-4 w-4 mr-1 text-gray-400" />
                              {actors.get(row.actor_id) ?? row.actor_id}
                            </span>
                          ) : (
                            <span className="text-gray-400">System</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-4 md:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  Showing {from + 1}–{to} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No audit entries match your filters</p>
          </div>
        )}
      </div>

      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Audit entry details"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Audit Entry Details</h2>
                <p className="text-xs text-gray-500 mt-1">Entry ID: {selectedEntry.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close details dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Action</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{selectedEntry.action}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Table</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{selectedEntry.table_name}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Record ID</p>
                  <p className="mt-2 text-sm text-gray-900 font-mono break-all">{selectedEntry.record_id}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Changed At</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {format(new Date(selectedEntry.changed_at), 'MMM d, yyyy h:mm:ss a')}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Actor</p>
                <p className="mt-2 text-sm text-gray-900">
                  {selectedEntry.actor_id ? actors.get(selectedEntry.actor_id) ?? selectedEntry.actor_id : 'System'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Actor ID: {selectedEntry.actor_id ?? 'N/A'}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">Previous (old_data)</p>
                  <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto text-xs max-h-80 overflow-y-auto">
                    {selectedEntry.old_data != null
                      ? JSON.stringify(selectedEntry.old_data, null, 2)
                      : 'No previous payload'}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">Current (new_data)</p>
                  <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto text-xs max-h-80 overflow-y-auto">
                    {selectedEntry.new_data != null
                      ? JSON.stringify(selectedEntry.new_data, null, 2)
                      : 'No current payload'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
