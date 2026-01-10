'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  Car, 
  FileText, 
  Calendar, 
  Star, 
  TrendingUp,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  Edit,
  CreditCard,
  History,
  Shield
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useState } from 'react'
import type { 
  DriverWithDetails, 
  VerificationStatus,
  Database 
} from '@/types/database'

type DriverDetailData = {
  driver: DriverWithDetails & {
    user: Database['public']['Tables']['users']['Row'] | null
    vehicles: Database['public']['Tables']['vehicles']['Row'][]
  }
  trips: Array<Database['public']['Tables']['trips']['Row'] & {
    rider?: {
      id: string
      user: Database['public']['Tables']['users']['Row']
    }
  }>
  subscriptions: Database['public']['Tables']['subscriptions']['Row'][]
  payments: Database['public']['Tables']['payment_transactions']['Row'][]
  verificationLogs: Array<Database['public']['Tables']['verification_logs']['Row'] & {
    admin?: Database['public']['Tables']['users']['Row']
  }>
}

async function fetchDriverDetail(driverId: string): Promise<DriverDetailData> {
  const supabase = createClient()
  
  // Fetch driver profile with user
  const { data: driverData, error: driverError } = await supabase
    .from('driver_profiles')
    .select(`
      *,
      user:user_id (*)
    `)
    .eq('id', driverId)
    .single()

  if (driverError) throw driverError
  if (!driverData) throw new Error('Driver not found')

  // Fetch vehicles separately
  const { data: vehiclesData, error: vehiclesError } = await supabase
    .from('vehicles')
    .select('*')
    .eq('driver_id', driverId)

  if (vehiclesError) throw vehiclesError

  // Fetch recent trips
  const { data: tripsData, error: tripsError } = await supabase
    .from('trips')
    .select(`
      *,
      rider:rider_id (
        id,
        user:user_id (full_name, phone_number)
      )
    `)
    .eq('driver_id', driverId)
    .order('requested_at', { ascending: false })
    .limit(20)

  if (tripsError) throw tripsError

  // Fetch subscriptions
  const { data: subscriptionsData, error: subscriptionsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', driverData.user_id)
    .order('created_at', { ascending: false })

  if (subscriptionsError) throw subscriptionsError

  // Fetch payment transactions
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('user_id', driverData.user_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (paymentsError) throw paymentsError

  // Fetch verification logs
  const { data: logsData, error: logsError } = await supabase
    .from('verification_logs')
    .select(`
      *,
      admin:admin_id (full_name, email)
    `)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })

  if (logsError) throw logsError

  return {
    driver: {
      ...driverData,
      vehicles: (vehiclesData || []) as Database['public']['Tables']['vehicles']['Row'][]
    } as DriverDetailData['driver'],
    trips: (tripsData || []) as DriverDetailData['trips'],
    subscriptions: (subscriptionsData || []) as DriverDetailData['subscriptions'],
    payments: (paymentsData || []) as DriverDetailData['payments'],
    verificationLogs: (logsData || []) as DriverDetailData['verificationLogs'],
  }
}

const verificationBadgeColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
}

const verificationIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  suspended: Ban,
}

const statusColors = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function DriverDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const driverId = params.id as string
  const [showVerificationModal, setShowVerificationModal] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-detail', driverId],
    queryFn: () => fetchDriverDetail(driverId),
    enabled: !!driverId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading driver details...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Driver not found</p>
          <p className="text-gray-600 mb-4">The driver you're looking for doesn't exist.</p>
          <Link
            href="/admin/drivers"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Drivers
          </Link>
        </div>
      </div>
    )
  }

  const { driver, trips, subscriptions, payments, verificationLogs } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/drivers"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {driver.user?.full_name || 'Driver Details'}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Driver ID: {driver.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
            verificationBadgeColors[driver.verification_status]
          }`}>
            {driver.verification_status}
          </span>
          <button
            onClick={() => setShowVerificationModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="h-4 w-4 mr-2" />
            Update Verification
          </button>
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
              <p className="text-base font-medium text-gray-900">{driver.user?.full_name || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="text-base font-medium text-gray-900">{driver.user?.phone_number || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Mail className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="text-base font-medium text-gray-900">{driver.user?.email || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Calendar className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Member Since</p>
              <p className="text-base font-medium text-gray-900">
                {driver.created_at ? format(new Date(driver.created_at), 'MMM dd, yyyy') : 'N/A'}
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
                {driver.user?.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Trips</p>
              <p className="text-2xl font-bold text-gray-900">{driver.total_trips}</p>
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
                {driver.rating_average.toFixed(1)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Star className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Acceptance Rate</p>
              <p className="text-2xl font-bold text-gray-900">{driver.acceptance_rate.toFixed(1)}%</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="text-2xl font-bold text-gray-900">
                {driver.is_online ? 'Online' : 'Offline'}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${driver.is_online ? 'bg-green-100' : 'bg-gray-100'}`}>
              <div className={`h-3 w-3 rounded-full ${driver.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Driver Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">License Number</p>
            <p className="text-base font-medium text-gray-900">{driver.drivers_license_number || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">License Expiry</p>
            <p className="text-base font-medium text-gray-900">
              {driver.drivers_license_expiry 
                ? format(new Date(driver.drivers_license_expiry), 'MMM dd, yyyy')
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Subscription Status</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              driver.subscription_status === 'active' 
                ? 'bg-green-100 text-green-800'
                : driver.subscription_status === 'trial'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {driver.subscription_status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Verification Status</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              verificationBadgeColors[driver.verification_status]
            }`}>
              {driver.verification_status}
            </span>
          </div>
          {driver.verified_at && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Verified At</p>
              <p className="text-base font-medium text-gray-900">
                {format(new Date(driver.verified_at), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          )}
          {driver.mmg_account_number && (
            <div>
              <p className="text-sm text-gray-500 mb-1">MMG Account Number</p>
              <p className="text-base font-medium text-gray-900">{driver.mmg_account_number}</p>
            </div>
          )}
        </div>
        {(driver.national_id_url || driver.drivers_license_url) && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3">Documents</p>
            <div className="flex gap-4">
              {driver.national_id_url && (
                <a
                  href={driver.national_id_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View National ID
                </a>
              )}
              {driver.drivers_license_url && (
                <a
                  href={driver.drivers_license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Driver's License
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Vehicles */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicles</h2>
        {driver.vehicles && driver.vehicles.length > 0 ? (
          <div className="space-y-4">
            {driver.vehicles.map((vehicle) => (
              <div key={vehicle.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Car className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-base font-semibold text-gray-900">
                          {vehicle.make} {vehicle.model}
                        </p>
                        {vehicle.is_primary && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                            Primary
                          </span>
                        )}
                        {vehicle.is_active && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">License Plate</p>
                          <p className="font-medium text-gray-900">{vehicle.license_plate}</p>
                        </div>
                        {vehicle.year && (
                          <div>
                            <p className="text-gray-500">Year</p>
                            <p className="font-medium text-gray-900">{vehicle.year}</p>
                          </div>
                        )}
                        {vehicle.color && (
                          <div>
                            <p className="text-gray-500">Color</p>
                            <p className="font-medium text-gray-900">{vehicle.color}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-gray-500">Capacity</p>
                          <p className="font-medium text-gray-900">{vehicle.passenger_capacity} passengers</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No vehicles registered</p>
        )}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rider</th>
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
                      {trip.rider?.user ? (
                        <div>
                          <p className="font-medium text-gray-900">{trip.rider.user.full_name}</p>
                          <p className="text-gray-500">{trip.rider.user.phone_number}</p>
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

      {/* Subscriptions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscriptions</h2>
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
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {subscription.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No subscriptions found</p>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No payment history found</p>
        )}
      </div>

      {/* Verification History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Verification History</h2>
        {verificationLogs.length > 0 ? (
          <div className="space-y-4">
            {verificationLogs.map((log) => {
              const Icon = verificationIcons[log.new_status as VerificationStatus] || AlertCircle
              return (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      log.new_status === 'approved' ? 'bg-green-100' :
                      log.new_status === 'rejected' ? 'bg-red-100' :
                      log.new_status === 'suspended' ? 'bg-gray-100' :
                      'bg-yellow-100'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        log.new_status === 'approved' ? 'text-green-600' :
                        log.new_status === 'rejected' ? 'text-red-600' :
                        log.new_status === 'suspended' ? 'text-gray-600' :
                        'text-yellow-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            Status changed from <span className="text-gray-600">{log.previous_status || 'N/A'}</span> to{' '}
                            <span className={`font-semibold ${
                              log.new_status === 'approved' ? 'text-green-600' :
                              log.new_status === 'rejected' ? 'text-red-600' :
                              log.new_status === 'suspended' ? 'text-gray-600' :
                              'text-yellow-600'
                            }`}>{log.new_status}</span>
                          </p>
                          {log.admin && (
                            <p className="text-sm text-gray-500 mt-1">
                              By {log.admin.full_name} {log.admin.email ? `(${log.admin.email})` : ''}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                      {log.admin_notes && (
                        <p className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Notes:</span> {log.admin_notes}
                        </p>
                      )}
                      {log.rejection_reason && (
                        <p className="text-sm text-red-700 mt-2">
                          <span className="font-medium">Rejection Reason:</span> {log.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No verification history found</p>
        )}
      </div>

      {/* Verification Update Modal */}
      {showVerificationModal && (
        <VerificationUpdateModal
          driver={driver}
          onClose={() => setShowVerificationModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['driver-detail', driverId] })
            setShowVerificationModal(false)
          }}
        />
      )}
    </div>
  )
}

function VerificationUpdateModal({
  driver,
  onClose,
  onSuccess,
}: {
  driver: DriverWithDetails
  onClose: () => void
  onSuccess: () => void
}) {
  const [status, setStatus] = useState<VerificationStatus>(driver.verification_status)
  const [adminNotes, setAdminNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      // Get current admin user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        throw new Error('Not authenticated')
      }

      const { data: adminUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authUser.id)
        .single()

      if (!adminUser) {
        throw new Error('Admin user not found')
      }

      // Update driver verification status
      const updateData: any = {
        verification_status: status,
      }

      if (status === 'approved') {
        updateData.verified_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('driver_profiles')
        .update(updateData)
        .eq('id', driver.id)

      if (updateError) throw updateError

      // Create verification log entry
      const { error: logError } = await supabase
        .from('verification_logs')
        .insert({
          driver_id: driver.id,
          admin_id: adminUser.id,
          previous_status: driver.verification_status,
          new_status: status,
          admin_notes: adminNotes || null,
          rejection_reason: status === 'rejected' ? rejectionReason || null : null,
        })

      if (logError) throw logError

      // Optionally create notification for driver
      if (driver.user_id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: driver.user_id,
            title: status === 'approved' 
              ? 'Verification Approved!' 
              : status === 'rejected'
              ? 'Verification Rejected'
              : status === 'suspended'
              ? 'Account Suspended'
              : 'Verification Status Updated',
            body: status === 'approved'
              ? 'Your driver account is now active. You can start accepting trips.'
              : status === 'rejected'
              ? 'Your verification application has been rejected. Please review the reason and resubmit.'
              : status === 'suspended'
              ? 'Your driver account has been suspended. Please contact support for more information.'
              : 'Your verification status has been updated.',
            notification_type: `verification_${status}`,
          })
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to update verification status')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Update Verification Status</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VerificationStatus)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Notes (Optional)
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add any notes about this verification status change..."
            />
          </div>

          {status === 'rejected' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Explain why the verification was rejected..."
                required
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

