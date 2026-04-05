'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft,
  MapPin,
  User,
  Car,
  DollarSign,
  Clock,
  Star,
  Moon,
  AlertCircle,
  Phone,
  Route,
  FileText,
  Navigation,
  CheckCircle,
  XCircle,
  Ban,
  Users,
  CreditCard,
} from 'lucide-react'
import type { Database, TripType, TripStatus } from '@/types/database'
import { TripRouteMap } from '@/components/drivers/trip-route-map'
import type { TripRoutePoint } from '@/components/drivers/trip-route-map'

// Extended row types to cover DB columns not yet in the TS type
type TripRow = Database['public']['Tables']['trips']['Row'] & {
  request_id?: string | null
  currency?: string | null
  payment_method?: string | null
  driver_arrived_at?: string | null
  cancelled_by_user_id?: string | null
  completed_latitude?: number | null
  completed_longitude?: number | null
  rider_feedback?: string | null
  driver_feedback?: string | null
  driver_rating_friendly?: number | null
  driver_rating_clean?: number | null
  driver_rating_safe?: number | null
  driver_rating_communicated_fairly?: number | null
}

type TripDetailData = {
  trip: TripRow & {
    rider: { id: string; user: Database['public']['Tables']['users']['Row'] } | null
    driver: { id: string; user: Database['public']['Tables']['users']['Row'] } | null
    vehicle: Database['public']['Tables']['vehicles']['Row'] | null
    trip_request: Database['public']['Tables']['trip_requests']['Row'] | null
    cancelled_by_user: Database['public']['Tables']['users']['Row'] | null
  }
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

async function fetchTripDetail(tripId: string): Promise<TripDetailData> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      rider:rider_id (
        id,
        user:user_id (*)
      ),
      driver:driver_id (
        id,
        user:user_id (*)
      ),
      vehicle:vehicle_id (*),
      trip_request:request_id (*),
      cancelled_by_user:cancelled_by_user_id (*)
    `)
    .eq('id', tripId)
    .single()

  if (error) throw error
  if (!data) throw new Error('Trip not found')

  return { trip: data as TripDetailData['trip'] }
}

const statusColors: Record<TripStatus, string> = {
  requested: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

const tripTypeColors: Record<TripType, string> = {
  airport: 'bg-indigo-100 text-indigo-800',
  short_drop: 'bg-blue-100 text-blue-800',
  market: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-800',
}

function StarRating({ value, label }: { value: number | null | undefined; label: string }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 w-40">{label}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-4 w-4 ${n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
          />
        ))}
        <span className="ml-1 text-sm font-medium text-gray-700">{value}/5</span>
      </div>
    </div>
  )
}

function TimelineItem({
  label,
  timestamp,
  icon: Icon,
  color,
  isLast,
}: {
  label: string
  timestamp: string | null | undefined
  icon: React.ElementType
  color: string
  isLast?: boolean
}) {
  if (!timestamp) return null
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`p-2 rounded-full ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
      </div>
      <div className="pb-4">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          {format(new Date(timestamp), 'MMM d, yyyy • h:mm:ss a')}
        </p>
      </div>
    </div>
  )
}

export default function TripDetailPage() {
  const params = useParams()
  const tripId = params.id as string

  const { data, isLoading, error } = useQuery({
    queryKey: ['trip-detail', tripId],
    queryFn: () => fetchTripDetail(tripId),
    enabled: !!tripId,
  })

  const { data: routePoints = [], isLoading: isLoadingRoute } = useQuery({
    queryKey: ['trip-route', tripId],
    queryFn: () => fetchTripRoute(tripId),
    enabled: !!tripId,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading trip details...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Trip not found</p>
          <Link
            href="/admin/trips"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trips
          </Link>
        </div>
      </div>
    )
  }

  const { trip } = data

  const fare = trip.actual_fare ?? trip.estimated_fare
  const distance = trip.actual_distance_km ?? trip.estimated_distance_km
  const duration = trip.actual_duration_minutes ?? trip.estimated_duration_minutes

  // Timeline events in order
  const timelineEvents = [
    { label: 'Requested', timestamp: trip.requested_at, icon: Clock, color: 'bg-yellow-100 text-yellow-600' },
    { label: 'Accepted by Driver', timestamp: trip.accepted_at, icon: CheckCircle, color: 'bg-blue-100 text-blue-600' },
    { label: 'Driver Arrived', timestamp: trip.driver_arrived_at, icon: Navigation, color: 'bg-purple-100 text-purple-600' },
    { label: 'Picked Up', timestamp: trip.picked_up_at, icon: Users, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Completed', timestamp: trip.completed_at, icon: CheckCircle, color: 'bg-green-100 text-green-600' },
    { label: 'Cancelled', timestamp: trip.cancelled_at, icon: XCircle, color: 'bg-red-100 text-red-600' },
  ].filter((e) => !!e.timestamp)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/trips" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trip Details</h1>
            <p className="mt-1 text-sm text-gray-500 font-mono">{trip.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trip.is_night_trip && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
              <Moon className="h-4 w-4 mr-1.5" />
              Night Trip
            </span>
          )}
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${tripTypeColors[trip.trip_type]}`}>
            {trip.trip_type.replace('_', ' ')}
          </span>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${statusColors[trip.status]}`}>
            {trip.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <DollarSign className="h-5 w-5 text-green-600" />
            <span className="text-sm text-gray-500">Fare</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {fare ? `${trip.currency ?? 'GYD'} ${Number(fare).toFixed(2)}` : 'N/A'}
          </p>
          {!trip.actual_fare && trip.estimated_fare && (
            <p className="text-xs text-gray-400 mt-1">Estimated</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <Route className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-gray-500">Distance</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {distance ? `${Number(distance).toFixed(2)} km` : 'N/A'}
          </p>
          {!trip.actual_distance_km && trip.estimated_distance_km && (
            <p className="text-xs text-gray-400 mt-1">Estimated</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <Clock className="h-5 w-5 text-purple-600" />
            <span className="text-sm text-gray-500">Duration</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {duration ? `${duration} min` : 'N/A'}
          </p>
          {!trip.actual_duration_minutes && trip.estimated_duration_minutes && (
            <p className="text-xs text-gray-400 mt-1">Estimated</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <CreditCard className="h-5 w-5 text-orange-600" />
            <span className="text-sm text-gray-500">Payment</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 capitalize">
            {trip.payment_method ?? 'Cash'}
          </p>
        </div>
      </div>

      {/* Route */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gray-500" />
          Route
        </h2>
        <TripRouteMap
          trip={trip}
          routePoints={routePoints}
          isLoadingRoute={isLoadingRoute}
          showTripInfo={false}
        />
      </div>

      {/* Participants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rider */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-gray-500" />
            Rider
          </h2>
          {trip.rider?.user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{trip.rider.user.full_name}</p>
                  <p className="text-sm text-gray-500">{trip.rider.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                {trip.rider.user.phone_number}
              </div>
              <Link
                href={`/admin/riders/${trip.rider.id}`}
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                View rider profile →
              </Link>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No rider assigned</p>
          )}
        </div>

        {/* Driver */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Car className="h-5 w-5 text-gray-500" />
            Driver
          </h2>
          {trip.driver?.user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Car className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{trip.driver.user.full_name}</p>
                  <p className="text-sm text-gray-500">{trip.driver.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                {trip.driver.user.phone_number}
              </div>
              <Link
                href={`/admin/drivers/${trip.driver.id}`}
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                View driver profile →
              </Link>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No driver assigned</p>
          )}
        </div>
      </div>

      {/* Vehicle */}
      {trip.vehicle && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Car className="h-5 w-5 text-gray-500" />
            Vehicle
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-gray-500 mb-1">Make & Model</p>
              <p className="text-sm font-medium text-gray-900">
                {trip.vehicle.make} {trip.vehicle.model}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">License Plate</p>
              <p className="text-sm font-medium text-gray-900">{trip.vehicle.license_plate}</p>
            </div>
            {trip.vehicle.color && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Color</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{trip.vehicle.color}</p>
              </div>
            )}
            {trip.vehicle.year && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Year</p>
                <p className="text-sm font-medium text-gray-900">{trip.vehicle.year}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline & Trip Request side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            Timeline
          </h2>
          {timelineEvents.length > 0 ? (
            <div>
              {timelineEvents.map((event, i) => (
                <TimelineItem
                  key={event.label}
                  {...event}
                  isLast={i === timelineEvents.length - 1}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No timeline data</p>
          )}
        </div>

        {/* Trip Request */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
            Original Trip Request
          </h2>
          {trip.trip_request ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Request ID</p>
                <p className="text-xs font-mono text-gray-700">{trip.trip_request.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[trip.trip_request.status ?? 'requested']}`}>
                    {trip.trip_request.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Passengers</p>
                  <p className="text-sm font-medium text-gray-900">{trip.trip_request.passenger_count}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Est. Fare</p>
                  <p className="text-sm font-medium text-gray-900">
                    {trip.trip_request.estimated_fare
                      ? `GYD ${Number(trip.trip_request.estimated_fare).toFixed(2)}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Est. Distance</p>
                  <p className="text-sm font-medium text-gray-900">
                    {trip.trip_request.estimated_distance_km
                      ? `${Number(trip.trip_request.estimated_distance_km).toFixed(2)} km`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Est. Duration</p>
                  <p className="text-sm font-medium text-gray-900">
                    {trip.trip_request.estimated_duration_minutes
                      ? `${trip.trip_request.estimated_duration_minutes} min`
                      : 'N/A'}
                  </p>
                </div>
                {trip.trip_request.expires_at && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Expires At</p>
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(trip.trip_request.expires_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                )}
              </div>
              {trip.trip_request.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{trip.trip_request.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 mb-1">Created</p>
                <p className="text-sm text-gray-700">
                  {format(new Date(trip.trip_request.created_at), 'MMM d, yyyy • h:mm a')}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No linked trip request</p>
          )}
        </div>
      </div>

      {/* Ratings & Feedback */}
      {(trip.rider_rating || trip.driver_rating) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-gray-500" />
            Ratings & Feedback
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Rider's rating of driver */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Rider rated Driver</p>
              <div className="space-y-2">
                <StarRating value={trip.driver_rating} label="Overall" />
                <StarRating value={trip.driver_rating_friendly} label="Friendliness" />
                <StarRating value={trip.driver_rating_clean} label="Cleanliness" />
                <StarRating value={trip.driver_rating_safe} label="Safety" />
                <StarRating value={trip.driver_rating_communicated_fairly} label="Communication" />
              </div>
              {trip.rider_feedback && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Rider&apos;s feedback</p>
                  <p className="text-sm text-gray-700">{trip.rider_feedback}</p>
                </div>
              )}
            </div>

            {/* Driver's rating of rider */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Driver rated Rider</p>
              <div className="space-y-2">
                <StarRating value={trip.rider_rating} label="Overall" />
              </div>
              {trip.driver_feedback && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Driver&apos;s feedback</p>
                  <p className="text-sm text-gray-700">{trip.driver_feedback}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Info */}
      {trip.status === 'cancelled' && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            Cancellation
          </h2>
          <div className="space-y-2">
            {trip.cancelled_at && (
              <div>
                <p className="text-xs text-red-700 mb-0.5">Cancelled at</p>
                <p className="text-sm font-medium text-red-900">
                  {format(new Date(trip.cancelled_at), 'MMM d, yyyy • h:mm:ss a')}
                </p>
              </div>
            )}
            {trip.cancelled_by_user && (
              <div>
                <p className="text-xs text-red-700 mb-0.5">Cancelled by</p>
                <p className="text-sm font-medium text-red-900">
                  {trip.cancelled_by_user.full_name} ({trip.cancelled_by_user.role})
                </p>
              </div>
            )}
            {trip.cancellation_reason && (
              <div>
                <p className="text-xs text-red-700 mb-0.5">Reason</p>
                <p className="text-sm font-medium text-red-900">{trip.cancellation_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
