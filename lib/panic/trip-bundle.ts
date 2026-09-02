import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type PanicTripBundle = {
  trip: {
    id: string
    status: string
    pickup_address: string | null
    destination_address: string | null
    completed_at: string | null
    cancelled_at: string | null
    rider_id: string | null
    driver_id: string | null
    vehicle_id: string | null
  }
  rider: {
    profileId: string
    userId: string
    fullName: string
    phone: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
  } | null
  driver: {
    profileId: string
    userId: string
    fullName: string
    phone: string | null
  } | null
  vehicle: {
    make: string | null
    model: string | null
    color: string | null
    licensePlate: string | null
  } | null
}

type UserBits = { id: string; full_name: string; phone_number: string | null } | null

/**
 * Loads a trip plus the people and vehicle on it in as few queries as
 * possible. Remember `trips.rider_id` / `trips.driver_id` are PROFILE ids.
 */
export async function loadPanicTripBundle(
  service: SupabaseClient<Database>,
  tripId: string
): Promise<PanicTripBundle | null> {
  const { data: trip, error } = await service
    .from('trips')
    .select(
      'id, status, pickup_address, destination_address, completed_at, cancelled_at, rider_id, driver_id, vehicle_id'
    )
    .eq('id', tripId)
    .maybeSingle()
  if (error || !trip) return null

  const [riderRes, driverRes] = await Promise.all([
    trip.rider_id
      ? service
          .from('rider_profiles')
          .select('id, user_id, emergency_contact_name, emergency_contact_phone')
          .eq('id', trip.rider_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    trip.driver_id
      ? service.from('driver_profiles').select('id, user_id').eq('id', trip.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const riderProfile = riderRes.data
  const driverProfile = driverRes.data

  const userIds = [riderProfile?.user_id, driverProfile?.user_id].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  )
  const usersById = new Map<string, NonNullable<UserBits>>()
  if (userIds.length > 0) {
    const { data: users } = await service
      .from('users')
      .select('id, full_name, phone_number')
      .in('id', userIds)
    for (const u of users ?? []) usersById.set(u.id, u)
  }

  let vehicleRow:
    | { make: string; model: string; color: string | null; license_plate: string }
    | null = null
  if (trip.vehicle_id) {
    const { data } = await service
      .from('vehicles')
      .select('make, model, color, license_plate')
      .eq('id', trip.vehicle_id)
      .maybeSingle()
    vehicleRow = data ?? null
  }
  if (!vehicleRow && trip.driver_id) {
    const { data } = await service
      .from('vehicles')
      .select('make, model, color, license_plate')
      .eq('driver_id', trip.driver_id)
      .order('is_primary', { ascending: false })
      .order('is_active', { ascending: false })
      .limit(1)
      .maybeSingle()
    vehicleRow = data ?? null
  }

  const riderUser = riderProfile?.user_id ? usersById.get(riderProfile.user_id) ?? null : null
  const driverUser = driverProfile?.user_id ? usersById.get(driverProfile.user_id) ?? null : null

  return {
    trip,
    rider:
      riderProfile && riderUser
        ? {
            profileId: riderProfile.id,
            userId: riderUser.id,
            fullName: riderUser.full_name,
            phone: riderUser.phone_number,
            emergencyContactName: riderProfile.emergency_contact_name,
            emergencyContactPhone: riderProfile.emergency_contact_phone,
          }
        : null,
    driver:
      driverProfile && driverUser
        ? {
            profileId: driverProfile.id,
            userId: driverUser.id,
            fullName: driverUser.full_name,
            phone: driverUser.phone_number,
          }
        : null,
    vehicle: vehicleRow
      ? {
          make: vehicleRow.make,
          model: vehicleRow.model,
          color: vehicleRow.color,
          licensePlate: vehicleRow.license_plate,
        }
      : null,
  }
}
