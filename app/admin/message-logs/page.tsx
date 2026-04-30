'use client'

import { useState, useEffect, Suspense } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, MessageSquare, List, LayoutGrid, X, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { resendMessageLog } from './actions'

type MessageLog = {
  id: string
  channel: 'sms' | 'push'
  recipient_user_id: string | null
  recipient_phone: string | null
  title: string | null
  message: string
  status: 'sent' | 'failed'
  sent_by_user_id: string | null
  external_id: string | null
  notification_type: string | null
  audience: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  recipient: { full_name: string | null; phone_number: string | null } | null
  sent_by: { full_name: string | null } | null
}

async function fetchMessageLogs(filters: {
  channel: string
  status: string
  dateRange: string
  searchQuery: string
}) {
  const supabase = createClient()

  let query = supabase
    .from('message_logs')
    .select(`
      *,
      recipient:recipient_user_id (full_name, phone_number),
      sent_by:sent_by_user_id (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.channel !== 'all') {
    query = query.eq('channel', filters.channel)
  }

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.dateRange !== 'all') {
    const now = new Date()
    if (filters.dateRange === 'today') {
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      query = query.gte('created_at', startOfDay.toISOString())
    } else if (filters.dateRange === '7d') {
      const cutoff = new Date(now)
      cutoff.setDate(now.getDate() - 7)
      query = query.gte('created_at', cutoff.toISOString())
    } else if (filters.dateRange === '30d') {
      const cutoff = new Date(now)
      cutoff.setDate(now.getDate() - 30)
      query = query.gte('created_at', cutoff.toISOString())
    }
  }

  const { data, error } = await query
  if (error) throw error

  let results = data as MessageLog[]

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase()
    results = results.filter(
      (log) =>
        log.recipient?.full_name?.toLowerCase().includes(q) ||
        log.recipient_phone?.includes(q) ||
        log.message.toLowerCase().includes(q) ||
        log.title?.toLowerCase().includes(q) ||
        log.sent_by?.full_name?.toLowerCase().includes(q)
    )
  }

  return results
}

function MessageLogsContent() {
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null)
  const [resendFeedback, setResendFeedback] = useState<
    { type: 'success' | 'error'; text: string } | null
  >(null)

  const queryClient = useQueryClient()

  const resendMutation = useMutation({
    // Wrap so React Query never forwards extra args (e.g. meta/signal) into the Server Action —
    // Next.js only accepts serializable plain arguments.
    mutationFn: (messageLogId: string) => resendMessageLog(messageLogId),
    onSuccess: (data) => {
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ['message_logs'] })
        setResendFeedback({ type: 'success', text: 'Message resent successfully.' })
      } else {
        setResendFeedback({ type: 'error', text: data.error })
      }
    },
    onError: (err: Error) => {
      setResendFeedback({ type: 'error', text: err.message || 'Resend failed.' })
    },
  })

  useEffect(() => {
    setResendFeedback(null)
  }, [selectedLog?.id])

  const { data: logs, isLoading } = useQuery({
    queryKey: ['message_logs', channel, status, dateRange, searchQuery],
    queryFn: () => fetchMessageLogs({ channel, status, dateRange, searchQuery }),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Message Logs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Audit log of all outbound SMS and push notifications
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search recipient, message, or sender..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Channel */}
          <div>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Channels</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="md:col-span-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Stats */}
          {logs && (
            <div className="md:col-span-2 flex items-center gap-4 text-sm text-gray-500">
              <span>{logs.length} result{logs.length !== 1 ? 's' : ''}</span>
              <span className="text-green-600 font-medium">
                {logs.filter((l) => l.status === 'sent').length} sent
              </span>
              <span className="text-red-600 font-medium">
                {logs.filter((l) => l.status === 'failed').length} failed
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{logs?.length ?? 0} logs</p>
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

      {/* Logs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : logs && logs.length > 0 ? (
          viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
              {logs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="text-left border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.channel === 'sms' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {log.channel.toUpperCase()}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{format(new Date(log.created_at), 'MMM d')}</span>
                  </div>

                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      {log.recipient?.full_name ?? (log.audience ? `All ${log.audience}s` : 'Unknown recipient')}
                    </p>
                    <p className="text-xs text-gray-500">{log.recipient_phone ?? log.recipient?.phone_number ?? 'No phone'}</p>
                    {log.title && <p className="text-sm text-gray-700 line-clamp-1">{log.title}</p>}
                    <p className="text-sm text-gray-500 line-clamp-2">{log.message}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Channel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Message
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      {/* Channel */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.channel === 'sms'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {log.channel.toUpperCase()}
                          </span>
                          {log.audience && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                              {log.audience} broadcast
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Recipient */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          {log.recipient?.full_name ? (
                            <div className="font-medium text-gray-900">{log.recipient.full_name}</div>
                          ) : log.audience ? (
                            <div className="text-gray-500 italic">All {log.audience}s</div>
                          ) : null}
                          {(log.recipient_phone || log.recipient?.phone_number) && (
                            <div className="text-gray-500">
                              {log.recipient_phone ?? log.recipient?.phone_number}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Message */}
                      <td className="px-6 py-4 max-w-xs">
                        {log.title && (
                          <div className="text-sm font-medium text-gray-900 truncate">{log.title}</div>
                        )}
                        <div className="text-sm text-gray-500 truncate max-w-[280px]">
                          {log.message.length > 80 ? log.message.slice(0, 80) + '…' : log.message}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.status === 'sent'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status}
                        </span>
                        {log.metadata && log.channel === 'push' && (
                          <div className="text-xs text-gray-400 mt-1">
                            {(log.metadata.success_count as number) ?? 0}/
                            {(log.metadata.requested_count as number) ??
                              ((log.metadata.success_count as number) ?? 0) +
                                ((log.metadata.failure_count as number) ?? 0)}{' '}
                            delivered
                          </div>
                        )}
                      </td>

                      {/* Sent By */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.sent_by?.full_name ?? '—'}
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(log.created_at), 'MMM d, yyyy')}
                        <div className="text-xs text-gray-400">
                          {format(new Date(log.created_at), 'h:mm a')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No message logs found</p>
          </div>
        )}
      </div>

      {selectedLog && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Message log details"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Message Log Details</h2>
                <p className="text-xs text-gray-500 mt-1">Log ID: {selectedLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close details dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Channel</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{selectedLog.channel.toUpperCase()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{selectedLog.status}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Date Sent</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {format(new Date(selectedLog.created_at), 'MMM d, yyyy h:mm:ss a')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Recipient</h3>
                  <div className="rounded-lg border border-gray-200 p-3 space-y-1 text-sm text-gray-700">
                    <p>{selectedLog.recipient?.full_name ?? (selectedLog.audience ? `All ${selectedLog.audience}s` : 'Unknown')}</p>
                    <p>{selectedLog.recipient_phone ?? selectedLog.recipient?.phone_number ?? 'No phone number'}</p>
                    <p className="text-xs text-gray-500">Recipient user ID: {selectedLog.recipient_user_id ?? 'N/A'}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900">Sender</h3>
                  <div className="rounded-lg border border-gray-200 p-3 space-y-1 text-sm text-gray-700">
                    <p>{selectedLog.sent_by?.full_name ?? 'Unknown sender'}</p>
                    <p className="text-xs text-gray-500">Sender user ID: {selectedLog.sent_by_user_id ?? 'N/A'}</p>
                    <p className="text-xs text-gray-500">Notification type: {selectedLog.notification_type ?? 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Content</h3>
                <div className="rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Title</p>
                  <p className="text-gray-900">{selectedLog.title ?? 'N/A'}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide pt-2">Message</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedLog.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">External ID</p>
                  <p className="mt-2 text-sm text-gray-800 break-all">{selectedLog.external_id ?? 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Audience</p>
                  <p className="mt-2 text-sm text-gray-800">{selectedLog.audience ?? 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Metadata</h3>
                <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto text-xs max-h-64 overflow-y-auto">
                  {selectedLog.metadata ? JSON.stringify(selectedLog.metadata, null, 2) : 'No metadata'}
                </pre>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50/80">
              {resendFeedback && (
                <p
                  className={`text-sm ${
                    resendFeedback.type === 'success' ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {resendFeedback.text}
                </p>
              )}
              <div className="flex justify-end gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => selectedLog && resendMutation.mutate(selectedLog.id)}
                  disabled={resendMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <RefreshCw
                    className={`h-4 w-4 shrink-0 ${resendMutation.isPending ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                  Resend message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MessageLogsPage() {
  return (
    <Suspense>
      <MessageLogsContent />
    </Suspense>
  )
}
