-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.driver_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE,
  verification_status USER-DEFINED DEFAULT 'pending'::verification_status,
  verified_at timestamp with time zone,
  subscription_status USER-DEFINED DEFAULT 'expired'::subscription_status,
  subscription_start_date timestamp with time zone,
  subscription_end_date timestamp with time zone,
  monthly_fee_amount numeric DEFAULT 0,
  national_id_url text,
  drivers_license_url text,
  drivers_license_number character varying,
  drivers_license_expiry date,
  is_online boolean DEFAULT false,
  is_available boolean DEFAULT false,
  current_location USER-DEFINED,
  location_updated_at timestamp with time zone,
  total_trips integer DEFAULT 0,
  rating_average numeric DEFAULT 5.0,
  rating_count integer DEFAULT 0,
  acceptance_rate numeric DEFAULT 100.0,
  mmg_account_number character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT driver_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT driver_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.location_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  trip_id uuid,
  driver_id uuid,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  location USER-DEFINED,
  accuracy_meters numeric,
  speed_kmh numeric,
  heading numeric,
  recorded_at timestamp with time zone DEFAULT now(),
  device_id text,
  is_online boolean DEFAULT true,
  CONSTRAINT location_history_pkey PRIMARY KEY (id),
  CONSTRAINT location_history_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id),
  CONSTRAINT location_history_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  title character varying NOT NULL,
  body text NOT NULL,
  notification_type character varying NOT NULL,
  related_entity_type character varying,
  related_entity_id uuid,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  push_sent boolean DEFAULT false,
  push_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.payment_transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  subscription_id uuid,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'GYD'::character varying,
  payment_method character varying NOT NULL,
  mmg_transaction_id character varying,
  mmg_reference character varying,
  mmg_phone_number character varying,
  status USER-DEFINED NOT NULL,
  gateway_response jsonb,
  error_message text,
  initiated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT payment_transactions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id)
);
CREATE TABLE public.rider_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE,
  subscription_status USER-DEFINED DEFAULT 'trial'::subscription_status,
  subscription_start_date timestamp with time zone,
  subscription_end_date timestamp with time zone,
  trial_end_date timestamp with time zone,
  total_trips integer DEFAULT 0,
  rating_average numeric DEFAULT 5.0,
  rating_count integer DEFAULT 0,
  emergency_contact_name character varying,
  emergency_contact_phone character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rider_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT rider_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.spatial_ref_sys (
  srid integer NOT NULL CHECK (srid > 0 AND srid <= 998999),
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  user_role USER-DEFINED NOT NULL,
  plan_type character varying NOT NULL,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'GYD'::character varying,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  status USER-DEFINED NOT NULL,
  payment_method character varying,
  payment_reference character varying,
  payment_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.system_config (
  key character varying NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  CONSTRAINT system_config_pkey PRIMARY KEY (key),
  CONSTRAINT system_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.trip_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  rider_id uuid,
  pickup_latitude numeric NOT NULL,
  pickup_longitude numeric NOT NULL,
  pickup_address text NOT NULL,
  pickup_location USER-DEFINED,
  destination_latitude numeric NOT NULL,
  destination_longitude numeric NOT NULL,
  destination_address text NOT NULL,
  destination_location USER-DEFINED,
  trip_type USER-DEFINED NOT NULL,
  estimated_distance_km numeric,
  estimated_duration_minutes integer,
  estimated_fare numeric,
  notes text,
  passenger_count integer DEFAULT 1,
  status USER-DEFINED DEFAULT 'requested'::trip_status,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trip_requests_pkey PRIMARY KEY (id),
  CONSTRAINT trip_requests_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider_profiles(id)
);
CREATE TABLE public.trips (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  rider_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  request_id uuid,
  pickup_latitude numeric NOT NULL,
  pickup_longitude numeric NOT NULL,
  pickup_address text NOT NULL,
  destination_latitude numeric NOT NULL,
  destination_longitude numeric NOT NULL,
  destination_address text NOT NULL,
  trip_type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL,
  estimated_distance_km numeric,
  actual_distance_km numeric,
  estimated_duration_minutes integer,
  actual_duration_minutes integer,
  estimated_fare numeric,
  actual_fare numeric,
  currency character varying DEFAULT 'GYD'::character varying,
  payment_method character varying DEFAULT 'cash'::character varying,
  route_polyline text,
  route_waypoints jsonb,
  requested_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  driver_arrived_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancellation_reason text,
  is_night_trip boolean DEFAULT false,
  rider_rating integer CHECK (rider_rating >= 1 AND rider_rating <= 5),
  driver_rating integer CHECK (driver_rating >= 1 AND driver_rating <= 5),
  rider_feedback text,
  driver_feedback text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT trips_pkey PRIMARY KEY (id),
  CONSTRAINT trips_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider_profiles(id),
  CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
  CONSTRAINT trips_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id),
  CONSTRAINT trips_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.trip_requests(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  auth_id uuid UNIQUE,
  phone_number character varying NOT NULL UNIQUE,
  email character varying UNIQUE,
  full_name character varying NOT NULL,
  profile_photo_url text,
  role USER-DEFINED NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone,
  preferred_language character varying DEFAULT 'en'::character varying,
  notification_enabled boolean DEFAULT true,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id)
);
CREATE TABLE public.vehicles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  driver_id uuid,
  make character varying NOT NULL,
  model character varying NOT NULL,
  year integer,
  color character varying,
  license_plate character varying NOT NULL UNIQUE,
  vehicle_photo_url text,
  registration_url text,
  registration_number character varying,
  registration_expiry date,
  insurance_expiry date,
  is_active boolean DEFAULT true,
  is_primary boolean DEFAULT false,
  passenger_capacity integer DEFAULT 4,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id)
);
CREATE TABLE public.verification_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  driver_id uuid,
  admin_id uuid,
  previous_status USER-DEFINED,
  new_status USER-DEFINED NOT NULL,
  admin_notes text,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT verification_logs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
  CONSTRAINT verification_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);






-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users: Can read own profile, admins can read all
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = auth_id);

-- Rider Profiles: Riders can read own, drivers can read during trips
CREATE POLICY "Riders can view own profile" ON rider_profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = rider_profiles.user_id AND users.auth_id = auth.uid())
    );

-- Driver Profiles: Drivers can read own, riders can see during active trips
CREATE POLICY "Drivers can view own profile" ON driver_profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = driver_profiles.user_id AND users.auth_id = auth.uid())
    );

CREATE POLICY "Drivers can update own profile" ON driver_profiles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = driver_profiles.user_id AND users.auth_id = auth.uid())
    );

-- Trip Requests: Riders see own, drivers see active requests
CREATE POLICY "Riders can view own trip requests" ON trip_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rider_profiles rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.id = trip_requests.rider_id AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Verified drivers can view active requests" ON trip_requests
    FOR SELECT USING (
        status = 'requested' 
        AND EXISTS (
            SELECT 1 FROM driver_profiles dp
            JOIN users u ON u.id = dp.user_id
            WHERE u.auth_id = auth.uid()
            AND dp.verification_status = 'approved'
            AND dp.subscription_status IN ('active', 'trial')
        )
    );

-- Trips: Parties can view their own trips
CREATE POLICY "Users can view own trips" ON trips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            LEFT JOIN rider_profiles rp ON rp.user_id = u.id
            LEFT JOIN driver_profiles dp ON dp.user_id = u.id
            WHERE u.auth_id = auth.uid()
            AND (trips.rider_id = rp.id OR trips.driver_id = dp.id)
        )
    );

-- Notifications: Users can view own notifications
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = notifications.user_id AND users.auth_id = auth.uid())
    );

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = notifications.user_id AND users.auth_id = auth.uid())
    );