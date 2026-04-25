'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { sendDriverPushNotification } from './actions'
import Image from 'next/image'
import {
  ArrowLeft,
  ChevronRight,
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
  Shield,
  MessageSquare,
  Bell
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useState, useCallback, useEffect } from 'react'
import type {
  DriverWithDetails,
  VerificationStatus,
  SubscriptionStatus,
  Database
} from '@/types/database'
import { TripRouteMap } from '@/components/drivers/trip-route-map'
import type { TripRoutePoint } from '@/components/drivers/trip-route-map'

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
  payments: Array<
    Database['public']['Tables']['payment_transactions']['Row'] & {
      subscription: Pick<
        Database['public']['Tables']['subscriptions']['Row'],
        'id' | 'plan_type' | 'status' | 'start_date' | 'end_date' | 'user_role'
      > | null
    }
  >
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

  // Type assertion for driverData to access user_id
  const driver = driverData as Database['public']['Tables']['driver_profiles']['Row'] & {
    user: Database['public']['Tables']['users']['Row'] | null
  }

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

  const userId = driver.user_id

  // Driver subscription rows only (same user can also have rider history)
  const { data: subscriptionsData, error: subscriptionsError } = userId
    ? await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('user_role', 'driver')
        .order('created_at', { ascending: false })
    : { data: [] as Database['public']['Tables']['subscriptions']['Row'][], error: null }

  if (subscriptionsError) throw subscriptionsError

  const { data: paymentsData, error: paymentsError } = userId
    ? await supabase
        .from('payment_transactions')
        .select(
          `
          *,
          subscription:subscription_id (id, plan_type, status, start_date, end_date, user_role)
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [], error: null }

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
      ...driver,
      vehicles: (vehiclesData || []) as Database['public']['Tables']['vehicles']['Row'][]
    } as DriverDetailData['driver'],
    trips: (tripsData || []) as DriverDetailData['trips'],
    subscriptions: (subscriptionsData || []) as DriverDetailData['subscriptions'],
    payments: ((paymentsData || []) as unknown as DriverDetailData['payments']).filter(
      (p) => !p.subscription || p.subscription.user_role === 'driver'
    ),
    verificationLogs: (logsData || []) as DriverDetailData['verificationLogs'],
  }
}

const verificationBadgeColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-100 text-gray-800',
}

const subscriptionBadgeColors = {
  active: 'bg-green-100 text-green-800',
  trial: 'bg-blue-100 text-blue-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const verificationIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  suspended: Ban,
}

function DriverDocumentPreview({
  url,
  title,
}: {
  url: string | null | undefined
  title: string
}) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [url])

  if (!url?.trim()) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900 mb-1">{title}</p>
        <p className="text-sm text-gray-400">Not uploaded</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-white">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0"
        >
          Open full size
        </a>
      </div>
      <div className="p-4">
        {imgError ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-5 w-5 text-gray-500 shrink-0" aria-hidden />
            View file
          </a>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative mx-auto block aspect-[4/3] max-h-72 w-full max-w-lg overflow-hidden rounded-lg border border-gray-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Image
              src={url}
              alt={title}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 400px"
              unoptimized
              onError={() => setImgError(true)}
            />
          </a>
        )}
      </div>
    </div>
  )
}

const statusColors = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

async function fetchTripRoute(tripId: string): Promise<TripRoutePoint[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('location_history')
    .select('latitude, longitude, recorded_at')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return ((data || []) as Array<{ latitude: unknown; longitude: unknown; recorded_at: string }>).map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    recorded_at: p.recorded_at,
  }))
}

async function fetchNextPendingDriver(currentCreatedAt: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('id')
    .eq('verification_status', 'pending')
    .lt('created_at', currentCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null }

  if (error) throw error
  return data?.id ?? null
}

export default function DriverDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const driverId = params.id as string
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [showPushModal, setShowPushModal] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-detail', driverId],
    queryFn: () => fetchDriverDetail(driverId),
    enabled: !!driverId,
  })

  const nextPendingQuery = useQuery({
    queryKey: ['next-pending-driver', driverId, data?.driver.created_at],
    queryFn: () => fetchNextPendingDriver(data!.driver.created_at),
    enabled: !!data?.driver.created_at,
    staleTime: 30_000,
  })

  const { data: routePoints = [], isLoading: isLoadingRoute } = useQuery({
    queryKey: ['trip-route', selectedTripId],
    queryFn: () => fetchTripRoute(selectedTripId!),
    enabled: !!selectedTripId,
    staleTime: 5 * 60 * 1000,
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
          <p className="text-gray-600 mb-4">The driver you&apos;re looking for doesn&apos;t exist.</p>
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

  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? null

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Link
            href="/admin/drivers"
            className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">
              {driver.user?.full_name || 'Driver Details'}
            </h1>
            <p className="mt-1 text-sm text-gray-600 break-all">
              Driver ID: {driver.id}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:justify-end">
          {nextPendingQuery.isLoading ? (
            <button disabled className="inline-flex items-center rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-600 opacity-70 cursor-not-allowed sm:px-4 sm:py-2 sm:text-sm">
              <div className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-yellow-500 sm:mr-2 sm:h-4 sm:w-4" />
              Loading...
            </button>
          ) : nextPendingQuery.data ? (
            <button
              onClick={() => router.push(`/admin/drivers/${nextPendingQuery.data}`)}
              className="inline-flex items-center rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-800 transition-colors hover:bg-yellow-100 sm:px-4 sm:py-2 sm:text-sm"
            >
              <ChevronRight className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Next Pending
            </button>
          ) : null}
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm ${
            verificationBadgeColors[driver.verification_status]
          }`}>
            {driver.verification_status}
          </span>
          <button
            onClick={() => setShowSmsModal(true)}
            className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 sm:px-4 sm:py-2 sm:text-sm"
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Send SMS
          </button>
          <button
            onClick={() => setShowPushModal(true)}
            className="inline-flex items-center rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 sm:px-4 sm:py-2 sm:text-sm"
          >
            <Bell className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Send Push
          </button>
          <button
            onClick={() => setShowVerificationModal(true)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:px-4 sm:py-2 sm:text-sm"
          >
            <Edit className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Driver Details</h2>
          <button
            onClick={() => setShowSubscriptionModal(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Edit Subscription
          </button>
        </div>
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
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                subscriptionBadgeColors[driver.subscription_status]
              }`}
            >
              {driver.subscription_status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Subscription Start (profile)</p>
            <p className="text-base font-medium text-gray-900">
              {driver.subscription_start_date
                ? format(new Date(driver.subscription_start_date), 'MMM dd, yyyy HH:mm')
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Subscription End (profile)</p>
            <p className="text-base font-medium text-gray-900">
              {driver.subscription_end_date
                ? format(new Date(driver.subscription_end_date), 'MMM dd, yyyy HH:mm')
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Monthly Fee</p>
            <p className="text-base font-medium text-gray-900">
              GYD {Number(driver.monthly_fee_amount).toFixed(2)}
            </p>
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
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-3">Documents</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <DriverDocumentPreview url={driver.national_id_url} title="National ID" />
            <DriverDocumentPreview
              url={driver.drivers_license_url}
              title="Driver's license"
            />
            <DriverDocumentPreview
              url={driver.insurance_document_url}
              title="Insurance"
            />
          </div>
        </div>
      </div>

      {/* Vehicles */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicles</h2>
        {driver.vehicles && driver.vehicles.length > 0 ? (
          <div className="space-y-6">
            {driver.vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Car className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No vehicles registered</p>
          </div>
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
                  <tr
                    key={trip.id}
                    onClick={() => setSelectedTripId(trip.id === selectedTripId ? null : trip.id)}
                    className={`cursor-pointer transition-colors ${
                      trip.id === selectedTripId ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
                    }`}
                  >
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

      {/* Trip Route Map */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Trip Route</h2>
        {selectedTrip ? (
          <TripRouteMap
            trip={selectedTrip}
            routePoints={routePoints}
            isLoadingRoute={isLoadingRoute}
            showTripInfo
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <MapPin className="h-12 w-12 mb-3 text-gray-300" />
            <p className="text-sm">Select a trip from the table above to view its route</p>
          </div>
        )}
      </div>

      {/* Subscriptions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscriptions</h2>
        <p className="text-sm text-gray-500 mb-4">
          Subscription records for this driver account (<span className="font-medium">user_role: driver</span>).
        </p>
        {subscriptions.length > 0 ? (
          <div className="space-y-4">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{subscription.plan_type}</p>
                    <p className="text-sm text-gray-500">
                      {format(new Date(subscription.start_date), 'MMM dd, yyyy')} –{' '}
                      {format(new Date(subscription.end_date), 'MMM dd, yyyy')}
                    </p>
                    {subscription.payment_reference && (
                      <p className="text-xs text-gray-500 mt-1">
                        Ref: {subscription.payment_reference}
                        {subscription.payment_date
                          ? ` · Paid ${format(new Date(subscription.payment_date), 'MMM dd, yyyy HH:mm')}`
                          : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold text-gray-900">
                      {subscription.currency} {Number(subscription.amount).toFixed(2)}
                    </p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        subscriptionBadgeColors[subscription.status]
                      }`}
                    >
                      {subscription.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No driver subscriptions found</p>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
        <p className="text-sm text-gray-500 mb-4">
          Payment transactions linked to this driver&apos;s user account (includes subscription renewals and related charges).
        </p>
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.created_at), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {payment.completed_at
                        ? format(new Date(payment.completed_at), 'MMM dd, yyyy HH:mm')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.currency} {Number(payment.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {payment.subscription ? (
                        <div>
                          <p className="font-medium text-gray-900">{payment.subscription.plan_type}</p>
                          <p className="text-xs text-gray-500">
                            {payment.subscription.status}
                            {payment.subscription.user_role
                              ? ` · ${payment.subscription.user_role}`
                              : ''}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {payment.payment_method}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[10rem] truncate" title={payment.mmg_reference ?? undefined}>
                      {payment.mmg_reference || payment.mmg_transaction_id || '—'}
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
            queryClient.invalidateQueries({ queryKey: ['next-pending-driver'] })
            setShowVerificationModal(false)
          }}
        />
      )}

      {/* Subscription Update Modal */}
      {showSubscriptionModal && (
        <SubscriptionUpdateModal
          driver={driver}
          onClose={() => setShowSubscriptionModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['driver-detail', driverId] })
            setShowSubscriptionModal(false)
          }}
        />
      )}

      {/* Send SMS Modal */}
      {showSmsModal && (
        <SendSmsModal
          driver={driver}
          onClose={() => setShowSmsModal(false)}
        />
      )}

      {/* Send Push Notification Modal */}
      {showPushModal && (
        <SendPushNotificationModal
          driver={driver}
          onClose={() => setShowPushModal(false)}
        />
      )}
    </div>
  )
}

function VehicleCard({ vehicle }: { vehicle: Database['public']['Tables']['vehicles']['Row'] }) {
  const [vehicleImageError, setVehicleImageError] = useState(false)
  const [registrationImageError, setRegistrationImageError] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vehicle Images */}
        <div className="lg:col-span-1 space-y-4">
          {vehicle.vehicle_photo_url && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Vehicle Photo</p>
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                {!vehicleImageError ? (
                  <Image
                    src={vehicle.vehicle_photo_url}
                    alt={`${vehicle.make} ${vehicle.model}`}
                    fill
                    className="object-cover"
                    onError={() => setVehicleImageError(true)}
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <FileText className="h-8 w-8" />
                  </div>
                )}
              </div>
              <a
                href={vehicle.vehicle_photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                <FileText className="h-4 w-4 mr-1" />
                View Full Image
              </a>
            </div>
          )}
          {vehicle.registration_url && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Registration Document</p>
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                {!registrationImageError ? (
                  <Image
                    src={vehicle.registration_url}
                    alt="Registration Document"
                    fill
                    className="object-cover"
                    onError={() => setRegistrationImageError(true)}
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <FileText className="h-8 w-8" />
                  </div>
                )}
              </div>
              <a
                href={vehicle.registration_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                <FileText className="h-4 w-4 mr-1" />
                View Full Document
              </a>
            </div>
          )}
          {!vehicle.vehicle_photo_url && !vehicle.registration_url && (
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Car className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No images available</p>
              </div>
            </div>
          )}
        </div>

        {/* Vehicle Information */}
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Car className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {vehicle.make} {vehicle.model}
                  </h3>
                  <p className="text-sm text-gray-500">Vehicle ID: {vehicle.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {vehicle.is_primary && (
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    Primary Vehicle
                  </span>
                )}
                {vehicle.is_active ? (
                  <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Basic Information</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">License Plate</p>
                  <p className="text-sm font-medium text-gray-900">{vehicle.license_plate}</p>
                </div>
                {vehicle.year && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Year</p>
                    <p className="text-sm font-medium text-gray-900">{vehicle.year}</p>
                  </div>
                )}
                {vehicle.color && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Color</p>
                    <p className="text-sm font-medium text-gray-900">{vehicle.color}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Passenger Capacity</p>
                  <p className="text-sm font-medium text-gray-900">{vehicle.passenger_capacity} passengers</p>
                </div>
              </div>
            </div>

            {/* Registration & Insurance */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Registration & Insurance</h4>
              <div className="space-y-3">
                {vehicle.registration_number && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Registration Number</p>
                    <p className="text-sm font-medium text-gray-900">{vehicle.registration_number}</p>
                  </div>
                )}
                {vehicle.registration_expiry && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Registration Expiry</p>
                    <p className={`text-sm font-medium ${
                      new Date(vehicle.registration_expiry) < new Date()
                        ? 'text-red-600'
                        : new Date(vehicle.registration_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        ? 'text-yellow-600'
                        : 'text-gray-900'
                    }`}>
                      {format(new Date(vehicle.registration_expiry), 'MMM dd, yyyy')}
                      {new Date(vehicle.registration_expiry) < new Date() && (
                        <span className="ml-2 text-xs text-red-600">(Expired)</span>
                      )}
                      {new Date(vehicle.registration_expiry) >= new Date() && 
                       new Date(vehicle.registration_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                        <span className="ml-2 text-xs text-yellow-600">(Expiring Soon)</span>
                      )}
                    </p>
                  </div>
                )}
                {vehicle.insurance_expiry && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Insurance Expiry</p>
                    <p className={`text-sm font-medium ${
                      new Date(vehicle.insurance_expiry) < new Date()
                        ? 'text-red-600'
                        : new Date(vehicle.insurance_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        ? 'text-yellow-600'
                        : 'text-gray-900'
                    }`}>
                      {format(new Date(vehicle.insurance_expiry), 'MMM dd, yyyy')}
                      {new Date(vehicle.insurance_expiry) < new Date() && (
                        <span className="ml-2 text-xs text-red-600">(Expired)</span>
                      )}
                      {new Date(vehicle.insurance_expiry) >= new Date() && 
                       new Date(vehicle.insurance_expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                        <span className="ml-2 text-xs text-yellow-600">(Expiring Soon)</span>
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Created At</p>
                  <p className="text-sm font-medium text-gray-900">
                    {format(new Date(vehicle.created_at), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendSmsModal({
  driver,
  onClose,
}: {
  driver: DriverWithDetails
  onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const phoneNumber = (driver as any).user?.phone_number
      if (!phoneNumber) throw new Error('Driver has no phone number on record')

      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ to: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`, message }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to send SMS')

      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to send SMS')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Send SMS</h2>
        <p className="text-sm text-gray-500 mb-4">
          To: {(driver as any).user?.full_name} &mdash; {(driver as any).user?.phone_number || 'No phone number'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Type your message..."
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">SMS sent successfully!</p>
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
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || success}
            >
              {isSubmitting ? 'Sending...' : 'Send SMS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SendPushNotificationModal({
  driver,
  onClose,
}: {
  driver: DriverWithDetails
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dataJson, setDataJson] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const userId = (driver as any).user_id
      if (!userId) throw new Error('Driver has no user ID on record')

      const trimmedData = dataJson.trim()
      if (trimmedData) {
        try {
          const parsed = JSON.parse(trimmedData)
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Data must be a JSON object')
          }
        } catch (parseErr) {
          throw new Error(
            parseErr instanceof SyntaxError ? 'Data must be valid JSON' : (parseErr as Error).message
          )
        }
      }

      const result = await sendDriverPushNotification(userId, title, body, {
        dataJson: trimmedData || undefined,
      })

      if (!result.success) {
        throw new Error(result.error || 'Driver has no registered device for push notifications')
      }

      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to send push notification')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Send Push Notification</h2>
        <p className="text-sm text-gray-500 mb-4">
          To: {(driver as any).user?.full_name || 'Driver'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Notification title..."
              required
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Notification message..."
              required
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data <span className="text-gray-400 font-normal">(optional JSON object)</span>
            </label>
            <textarea
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
              placeholder='{"screen":"home","tripId":"..."}'
            />
            <p className="mt-1 text-xs text-gray-500">
              FCM requires string values; nested objects/arrays are sent as JSON strings per key.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">Push notification sent successfully!</p>
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
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || success}
            >
              {isSubmitting ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SubscriptionUpdateModal({
  driver,
  onClose,
  onSuccess,
}: {
  driver: DriverWithDetails
  onClose: () => void
  onSuccess: () => void
}) {
  const [status, setStatus] = useState<SubscriptionStatus>(driver.subscription_status)
  const [startDate, setStartDate] = useState(
    driver.subscription_start_date
      ? driver.subscription_start_date.slice(0, 10)
      : ''
  )
  const [endDate, setEndDate] = useState(
    driver.subscription_end_date
      ? driver.subscription_end_date.slice(0, 10)
      : ''
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { error: updateError } = await (supabase.from('driver_profiles') as any)
        .update({
          subscription_status: status,
          subscription_start_date: startDate || null,
          subscription_end_date: endDate || null,
        })
        .eq('id', driver.id)

      if (updateError) throw updateError
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to update subscription')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Subscription</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subscription Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subscription Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subscription End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

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
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
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

      const driverId = driver.id
      const userId = driver.user_id

      // Update driver verification status
      const updateData: Database['public']['Tables']['driver_profiles']['Update'] = {
        verification_status: status,
      }

      if (status === 'approved') {
        updateData.verified_at = new Date().toISOString()
      }

      const { error: updateError } = await (supabase
        .from('driver_profiles') as any)
        .update(updateData)
        .eq('id', driverId)

      if (updateError) throw updateError

      // Create verification log entry
      const logData = {
        driver_id: driverId,
        admin_id: (adminUser as { id: string }).id,
        previous_status: driver.verification_status,
        new_status: status,
        admin_notes: adminNotes || null,
        rejection_reason: status === 'rejected' ? rejectionReason || null : null,
      }

      const { error: logError } = await (supabase
        .from('verification_logs') as any)
        .insert(logData)

      if (logError) throw logError

      // In-app notification + FCM push (push failure does not block status update)
      if (userId) {
        const title =
          status === 'approved'
            ? 'Verification Approved!'
            : status === 'rejected'
              ? 'Verification Rejected'
              : status === 'suspended'
                ? 'Account Suspended'
                : 'Verification Status Updated'
        const body =
          status === 'approved'
            ? 'Your driver account is now active. You can start accepting trips.'
            : status === 'rejected'
              ? 'Your verification application has been rejected. Please review the reason and resubmit.'
              : status === 'suspended'
                ? 'Your driver account has been suspended. Please contact support for more information.'
                : 'Your verification status has been updated.'

        const { error: notifError } = await (supabase.from('notifications') as any).insert({
          user_id: userId,
          title,
          body,
          notification_type: `verification_${status}`,
          is_read: false,
        })

        if (!notifError) {
          await sendDriverPushNotification(userId, title, body, {
            skipInAppNotificationInsert: true,
          })
        }
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

