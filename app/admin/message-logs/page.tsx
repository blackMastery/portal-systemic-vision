'use client'

import { useState, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'

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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : logs && logs.length > 0 ? (
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
                  <tr key={log.id} className="hover:bg-gray-50">
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
        ) : (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No message logs found</p>
          </div>
        )}
      </div>
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
