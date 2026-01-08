export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'rider' | 'driver' | 'admin'
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial'
export type TripStatus = 'requested' | 'accepted' | 'picked_up' | 'completed' | 'cancelled'
export type TripType = 'airport' | 'short_drop' | 'market' | 'other'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          auth_id: string | null
          phone_number: string
          email: string | null
          full_name: string
          profile_photo_url: string | null
          role: UserRole
          is_active: boolean
          created_at: string
          updated_at: string
          last_seen_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      rider_profiles: {
        Row: {
          id: string
          user_id: string
          subscription_status: SubscriptionStatus
          subscription_start_date: string | null
          subscription_end_date: string | null
          trial_end_date: string | null
          total_trips: number
          rating_average: number
          rating_count: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['rider_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['rider_profiles']['Insert']>
      }
      driver_profiles: {
        Row: {
          id: string
          user_id: string
          verification_status: VerificationStatus
          verified_at: string | null
          subscription_status: SubscriptionStatus
          subscription_start_date: string | null
          subscription_end_date: string | null
          national_id_url: string | null
          drivers_license_url: string | null
          drivers_license_number: string | null
          drivers_license_expiry: string | null
          is_online: boolean
          is_available: boolean
          current_location: unknown // PostGIS geography type
          location_updated_at: string | null
          total_trips: number
          rating_average: number
          rating_count: number
          acceptance_rate: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['driver_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['driver_profiles']['Insert']>
      }
      vehicles: {
        Row: {
          id: string
          driver_id: string
          make: string
          model: string
          year: number | null
          color: string | null
          license_plate: string
          vehicle_photo_url: string | null
          registration_url: string | null
          is_active: boolean
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['vehicles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['vehicles']['Insert']>
      }
      trips: {
        Row: {
          id: string
          rider_id: string | null
          driver_id: string | null
          vehicle_id: string | null
          pickup_latitude: number
          pickup_longitude: number
          pickup_address: string
          destination_latitude: number
          destination_longitude: number
          destination_address: string
          trip_type: TripType
          status: TripStatus
          estimated_distance_km: number | null
          actual_distance_km: number | null
          estimated_duration_minutes: number | null
          actual_duration_minutes: number | null
          estimated_fare: number | null
          actual_fare: number | null
          requested_at: string
          accepted_at: string | null
          picked_up_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          is_night_trip: boolean
          rider_rating: number | null
          driver_rating: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['trips']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['trips']['Insert']>
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          user_role: UserRole
          plan_type: string
          amount: number
          currency: string
          start_date: string
          end_date: string
          status: SubscriptionStatus
          payment_method: string | null
          payment_reference: string | null
          payment_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
      }
      payment_transactions: {
        Row: {
          id: string
          user_id: string | null
          subscription_id: string | null
          amount: number
          currency: string
          payment_method: string
          status: PaymentStatus
          mmg_transaction_id: string | null
          gateway_response: Json | null
          initiated_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['payment_transactions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['payment_transactions']['Insert']>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          body: string
          notification_type: string
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
      }
    }
    Views: {}
    Functions: {}
  }
}

// Helper types for joins
export type UserWithProfile = Database['public']['Tables']['users']['Row'] & {
  rider_profile?: Database['public']['Tables']['rider_profiles']['Row']
  driver_profile?: Database['public']['Tables']['driver_profiles']['Row']
}

export type DriverWithDetails = Database['public']['Tables']['driver_profiles']['Row'] & {
  user: Database['public']['Tables']['users']['Row']
  vehicle?: Database['public']['Tables']['vehicles']['Row'][]
}

export type RiderWithDetails = Database['public']['Tables']['rider_profiles']['Row'] & {
  user: Database['public']['Tables']['users']['Row']
}

export type TripWithDetails = Database['public']['Tables']['trips']['Row'] & {
  rider?: {
    id: string
    user: Database['public']['Tables']['users']['Row']
  }
  driver?: {
    id: string
    user: Database['public']['Tables']['users']['Row']
  }
  vehicle?: Database['public']['Tables']['vehicles']['Row']
}
