'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  Star, 
  TrendingUp,
  Clock,
  AlertCircle,
  Edit,
  CreditCard,
  Route,
  Shield,
  Users
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useState } from 'react'
import type { 
  RiderWithDetails, 
  Database 
} from '@/types/database'

type RiderDetailData = {
  rider: RiderWithDetails & {
    user: Database['public']['Tables']['users']['Row']
  }
  trips: Array<Database['public']['Tables']['trips']['Row'] & {
    driver?: {
      id: string
      user: Database['public']['Tables']['users']['Row']
    }
  }>
  subscriptions: Database['public']['Tables']['subscriptions']['Row'][]
  payments: Database['public']['Tables']['payment_transactions']['Row'][]
}

async function fetchRiderDetail(riderId: string): Promise<RiderDetailData> {
  const supabase = createClient()
  
  // Fetch rider profile with user
  const { data: riderData, error: riderError } = await supabase
    .from('rider_profiles')
    .select(`
      *,
      user:user_id (*)
    `)
    .eq('id', riderId)
    .single()

  if (riderError) throw riderError
  if (!riderData) throw new Error('Rider not found')

  // Type assertion for riderData
  const rider = riderData as Database['public']['Tables']['rider_profiles']['Row'] & {
    user: Database['public']['Tables']['users']['Row']
  }

  // Fetch recent trips
  const { data: tripsData, error: tripsError } = await supabase
    .from('trips')
    .select(`
      *,
      driver:driver_id (
        id,
        user:user_id (full_name, phone_number)
      )
    `)
    .eq('rider_id', riderId)
    .order('requested_at', { ascending: false })
    .limit(20)

  if (tripsError) throw tripsError

  // Fetch subscriptions
  const { data: subscriptionsData, error: subscriptionsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', rider.user_id)
    .order('created_at', { ascending: false })

  if (subscriptionsError) throw subscriptionsError

  // Fetch payment transactions
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('user_id', rider.user_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (paymentsError) throw paymentsError

  return {
    rider: rider as RiderDetailData['rider'],
    trips: (tripsData || []) as RiderDetailData['trips'],
    subscriptions: (subscriptionsData || []) as RiderDetailData['subscriptions'],
    payments: (paymentsData || []) as RiderDetailData['payments'],
  }
}

const subscriptionBadgeColors = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const statusColors = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function RiderDetailPage() {
  const params = useParams()
  const riderId = params.id as string

  const { data, isLoading, error } = useQuery({
    queryKey: ['rider-detail', riderId],
    queryFn: () => fetchRiderDetail(riderId),
    enabled: !!riderId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rider details...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Rider not found</p>
          <p className="text-gray-600 mb-4">The rider you&apos;re looking for doesn&apos;t exist.</p>
          <Link
            href="/admin/riders"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Riders
          </Link>
        </div>
      </div>
    )
  }

  const { rider, trips, subscriptions, payments } = data
  const isTrialExpiringSoon = rider.subscription_status === 'trial' && 
    rider.trial_end_date && 
    new Date(rider.trial_end_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
    new Date(rider.trial_end_date) > new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/riders"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {rider.user?.full_name || 'Rider Details'}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Rider ID: {rider.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
            subscriptionBadgeColors[rider.subscription_status]
          }`}>
            {rider.subscription_status}
          </span>
          {isTrialExpiringSoon && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              <Clock className="h-4 w-4 mr-1" />
              Trial Expiring Soon
            </span>
          )}
        </div>
      </div>

      {/* Profile Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="text-base font-medium text-gray-900">{rider.user?.full_name || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="text-base font-medium text-gray-900">{rider.user?.phone_number || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Mail className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="text-base font-medium text-gray-900">{rider.user?.email || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Calendar className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Member Since</p>
              <p className="text-base font-medium text-gray-900">
                {rider.created_at ? format(new Date(rider.created_at), 'MMM dd, yyyy') : 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Shield className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Account Status</p>
              <p className="text-base font-medium text-gray-900">
                {rider.user?.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
          {(rider.emergency_contact_name || rider.emergency_contact_phone) && (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Users className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Emergency Contact</p>
                <p className="text-base font-medium text-gray-900">
                  {rider.emergency_contact_name || 'N/A'}
                </p>
                {rider.emergency_contact_phone && (
                  <p className="text-sm text-gray-500">{rider.emergency_contact_phone}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rider Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Trips</p>
              <p className="text-2xl font-bold text-gray-900">{rider.total_trips}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Rating</p>
              <p className="text-2xl font-bold text-gray-900">
                {rider.rating_average.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-1">({rider.rating_count} reviews)</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Star className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Subscription Status</p>
              <p className="text-2xl font-bold text-gray-900 capitalize">
                {rider.subscription_status}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${
              rider.subscription_status === 'active' ? 'bg-green-100' :
              rider.subscription_status === 'trial' ? 'bg-blue-100' :
              'bg-red-100'
            }`}>
              <CreditCard className={`h-6 w-6 ${
                rider.subscription_status === 'active' ? 'text-green-600' :
                rider.subscription_status === 'trial' ? 'text-blue-600' :
                'text-red-600'
              }`} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Trial End Date</p>
              <p className="text-2xl font-bold text-gray-900">
                {rider.trial_end_date 
                  ? format(new Date(rider.trial_end_date), 'MMM dd')
                  : 'N/A'}
              </p>
              {rider.trial_end_date && isTrialExpiringSoon && (
                <p className="text-xs text-yellow-600 mt-1">Expiring Soon</p>
              )}
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Subscription Status</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              subscriptionBadgeColors[rider.subscription_status]
            }`}>
              {rider.subscription_status}
            </span>
          </div>
          {rider.subscription_start_date && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Subscription Start Date</p>
              <p className="text-base font-medium text-gray-900">
                {format(new Date(rider.subscription_start_date), 'MMM dd, yyyy')}
              </p>
            </div>
          )}
          {rider.subscription_end_date && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Subscription End Date</p>
              <p className="text-base font-medium text-gray-900">
                {format(new Date(rider.subscription_end_date), 'MMM dd, yyyy')}
              </p>
            </div>
          )}
          {rider.trial_end_date && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Trial End Date</p>
              <p className={`text-base font-medium ${
                isTrialExpiringSoon ? 'text-yellow-600' : 'text-gray-900'
              }`}>
                {format(new Date(rider.trial_end_date), 'MMM dd, yyyy')}
                {isTrialExpiringSoon && (
                  <span className="ml-2 text-xs text-yellow-600">(Expiring Soon)</span>
                )}
              </p>
            </div>
          )}
        </div>
        
        {/* Subscription History */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Subscription History</h3>
          {subscriptions.length > 0 ? (
            <div className="space-y-4">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{subscription.plan_type}</p>
                      <p className="text-sm text-gray-500">
                        {format(new Date(subscription.start_date), 'MMM dd, yyyy')} - {format(new Date(subscription.end_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {subscription.currency} {subscription.amount.toFixed(2)}
                      </p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        subscription.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : subscription.status === 'trial'
                          ? 'bg-blue-100 text-blue-800'
                          : subscription.status === 'expired'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {subscription.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No subscription history found</p>
          )}
        </div>
      </div>

      {/* Recent Trips */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Trips</h2>
        {trips.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fare</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(trip.requested_at), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {trip.driver?.user ? (
                        <div>
                          <p className="font-medium text-gray-900">{trip.driver.user.full_name}</p>
                          <p className="text-gray-500">{trip.driver.user.phone_number}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="max-w-xs">
                        <p className="text-gray-900 truncate">{trip.pickup_address}</p>
                        <p className="text-gray-500 truncate">→ {trip.destination_address}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[trip.status]
                      }`}>
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {trip.actual_fare ? `GYD ${trip.actual_fare.toFixed(2)}` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No trips found</p>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.created_at), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.currency} {payment.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {payment.payment_method}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payment.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : payment.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : payment.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {payment.mmg_reference || payment.mmg_transaction_id || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No payment history found</p>
        )}
      </div>
    </div>
  )
}




