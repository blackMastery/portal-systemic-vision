'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { sendRiderPushNotification } from './actions'
import { manuallyFlagTrip } from '../../review-queue/actions'
import Image from 'next/image'
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
  Shield,
  Users,
  UserX,
  UserCheck,
  CheckCircle,
  XCircle,
  Ban,
  ChevronRight,
  FileText,
  Flag,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { useState, useEffect, useCallback, useTransition } from 'react'
import type { RiderWithDetails, Database, VerificationStatus } from '@/types/database'

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
  verificationLogs: Array<Database['public']['Tables']['verification_logs']['Row'] & {
    admin?: Database['public']['Tables']['users']['Row']
  }>
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
    .eq('user_role', 'rider')
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

  const { data: logsData, error: logsError } = await supabase
    .from('verification_logs')
    .select(
      `
      *,
      admin:admin_id (full_name, email)
    `
    )
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })

  if (logsError) throw logsError

  return {
    rider: rider as RiderDetailData['rider'],
    trips: (tripsData || []) as RiderDetailData['trips'],
    subscriptions: (subscriptionsData || []) as RiderDetailData['subscriptions'],
    payments: (paymentsData || []) as RiderDetailData['payments'],
    verificationLogs: (logsData || []) as RiderDetailData['verificationLogs'],
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

function RiderDocumentPreview({
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

function IdCardFromStoragePath({ path, title }: { path: string | null | undefined; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (storagePath: string) => {
    setLoading(true)
    setErr(null)
    setUrl(null)
    try {
      const supabase = createClient()
      const { data, error: signError } = await supabase.storage
        .from('rider_docs')
        .createSignedUrl(storagePath.trim(), 3600)
      if (signError) throw signError
      if (data?.signedUrl) setUrl(data.signedUrl)
      else setErr('Could not create link')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!path?.trim()) {
      setUrl(null)
      setErr(null)
      return
    }
    void load(path)
  }, [path, load])

  if (!path?.trim()) {
    return <RiderDocumentPreview url={null} title={title} />
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900 mb-1">{title}</p>
        <p className="text-sm text-gray-500">Loading preview…</p>
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-gray-900 mb-1">{title}</p>
        <p className="text-sm text-red-700">{err}</p>
      </div>
    )
  }

  return <RiderDocumentPreview url={url} title={title} />
}

async function fetchNextPendingRider(currentCreatedAt: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = (await supabase
    .from('rider_profiles')
    .select('id')
    .eq('verification_status', 'pending')
    .lt('created_at', currentCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: { message: string } | null }

  if (error) throw error
  return data?.id ?? null
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
  const router = useRouter()
  const riderId = params.id as string
  const queryClient = useQueryClient()
  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [flaggingTripId, setFlaggingTripId] = useState<string | null>(null)
  const [flagOutcome, setFlagOutcome] = useState<
    Record<string, 'flagged' | 'already' | 'error'>
  >({})
  const [, startFlagTransition] = useTransition()

  const handleManualFlag = useCallback(
    (tripId: string) => {
      setFlaggingTripId(tripId)
      startFlagTransition(async () => {
        const result = await manuallyFlagTrip(tripId)
        setFlaggingTripId(null)
        if (result.success) {
          setFlagOutcome((prev) => ({ ...prev, [tripId]: 'flagged' }))
          await queryClient.invalidateQueries({
            queryKey: ['review-queue-open-count'],
          })
        } else if (result.alreadyFlagged) {
          setFlagOutcome((prev) => ({ ...prev, [tripId]: 'already' }))
        } else {
          setFlagOutcome((prev) => ({ ...prev, [tripId]: 'error' }))
        }
      })
    },
    [queryClient],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['rider-detail', riderId],
    queryFn: () => fetchRiderDetail(riderId),
    enabled: !!riderId,
  })

  const nextPendingQuery = useQuery({
    queryKey: ['next-pending-rider', riderId, data?.rider.created_at],
    queryFn: () => fetchNextPendingRider(data!.rider.created_at),
    enabled: !!data?.rider.created_at,
    staleTime: 30_000,
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

  const { rider, trips, subscriptions, payments, verificationLogs } = data

  async function handleToggleActive(newActive: boolean) {
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await (supabase.from('users') as any)
        .update({ is_active: newActive })
        .eq('id', rider.user_id)

      if (updateError) throw updateError
      await queryClient.invalidateQueries({ queryKey: ['rider-detail', riderId] })
      await queryClient.invalidateQueries({ queryKey: ['riders'] })
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : 'Failed to update account status')
    } finally {
      setIsTogglingActive(false)
    }
  }

  const isTrialExpiringSoon = rider.subscription_status === 'trial' && 
    rider.trial_end_date && 
    new Date(rider.trial_end_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
    new Date(rider.trial_end_date) > new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Link
            href="/admin/riders"
            className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">
              {rider.user?.full_name || 'Rider Details'}
            </h1>
            <p className="mt-1 text-sm text-gray-600 break-all">Rider ID: {rider.id}</p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end xl:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {nextPendingQuery.isLoading ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-600 opacity-70 cursor-not-allowed sm:px-4 sm:py-2 sm:text-sm"
              >
                <div className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-yellow-500 sm:mr-2 sm:h-4 sm:w-4" />
                Loading...
              </button>
            ) : nextPendingQuery.data ? (
              <button
                type="button"
                onClick={() => router.push(`/admin/riders/${nextPendingQuery.data}`)}
                className="inline-flex items-center rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-800 transition-colors hover:bg-yellow-100 sm:px-4 sm:py-2 sm:text-sm"
              >
                <ChevronRight className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                Next Pending
              </button>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm ${
                verificationBadgeColors[rider.verification_status]
              }`}
            >
              {rider.verification_status}
            </span>
            <button
              type="button"
              onClick={() => setShowVerificationModal(true)}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:px-4 sm:py-2 sm:text-sm"
            >
              <Edit className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
              Update Verification
            </button>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium sm:px-3 sm:py-1.5 sm:text-sm ${
                subscriptionBadgeColors[rider.subscription_status]
              }`}
            >
              {rider.subscription_status}
            </span>
            {isTrialExpiringSoon && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800 sm:px-3 sm:py-1.5 sm:text-sm">
                <Clock className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                Trial Expiring Soon
              </span>
            )}
          </div>
          {rider.user_id && (
            <div className="flex flex-col items-end gap-1">
              {rider.user?.is_active ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Deactivate this rider? They will not be able to sign in.')) {
                      handleToggleActive(false)
                    }
                  }}
                  disabled={isTogglingActive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <UserX className="h-4 w-4" />
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleActive(true)}
                  disabled={isTogglingActive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <UserCheck className="h-4 w-4" />
                  Reactivate
                </button>
              )}
              {toggleError && (
                <p className="text-sm text-red-600" role="alert">
                  {toggleError}
                </p>
              )}
            </div>
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
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Verification</p>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  verificationBadgeColors[rider.verification_status]
                }`}
              >
                {rider.verification_status}
              </span>
            </div>
          </div>
          {rider.verified_at && (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Clock className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Verified at</p>
                <p className="text-base font-medium text-gray-900">
                  {format(new Date(rider.verified_at), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Identity & documents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Identity &amp; documents</h2>
        <p className="text-sm text-gray-500 mb-4">
          Profile photo (account). ID card (setup wizard) — private file; link expires after one hour.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <RiderDocumentPreview url={rider.user?.profile_photo_url} title="Profile photo" />
          <IdCardFromStoragePath path={rider.id_card_storage_path} title="National ID" />
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

      {/* Verification History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Verification history</h2>
        {verificationLogs.length > 0 ? (
          <div className="space-y-4">
            {verificationLogs.map((log) => {
              const Icon = verificationIcons[log.new_status as VerificationStatus] || AlertCircle
              return (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        log.new_status === 'approved'
                          ? 'bg-green-100'
                          : log.new_status === 'rejected'
                            ? 'bg-red-100'
                            : log.new_status === 'suspended'
                              ? 'bg-gray-100'
                              : 'bg-yellow-100'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          log.new_status === 'approved'
                            ? 'text-green-600'
                            : log.new_status === 'rejected'
                              ? 'text-red-600'
                              : log.new_status === 'suspended'
                                ? 'text-gray-600'
                                : 'text-yellow-600'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            Status changed from{' '}
                            <span className="text-gray-600">{log.previous_status || 'N/A'}</span> to{' '}
                            <span
                              className={`font-semibold ${
                                log.new_status === 'approved'
                                  ? 'text-green-600'
                                  : log.new_status === 'rejected'
                                    ? 'text-red-600'
                                    : log.new_status === 'suspended'
                                      ? 'text-gray-600'
                                      : 'text-yellow-600'
                              }`}
                            >
                              {log.new_status}
                            </span>
                          </p>
                          {log.admin && (
                            <p className="text-sm text-gray-500 mt-1">
                              By {log.admin.full_name}{' '}
                              {log.admin.email ? `(${log.admin.email})` : ''}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 shrink-0">
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
                          <span className="font-medium">Rejection reason:</span> {log.rejection_reason}
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

      {/* Ratings & Feedback */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Ratings &amp; Feedback</h2>
        <p className="text-sm text-gray-500 mb-4">
          Most recent ratings drivers have left for this rider.
        </p>
        {(() => {
          const ratedTrips = trips
            .filter((t) => (t as { rider_rating: number | null }).rider_rating != null)
            .slice(0, 10)
          if (ratedTrips.length === 0) {
            return (
              <p className="text-gray-500 text-center py-8">
                No driver-submitted ratings yet
              </p>
            )
          }
          return (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Feedback</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ratedTrips.map((trip) => {
                    const t = trip as typeof trip & {
                      rider_rating: number | null
                      rider_feedback: string | null
                    }
                    const outcome = flagOutcome[t.id]
                    const flagging = flaggingTripId === t.id
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {format(
                            new Date(t.completed_at ?? t.requested_at),
                            'MMM dd, yyyy',
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {t.driver?.user ? (
                            <span className="text-gray-900">
                              {t.driver.user.full_name}
                            </span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className="inline-flex items-center gap-0.5"
                            aria-label={`${t.rider_rating} out of 5`}
                          >
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < (t.rider_rating ?? 0)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-300'
                                }`}
                                aria-hidden
                              />
                            ))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                          <div
                            className="truncate"
                            title={t.rider_feedback ?? ''}
                          >
                            {t.rider_feedback || (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {outcome === 'flagged' ? (
                            <span className="inline-flex items-center text-xs text-green-700">
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              Flagged
                            </span>
                          ) : outcome === 'already' ? (
                            <span className="inline-flex items-center text-xs text-gray-500">
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              Already in queue
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleManualFlag(t.id)}
                              disabled={flagging}
                              className="inline-flex items-center px-2.5 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
                            >
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              {flagging ? 'Flagging…' : 'Flag for follow-up'}
                            </button>
                          )}
                          {outcome === 'error' && (
                            <p className="mt-1 text-xs text-red-600">
                              Failed to flag. Try again.
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}
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

      {showVerificationModal && (
        <RiderVerificationUpdateModal
          rider={rider}
          onClose={() => setShowVerificationModal(false)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['rider-detail', riderId] })
            void queryClient.invalidateQueries({ queryKey: ['next-pending-rider'] })
            void queryClient.invalidateQueries({ queryKey: ['riders'] })
            setShowVerificationModal(false)
          }}
        />
      )}
    </div>
  )
}

function RiderVerificationUpdateModal({
  rider,
  onClose,
  onSuccess,
}: {
  rider: RiderWithDetails & { user: Database['public']['Tables']['users']['Row'] }
  onClose: () => void
  onSuccess: () => void
}) {
  const [status, setStatus] = useState<VerificationStatus>(rider.verification_status)
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

      const updateData: Database['public']['Tables']['rider_profiles']['Update'] = {
        verification_status: status,
      }

      if (status === 'approved') {
        updateData.verified_at = new Date().toISOString()
      }

      const { error: updateError } = await (supabase.from('rider_profiles') as any)
        .update(updateData)
        .eq('id', rider.id)

      if (updateError) throw updateError

      const { error: logError } = await (supabase.from('verification_logs') as any).insert({
        rider_id: rider.id,
        admin_id: (adminUser as { id: string }).id,
        previous_status: rider.verification_status,
        new_status: status,
        admin_notes: adminNotes || null,
        rejection_reason: status === 'rejected' ? rejectionReason || null : null,
        driver_id: null,
      })

      if (logError) throw logError

      const userId = rider.user_id
      if (userId) {
        const title =
          status === 'approved'
            ? 'Verification approved'
            : status === 'rejected'
              ? 'Verification rejected'
              : status === 'suspended'
                ? 'Account suspended'
                : 'Verification status updated'
        const body =
          status === 'approved'
            ? 'Your rider account verification is complete. You can use trip requests as usual.'
            : status === 'rejected'
              ? 'Your identity verification was rejected. Please review the reason and resubmit your documents.'
              : status === 'suspended'
                ? 'Your rider account has been suspended. Please contact support for more information.'
                : 'Your verification status has been updated.'

        const { error: notifError } = await (supabase.from('notifications') as any).insert({
          user_id: userId,
          title,
          body,
          notification_type: `verification_${status}`,
          is_read: false,
        })

        if (!notifError) {
          await sendRiderPushNotification(userId, title, body, {
            skipInAppNotificationInsert: true,
          })
        }
      }

      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update verification status')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Update verification status</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Verification status</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Admin notes (optional)</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add any notes about this verification status change…"
            />
          </div>

          {status === 'rejected' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rejection reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Explain why the verification was rejected…"
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
              {isSubmitting ? 'Updating…' : 'Update status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

