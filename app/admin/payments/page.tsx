'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Search, CreditCard, DollarSign, Clock, User, Calendar, CheckCircle, XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Database } from '@/types/database'

type Subscription = Database['public']['Tables']['subscriptions']['Row'] & {
  user: Database['public']['Tables']['users']['Row']
}

type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'] & {
  user: Database['public']['Tables']['users']['Row'] | null
  subscription: Database['public']['Tables']['subscriptions']['Row'] | null
}

// Subscriptions
async function fetchSubscriptions(filters: {
  status: string
  userRole: string
  planType: string
  searchQuery: string
}) {
  const supabase = createClient()
  
  let query = supabase
    .from('subscriptions')
    .select(`
      *,
      user:user_id (full_name, phone_number, email, role)
    `)
    .order('created_at', { ascending: false })

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.userRole !== 'all') {
    query = query.eq('user_role', filters.userRole)
  }

  if (filters.planType !== 'all') {
    query = query.eq('plan_type', filters.planType)
  }

  const { data, error } = await query

  if (error) throw error

  // Client-side search filtering
  let results = data as Subscription[]
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(sub => 
      sub.user?.full_name?.toLowerCase().includes(searchLower) ||
      sub.user?.phone_number?.includes(searchLower) ||
      sub.user?.email?.toLowerCase().includes(searchLower)
    )
  }

  return results
}

// Payment Transactions
async function fetchPaymentTransactions(filters: {
  status: string
  paymentMethod: string
  searchQuery: string
}) {
  const supabase = createClient()
  
  let query = supabase
    .from('payment_transactions')
    .select(`
      *,
      user:user_id (full_name, phone_number, email, role),
      subscription:subscription_id (id, plan_type, status)
    `)
    .order('created_at', { ascending: false })

  if (filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.paymentMethod !== 'all') {
    query = query.eq('payment_method', filters.paymentMethod)
  }

  const { data, error } = await query

  if (error) throw error

  // Client-side search filtering
  let results = data as PaymentTransaction[]
  if (filters.searchQuery) {
    const searchLower = filters.searchQuery.toLowerCase()
    results = results.filter(transaction => 
      transaction.user?.full_name?.toLowerCase().includes(searchLower) ||
      transaction.user?.phone_number?.includes(searchLower) ||
      transaction.mmg_transaction_id?.toLowerCase().includes(searchLower)
    )
  }

  return results
}

const subscriptionStatusColors = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const paymentStatusColors = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
}

const roleColors = {
  rider: 'bg-green-100 text-green-800',
  driver: 'bg-blue-100 text-blue-800',
  admin: 'bg-purple-100 text-purple-800',
}

function calculateDaysRemaining(endDate: string): number {
  const end = new Date(endDate)
  const now = new Date()
  const diffTime = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

function formatCurrency(amount: number, currency: string = 'GYD'): string {
  return `${currency} ${amount.toFixed(2)}`
}

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'transactions'>('subscriptions')
  
  // Subscriptions filters
  const [subscriptionStatus, setSubscriptionStatus] = useState('all')
  const [userRole, setUserRole] = useState('all')
  const [planType, setPlanType] = useState('all')
  const [subscriptionSearch, setSubscriptionSearch] = useState('')
  
  // Transactions filters
  const [transactionStatus, setTransactionStatus] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [transactionSearch, setTransactionSearch] = useState('')

  // Subscriptions query
  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions', subscriptionStatus, userRole, planType, subscriptionSearch],
    queryFn: () => fetchSubscriptions({ status: subscriptionStatus, userRole, planType, searchQuery: subscriptionSearch }),
  })

  // Transactions query
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['payment-transactions', transactionStatus, paymentMethod, transactionSearch],
    queryFn: () => fetchPaymentTransactions({ status: transactionStatus, paymentMethod, searchQuery: transactionSearch }),
  })

  // Calculate metrics for subscriptions
  const activeSubscriptions = subscriptions?.filter(s => s.status === 'active') || []
  const totalRevenue = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0)
  const expiringSoon = subscriptions?.filter(s => {
    if (s.status !== 'active' || !s.end_date) return false
    const daysRemaining = calculateDaysRemaining(s.end_date)
    return daysRemaining <= 7 && daysRemaining > 0
  }).length || 0

  // Calculate metrics for transactions
  const completedTransactions = transactions?.filter(t => t.status === 'completed') || []
  const transactionRevenue = completedTransactions.reduce((sum, t) => sum + t.amount, 0)
  const pendingCount = transactions?.filter(t => t.status === 'pending').length || 0
  const failedCount = transactions?.filter(t => t.status === 'failed').length || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage subscriptions and payment transactions
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'subscriptions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Subscriptions
            {subscriptions && subscriptions.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {subscriptions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'transactions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Payment Transactions
            {transactions && transactions.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {transactions.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Active Subscriptions</p>
                  <p className="text-2xl font-semibold text-gray-900">{activeSubscriptions.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-8 w-8 text-yellow-600" />
                </div>
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user name, phone, or email..."
                    value={subscriptionSearch}
                    onChange={(e) => setSubscriptionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => setSubscriptionStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Roles</option>
                  <option value="rider">Rider</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Plan Types</option>
                <option value="monthly">Monthly</option>
                <option value="biannual">Biannual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          {/* Subscriptions Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {subscriptionsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : subscriptions && subscriptions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dates
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Remaining
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {subscriptions.map((subscription) => {
                      const daysRemaining = subscription.status === 'active' && subscription.end_date
                        ? calculateDaysRemaining(subscription.end_date)
                        : null

                      return (
                        <tr key={subscription.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-8 w-8 flex-shrink-0">
                                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-blue-600" />
                                </div>
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {subscription.user?.full_name || 'Unknown'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {subscription.user?.phone_number}
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                                  roleColors[subscription.user_role]
                                }`}>
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
                            <div>
                              <div>Start: {format(new Date(subscription.start_date), 'MMM d, yyyy')}</div>
                              <div>End: {format(new Date(subscription.end_date), 'MMM d, yyyy')}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              subscriptionStatusColors[subscription.status]
                            }`}>
                              {subscription.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div>{subscription.payment_method || 'N/A'}</div>
                              {subscription.payment_reference && (
                                <div className="text-xs text-gray-400 truncate max-w-xs">
                                  {subscription.payment_reference}
                                </div>
                              )}
                            </div>
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
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No subscriptions found</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Payment Transactions Tab */}
      {activeTab === 'transactions' && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Transactions</p>
                  <p className="text-2xl font-semibold text-gray-900">{transactions?.length || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(transactionRevenue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-8 w-8 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Pending</p>
                  <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user name, phone, or MMG transaction ID..."
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <select
                  value={transactionStatus}
                  onChange={(e) => setTransactionStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Methods</option>
                  <option value="mmg">MMG</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {transactionsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscription
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MMG ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timeline
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gateway Response
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </tbody>
                </table>
              </div>
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

function TransactionRow({ transaction }: { transaction: PaymentTransaction }) {
  const [showGatewayResponse, setShowGatewayResponse] = useState(false)

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap">
          {transaction.user ? (
            <div className="flex items-center">
              <div className="h-8 w-8 flex-shrink-0">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">
                  {transaction.user.full_name}
                </div>
                <div className="text-xs text-gray-500">
                  {transaction.user.phone_number}
                </div>
                {transaction.user.role && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
                    roleColors[transaction.user.role]
                  }`}>
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
            <div className="flex items-center text-sm">
              <ExternalLink className="h-4 w-4 text-blue-600 mr-1" />
              <span className="text-blue-600 font-medium">
                {transaction.subscription.plan_type}
              </span>
              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                subscriptionStatusColors[transaction.subscription.status]
              }`}>
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
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            paymentStatusColors[transaction.status]
          }`}>
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
          <div>
            <div>Initiated: {format(new Date(transaction.initiated_at), 'MMM d, h:mm a')}</div>
            {transaction.completed_at && (
              <div className="text-green-600">
                Completed: {format(new Date(transaction.completed_at), 'MMM d, h:mm a')}
              </div>
            )}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          {transaction.gateway_response ? (
            <button
              onClick={() => setShowGatewayResponse(!showGatewayResponse)}
              className="flex items-center text-sm text-blue-600 hover:text-blue-900"
            >
              {showGatewayResponse ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  View
                </>
              )}
            </button>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )}
        </td>
      </tr>
      {showGatewayResponse && transaction.gateway_response && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-gray-50">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(transaction.gateway_response, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

