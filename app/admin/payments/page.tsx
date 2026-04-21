'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Search, CreditCard, DollarSign, Clock, User, Calendar,
  CheckCircle, XCircle, AlertCircle, ExternalLink,
  LayoutGrid, LayoutList, X,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Database } from '@/types/database'

type Subscription = Database['public']['Tables']['subscriptions']['Row'] & {
  user: Database['public']['Tables']['users']['Row']
}

type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'] & {
  user: Database['public']['Tables']['users']['Row'] | null
  subscription: Database['public']['Tables']['subscriptions']['Row'] | null
}

async function fetchSubscriptions(filters: {
  status: string
  userRole: string
  planType: string
  searchQuery: string
  dateFrom: string
  dateTo: string
}) {
  const supabase = createClient()

  let query = supabase
    .from('subscriptions')
    .select(`*, user:user_id (full_name, phone_number, email, role)`)
    .order('created_at', { ascending: false })

  if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.userRole !== 'all') query = query.eq('user_role', filters.userRole)
  if (filters.planType !== 'all') query = query.eq('plan_type', filters.planType)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error

  let results = data as Subscription[]
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase()
    results = results.filter(s =>
      s.user?.full_name?.toLowerCase().includes(q) ||
      s.user?.phone_number?.includes(q) ||
      s.user?.email?.toLowerCase().includes(q)
    )
  }
  return results
}

async function fetchPaymentTransactions(filters: {
  status: string
  paymentMethod: string
  searchQuery: string
  dateFrom: string
  dateTo: string
}) {
  const supabase = createClient()

  let query = supabase
    .from('payment_transactions')
    .select(`*, user:user_id (full_name, phone_number, email, role), subscription:subscription_id (id, plan_type, status)`)
    .order('created_at', { ascending: false })

  if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.paymentMethod !== 'all') query = query.eq('payment_method', filters.paymentMethod)
  if (filters.dateFrom) query = query.gte('initiated_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('initiated_at', filters.dateTo + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error

  let results = data as PaymentTransaction[]
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase()
    results = results.filter(t =>
      t.user?.full_name?.toLowerCase().includes(q) ||
      t.user?.phone_number?.includes(q) ||
      t.mmg_transaction_id?.toLowerCase().includes(q)
    )
  }
  return results
}

const subscriptionStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const paymentStatusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
}

const roleColors: Record<string, string> = {
  rider: 'bg-green-100 text-green-800',
  driver: 'bg-blue-100 text-blue-800',
  admin: 'bg-purple-100 text-purple-800',
}

function calculateDaysRemaining(endDate: string): number {
  const end = new Date(endDate)
  const now = new Date()
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatCurrency(amount: number, currency: string = 'GYD'): string {
  return `${currency} ${amount.toFixed(2)}`
}

// ── View toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: 'table' | 'card'; onChange: (v: 'table' | 'card') => void }) {
  return (
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => onChange('table')}
        className={`p-2 ${view === 'table' ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
        title="Table view"
      >
        <LayoutList className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange('card')}
        className={`p-2 ${view === 'card' ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
        title="Card view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Subscription detail dialog ───────────────────────────────────────────────

function SubscriptionDialog({ subscription, onClose }: { subscription: Subscription; onClose: () => void }) {
  const daysRemaining = subscription.status === 'active' && subscription.end_date
    ? calculateDaysRemaining(subscription.end_date)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Subscription Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* User */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">User</p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{subscription.user?.full_name || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{subscription.user?.phone_number}</p>
                <p className="text-xs text-gray-500">{subscription.user?.email}</p>
              </div>
              {subscription.user_role && (
                <span className={`ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[subscription.user_role] || 'bg-gray-100 text-gray-800'}`}>
                  {subscription.user_role}
                </span>
              )}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Plan & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Plan</p>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                {subscription.plan_type}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${subscriptionStatusColors[subscription.status] || 'bg-gray-100 text-gray-800'}`}>
                {subscription.status}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Amount</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(subscription.amount, subscription.currency)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Days Remaining</p>
              {daysRemaining !== null ? (
                <p className={`text-sm font-semibold ${daysRemaining <= 7 ? 'text-red-600' : 'text-gray-900'}`}>
                  {daysRemaining} days
                </p>
              ) : (
                <p className="text-sm text-gray-400">N/A</p>
              )}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Start Date</p>
              <p className="text-sm text-gray-900">{format(new Date(subscription.start_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">End Date</p>
              <p className="text-sm text-gray-900">{format(new Date(subscription.end_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Created</p>
              <p className="text-sm text-gray-900">{format(new Date(subscription.created_at), 'MMM d, yyyy')}</p>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Payment */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Payment</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Method</p>
                <p className="text-sm text-gray-900">{subscription.payment_method || 'N/A'}</p>
              </div>
              {subscription.payment_reference && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Reference</p>
                  <p className="text-sm text-gray-900 break-all font-mono">{subscription.payment_reference}</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Subscription ID</p>
            <p className="text-xs text-gray-500 font-mono break-all">{subscription.id}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Transaction detail dialog ────────────────────────────────────────────────

function TransactionDialog({ transaction, onClose }: { transaction: PaymentTransaction; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Transaction Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* User */}
          {transaction.user && (
            <>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">User</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{transaction.user.full_name}</p>
                    <p className="text-xs text-gray-500">{transaction.user.phone_number}</p>
                    <p className="text-xs text-gray-500">{transaction.user.email}</p>
                  </div>
                  {transaction.user.role && (
                    <span className={`ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[transaction.user.role] || 'bg-gray-100 text-gray-800'}`}>
                      {transaction.user.role}
                    </span>
                  )}
                </div>
              </div>
              <hr className="border-gray-100" />
            </>
          )}

          {/* Subscription */}
          {transaction.subscription && (
            <>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Subscription</p>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">{transaction.subscription.plan_type}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${subscriptionStatusColors[transaction.subscription.status] || 'bg-gray-100 text-gray-800'}`}>
                    {transaction.subscription.status}
                  </span>
                </div>
              </div>
              <hr className="border-gray-100" />
            </>
          )}

          {/* Amount & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Amount</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(transaction.amount, transaction.currency)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${paymentStatusColors[transaction.status] || 'bg-gray-100 text-gray-800'}`}>
                {transaction.status}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Method</p>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                {transaction.payment_method}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">MMG Transaction ID</p>
              <p className="text-xs text-gray-900 font-mono">{transaction.mmg_transaction_id || 'N/A'}</p>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Timeline */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Timeline</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Initiated</p>
                <p className="text-sm text-gray-900">{format(new Date(transaction.initiated_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              {transaction.completed_at && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Completed</p>
                  <p className="text-sm text-green-700">{format(new Date(transaction.completed_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Gateway Response */}
          {transaction.gateway_response && (
            <>
              <hr className="border-gray-100" />
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Gateway Response</p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <pre className="text-xs overflow-x-auto text-gray-700">
                    {JSON.stringify(transaction.gateway_response, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}

          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Transaction ID</p>
            <p className="text-xs text-gray-500 font-mono break-all">{transaction.id}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'transactions'>('subscriptions')
  const [subscriptionView, setSubscriptionView] = useState<'table' | 'card'>('table')
  const [transactionView, setTransactionView] = useState<'table' | 'card'>('table')
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<PaymentTransaction | null>(null)

  // Subscriptions filters
  const [subscriptionStatus, setSubscriptionStatus] = useState('all')
  const [userRole, setUserRole] = useState('all')
  const [planType, setPlanType] = useState('all')
  const [subscriptionSearch, setSubscriptionSearch] = useState('')
  const [subscriptionDateFrom, setSubscriptionDateFrom] = useState('')
  const [subscriptionDateTo, setSubscriptionDateTo] = useState('')

  // Transactions filters
  const [transactionStatus, setTransactionStatus] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionDateFrom, setTransactionDateFrom] = useState('')
  const [transactionDateTo, setTransactionDateTo] = useState('')

  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions', subscriptionStatus, userRole, planType, subscriptionSearch, subscriptionDateFrom, subscriptionDateTo],
    queryFn: () => fetchSubscriptions({ status: subscriptionStatus, userRole, planType, searchQuery: subscriptionSearch, dateFrom: subscriptionDateFrom, dateTo: subscriptionDateTo }),
  })

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['payment-transactions', transactionStatus, paymentMethod, transactionSearch, transactionDateFrom, transactionDateTo],
    queryFn: () => fetchPaymentTransactions({ status: transactionStatus, paymentMethod, searchQuery: transactionSearch, dateFrom: transactionDateFrom, dateTo: transactionDateTo }),
  })

  const activeSubscriptions = subscriptions?.filter(s => s.status === 'active') || []
  const totalRevenue = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0)
  const expiringSoon = subscriptions?.filter(s => {
    if (s.status !== 'active' || !s.end_date) return false
    const d = calculateDaysRemaining(s.end_date)
    return d <= 7 && d > 0
  }).length || 0

  const completedTransactions = transactions?.filter(t => t.status === 'completed') || []
  const transactionRevenue = completedTransactions.reduce((sum, t) => sum + t.amount, 0)
  const pendingCount = transactions?.filter(t => t.status === 'pending').length || 0
  const failedCount = transactions?.filter(t => t.status === 'failed').length || 0

  return (
    <div className="space-y-6">
      {/* Dialogs */}
      {selectedSubscription && (
        <SubscriptionDialog subscription={selectedSubscription} onClose={() => setSelectedSubscription(null)} />
      )}
      {selectedTransaction && (
        <TransactionDialog transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-600">Manage subscriptions and payment transactions</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['subscriptions', 'transactions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'subscriptions' ? 'Subscriptions' : 'Payment Transactions'}
              {tab === 'subscriptions' && subscriptions && subscriptions.length > 0 && (
                <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{subscriptions.length}</span>
              )}
              {tab === 'transactions' && transactions && transactions.length > 0 && (
                <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{transactions.length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Subscriptions Tab ── */}
      {activeTab === 'subscriptions' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Active Subscriptions</p>
                  <p className="text-2xl font-semibold text-gray-900">{activeSubscriptions.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Expiring Soon</p>
                  <p className="text-2xl font-semibold text-gray-900">{expiringSoon}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user name, phone, or email..."
                    value={subscriptionSearch}
                    onChange={e => setSubscriptionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <select value={subscriptionStatus} onChange={e => setSubscriptionStatus(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Roles</option>
                <option value="rider">Rider</option>
                <option value="driver">Driver</option>
              </select>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 items-center">
              <select value={planType} onChange={e => setPlanType(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Plan Types</option>
                <option value="monthly">Monthly</option>
                <option value="biannual">Biannual</option>
                <option value="annual">Annual</option>
              </select>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input type="date" value={subscriptionDateFrom} onChange={e => setSubscriptionDateFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={subscriptionDateTo} onChange={e => setSubscriptionDateTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
              </div>
            </div>
          </div>

          {/* View container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* View toggle header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <p className="text-sm text-gray-500">{subscriptions?.length ?? 0} subscriptions</p>
              <ViewToggle view={subscriptionView} onChange={setSubscriptionView} />
            </div>

            {subscriptionsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
              </div>
            ) : subscriptions && subscriptions.length > 0 ? (
              subscriptionView === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['User', 'Plan', 'Amount', 'Dates', 'Status', 'Payment', 'Remaining'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {subscriptions.map(subscription => {
                        const daysRemaining = subscription.status === 'active' && subscription.end_date
                          ? calculateDaysRemaining(subscription.end_date)
                          : null
                        return (
                          <tr
                            key={subscription.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setSelectedSubscription(subscription)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 text-blue-600" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-gray-900">{subscription.user?.full_name || 'Unknown'}</div>
                                  <div className="text-xs text-gray-500">{subscription.user?.phone_number}</div>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${roleColors[subscription.user_role] || ''}`}>
                                    {subscription.user_role}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {subscription.plan_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatCurrency(subscription.amount, subscription.currency)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div>Start: {format(new Date(subscription.start_date), 'MMM d, yyyy')}</div>
                              <div>End: {format(new Date(subscription.end_date), 'MMM d, yyyy')}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${subscriptionStatusColors[subscription.status] || ''}`}>
                                {subscription.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div>{subscription.payment_method || 'N/A'}</div>
                              {subscription.payment_reference && (
                                <div className="text-xs text-gray-400 truncate max-w-xs">{subscription.payment_reference}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {daysRemaining !== null ? (
                                <span className={daysRemaining <= 7 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                                  {daysRemaining} days
                                </span>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                  {subscriptions.map(subscription => {
                    const daysRemaining = subscription.status === 'active' && subscription.end_date
                      ? calculateDaysRemaining(subscription.end_date)
                      : null
                    return (
                      <div
                        key={subscription.id}
                        className="border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-200 cursor-pointer transition-all"
                        onClick={() => setSelectedSubscription(subscription)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 leading-tight">{subscription.user?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{subscription.user?.phone_number}</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${subscriptionStatusColors[subscription.status] || ''}`}>
                            {subscription.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            {subscription.plan_type}
                          </span>
                          {subscription.user_role && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleColors[subscription.user_role] || ''}`}>
                              {subscription.user_role}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(subscription.amount, subscription.currency)}</p>
                          {daysRemaining !== null && (
                            <span className={`text-xs font-medium ${daysRemaining <= 7 ? 'text-red-600' : 'text-gray-500'}`}>
                              {daysRemaining}d left
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(subscription.start_date), 'MMM d')} – {format(new Date(subscription.end_date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No subscriptions found</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Transactions Tab ── */}
      {activeTab === 'transactions' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <CreditCard className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Transactions</p>
                  <p className="text-2xl font-semibold text-gray-900">{transactions?.length || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(transactionRevenue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Pending</p>
                  <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <XCircle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Failed</p>
                  <p className="text-2xl font-semibold text-gray-900">{failedCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user name, phone, or MMG transaction ID..."
                    value={transactionSearch}
                    onChange={e => setTransactionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <select value={transactionStatus} onChange={e => setTransactionStatus(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Methods</option>
                <option value="mmg">MMG</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input type="date" value={transactionDateFrom} onChange={e => setTransactionDateFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={transactionDateTo} onChange={e => setTransactionDateTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
          </div>

          {/* View container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <p className="text-sm text-gray-500">{transactions?.length ?? 0} transactions</p>
              <ViewToggle view={transactionView} onChange={setTransactionView} />
            </div>

            {transactionsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              transactionView === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['User', 'Subscription', 'Amount', 'Method', 'Status', 'MMG ID', 'Timeline'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactions.map(transaction => (
                        <tr
                          key={transaction.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedTransaction(transaction)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            {transaction.user ? (
                              <div className="flex items-center">
                                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 text-blue-600" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-gray-900">{transaction.user.full_name}</div>
                                  <div className="text-xs text-gray-500">{transaction.user.phone_number}</div>
                                  {transaction.user.role && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${roleColors[transaction.user.role] || ''}`}>
                                      {transaction.user.role}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">Unknown</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {transaction.subscription ? (
                              <div className="flex items-center text-sm gap-1">
                                <ExternalLink className="h-4 w-4 text-blue-600" />
                                <span className="text-blue-600 font-medium">{transaction.subscription.plan_type}</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${subscriptionStatusColors[transaction.subscription.status] || ''}`}>
                                  {transaction.subscription.status}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {transaction.payment_method}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentStatusColors[transaction.status] || ''}`}>
                              {transaction.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {transaction.mmg_transaction_id ? (
                              <span className="font-mono text-xs">{transaction.mmg_transaction_id}</span>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>Initiated: {format(new Date(transaction.initiated_at), 'MMM d, h:mm a')}</div>
                            {transaction.completed_at && (
                              <div className="text-green-600">Completed: {format(new Date(transaction.completed_at), 'MMM d, h:mm a')}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                  {transactions.map(transaction => (
                    <div
                      key={transaction.id}
                      className="border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-200 cursor-pointer transition-all"
                      onClick={() => setSelectedTransaction(transaction)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 leading-tight">{transaction.user?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{transaction.user?.phone_number}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusColors[transaction.status] || ''}`}>
                          {transaction.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(transaction.amount, transaction.currency)}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {transaction.payment_method}
                        </span>
                      </div>

                      {transaction.subscription && (
                        <div className="flex items-center gap-1 mb-2">
                          <ExternalLink className="h-3 w-3 text-blue-500" />
                          <span className="text-xs text-blue-600">{transaction.subscription.plan_type}</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${subscriptionStatusColors[transaction.subscription.status] || ''}`}>
                            {transaction.subscription.status}
                          </span>
                        </div>
                      )}

                      {transaction.mmg_transaction_id && (
                        <p className="text-xs text-gray-400 font-mono truncate">{transaction.mmg_transaction_id}</p>
                      )}

                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(transaction.initiated_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No payment transactions found</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
