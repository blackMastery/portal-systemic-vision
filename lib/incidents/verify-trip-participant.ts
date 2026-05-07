import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Returns true if the given app user is the driver or rider on the trip
 * (driver_profiles.id / rider_profiles.id match trips.driver_id / trips.rider_id).
 */
export async function assertUserIsTripParticipant(
  service: SupabaseClient<Database>,
  tripId: string,
  userId: string,
  role: 'driver' | 'rider',
): Promise<boolean> {
  const { data: trip, error } = await service
    .from('trips')
    .select('id, driver_id, rider_id')
    .eq('id', tripId)
    .single()

  if (error || !trip) {
    return false
  }

  if (role === 'driver') {
    const { data: dp } = await service
      .from('driver_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    return !!(dp && trip.driver_id === dp.id)
  }

  const { data: rp } = await service
    .from('rider_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  return !!(rp && trip.rider_id === rp.id)
}
