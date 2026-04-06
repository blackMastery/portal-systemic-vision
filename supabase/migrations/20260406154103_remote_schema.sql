create extension if not exists "postgis" with schema "public" version '3.3.7';

create type "public"."payment_status" as enum ('pending', 'completed', 'failed', 'refunded');

create type "public"."subscription_status" as enum ('active', 'expired', 'cancelled', 'trial');

create type "public"."trip_status" as enum ('requested', 'accepted', 'picked_up', 'completed', 'cancelled');

create type "public"."trip_type" as enum ('airport', 'short_drop', 'market', 'other');

create type "public"."user_role" as enum ('rider', 'driver', 'admin');

create type "public"."verification_status" as enum ('pending', 'approved', 'rejected', 'suspended');

create table "public"."app_version_config" (
    "app_type" text not null,
    "platform" text not null,
    "version_string" text not null,
    "build_number" integer not null,
    "updated_at" timestamp with time zone not null default now(),
    "mandatory_update" boolean not null default false
);


alter table "public"."app_version_config" enable row level security;

create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "table_name" text not null,
    "record_id" uuid not null,
    "action" text not null,
    "old_data" jsonb,
    "new_data" jsonb,
    "changed_at" timestamp with time zone not null default now(),
    "actor_id" uuid
);


alter table "public"."audit_logs" enable row level security;

create table "public"."driver_profiles" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "verification_status" verification_status default 'pending'::verification_status,
    "verified_at" timestamp with time zone,
    "subscription_status" subscription_status default 'expired'::subscription_status,
    "subscription_start_date" timestamp with time zone,
    "subscription_end_date" timestamp with time zone,
    "monthly_fee_amount" numeric(10,2) default 0,
    "national_id_url" text,
    "drivers_license_url" text,
    "drivers_license_number" character varying(50),
    "drivers_license_expiry" date,
    "is_online" boolean default false,
    "is_available" boolean default false,
    "current_location" geography(Point,4326),
    "location_updated_at" timestamp with time zone,
    "total_trips" integer default 0,
    "rating_average" numeric(3,2) default 5.0,
    "rating_count" integer default 0,
    "acceptance_rate" numeric(5,2) default 100.0,
    "mmg_account_number" character varying(50),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


create table "public"."location_history" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "trip_id" uuid,
    "driver_id" uuid,
    "latitude" numeric(10,8) not null,
    "longitude" numeric(11,8) not null,
    "location" geography(Point,4326),
    "accuracy_meters" numeric(6,2),
    "speed_kmh" numeric(5,2),
    "heading" numeric(5,2),
    "recorded_at" timestamp with time zone default now(),
    "device_id" text,
    "is_online" boolean default true
);


create table "public"."message_logs" (
    "id" uuid not null default gen_random_uuid(),
    "channel" text not null,
    "recipient_user_id" uuid,
    "recipient_phone" text,
    "title" text,
    "message" text not null,
    "status" text not null,
    "sent_by_user_id" uuid,
    "external_id" text,
    "notification_type" text,
    "audience" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now()
);


create table "public"."notifications" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "title" character varying(255) not null,
    "body" text not null,
    "notification_type" character varying(50) not null,
    "related_entity_type" character varying(50),
    "related_entity_id" uuid,
    "is_read" boolean default false,
    "read_at" timestamp with time zone,
    "push_sent" boolean default false,
    "push_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
);


create table "public"."payment_transactions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "subscription_id" uuid,
    "amount" numeric(10,2) not null,
    "currency" character varying(3) default 'GYD'::character varying,
    "payment_method" character varying(50) not null,
    "mmg_transaction_id" character varying(255),
    "mmg_reference" character varying(255),
    "mmg_phone_number" character varying(20),
    "status" payment_status not null,
    "gateway_response" jsonb,
    "error_message" text,
    "initiated_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "subscription_start_date" timestamp with time zone
);


create table "public"."rider_profiles" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "subscription_status" subscription_status default 'trial'::subscription_status,
    "subscription_start_date" timestamp with time zone,
    "subscription_end_date" timestamp with time zone,
    "trial_end_date" timestamp with time zone,
    "total_trips" integer default 0,
    "rating_average" numeric(3,2) default 5.0,
    "rating_count" integer default 0,
    "emergency_contact_name" character varying(255),
    "emergency_contact_phone" character varying(20),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


create table "public"."saved_places" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "name" character varying(255) not null,
    "address" text not null,
    "latitude" numeric(10,8) not null,
    "longitude" numeric(11,8) not null,
    "location" geography(Point,4326),
    "place_type" character varying(20) default 'other'::character varying,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."saved_places" enable row level security;

create table "public"."subscriptions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "user_role" user_role not null,
    "plan_type" character varying(50) not null,
    "amount" numeric(10,2) not null,
    "currency" character varying(3) default 'GYD'::character varying,
    "start_date" timestamp with time zone not null,
    "end_date" timestamp with time zone not null,
    "status" subscription_status not null,
    "payment_method" character varying(50),
    "payment_reference" character varying(255),
    "payment_date" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


create table "public"."system_config" (
    "key" character varying(100) not null,
    "value" jsonb not null,
    "description" text,
    "updated_at" timestamp with time zone default now(),
    "updated_by" uuid
);


create table "public"."trip_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "rider_id" uuid,
    "pickup_latitude" numeric(10,8) not null,
    "pickup_longitude" numeric(11,8) not null,
    "pickup_address" text not null,
    "pickup_location" geography(Point,4326),
    "destination_latitude" numeric(10,8),
    "destination_longitude" numeric(11,8),
    "destination_address" text,
    "destination_location" geography(Point,4326),
    "trip_type" trip_type not null,
    "estimated_distance_km" numeric(6,2),
    "estimated_duration_minutes" integer,
    "estimated_fare" numeric(10,2),
    "notes" text,
    "passenger_count" integer default 1,
    "status" trip_status default 'requested'::trip_status,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


create table "public"."trips" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "rider_id" uuid,
    "driver_id" uuid,
    "vehicle_id" uuid,
    "request_id" uuid,
    "pickup_latitude" numeric(10,8) not null,
    "pickup_longitude" numeric(11,8) not null,
    "pickup_address" text not null,
    "destination_latitude" numeric(10,8),
    "destination_longitude" numeric(11,8),
    "destination_address" text,
    "trip_type" trip_type not null,
    "status" trip_status not null,
    "estimated_distance_km" numeric(6,2),
    "actual_distance_km" numeric(6,2),
    "estimated_duration_minutes" integer,
    "actual_duration_minutes" integer,
    "estimated_fare" numeric(10,2),
    "actual_fare" numeric(10,2),
    "currency" character varying(3) default 'GYD'::character varying,
    "payment_method" character varying(20) default 'cash'::character varying,
    "route_polyline" text,
    "route_waypoints" jsonb,
    "requested_at" timestamp with time zone not null,
    "accepted_at" timestamp with time zone,
    "driver_arrived_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" text,
    "is_night_trip" boolean default false,
    "rider_rating" integer,
    "driver_rating" integer,
    "rider_feedback" text,
    "driver_feedback" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "cancelled_by_user_id" uuid,
    "completed_latitude" numeric(10,8),
    "completed_longitude" numeric(11,8),
    "driver_rating_friendly" integer,
    "driver_rating_clean" integer,
    "driver_rating_safe" integer,
    "driver_rating_communicated_fairly" integer
);


create table "public"."users" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "auth_id" uuid,
    "phone_number" character varying(20) not null,
    "email" character varying(255),
    "full_name" character varying(255) not null,
    "profile_photo_url" text,
    "role" user_role not null,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "last_seen_at" timestamp with time zone,
    "preferred_language" character varying(10) default 'en'::character varying,
    "notification_enabled" boolean default true,
    "fcm_token" text
);


create table "public"."vehicles" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "driver_id" uuid,
    "make" character varying(100) not null,
    "model" character varying(100) not null,
    "year" integer,
    "color" character varying(50),
    "license_plate" character varying(20) not null,
    "vehicle_photo_url" text,
    "registration_url" text,
    "registration_number" character varying(50),
    "registration_expiry" date,
    "insurance_expiry" date,
    "is_active" boolean default true,
    "is_primary" boolean default false,
    "passenger_capacity" integer default 4,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


create table "public"."verification_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "driver_id" uuid,
    "admin_id" uuid,
    "previous_status" verification_status,
    "new_status" verification_status not null,
    "admin_notes" text,
    "rejection_reason" text,
    "created_at" timestamp with time zone default now()
);


CREATE UNIQUE INDEX app_version_config_pkey ON public.app_version_config USING btree (app_type, platform);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX driver_profiles_pkey ON public.driver_profiles USING btree (id);

CREATE UNIQUE INDEX driver_profiles_user_id_key ON public.driver_profiles USING btree (user_id);

CREATE INDEX idx_audit_logs_actor_changed ON public.audit_logs USING btree (actor_id, changed_at DESC);

CREATE INDEX idx_audit_logs_record ON public.audit_logs USING btree (record_id, table_name);

CREATE INDEX idx_audit_logs_table_changed ON public.audit_logs USING btree (table_name, changed_at DESC);

CREATE INDEX idx_driver_location ON public.driver_profiles USING gist (current_location);

CREATE INDEX idx_driver_online ON public.driver_profiles USING btree (is_online, is_available) WHERE (is_online = true);

CREATE INDEX idx_driver_subscription_status ON public.driver_profiles USING btree (subscription_status);

CREATE INDEX idx_driver_verification ON public.driver_profiles USING btree (verification_status);

CREATE INDEX idx_location_history_driver ON public.location_history USING btree (driver_id, recorded_at DESC);

CREATE INDEX idx_location_history_location ON public.location_history USING gist (location);

CREATE INDEX idx_location_history_trip ON public.location_history USING btree (trip_id, recorded_at DESC);

CREATE INDEX idx_message_logs_channel ON public.message_logs USING btree (channel);

CREATE INDEX idx_message_logs_created_at ON public.message_logs USING btree (created_at DESC);

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_payment_transactions_mmg_ref ON public.payment_transactions USING btree (mmg_transaction_id);

CREATE INDEX idx_payment_transactions_status ON public.payment_transactions USING btree (status);

CREATE INDEX idx_payment_transactions_subscription ON public.payment_transactions USING btree (subscription_id);

CREATE INDEX idx_payment_transactions_user ON public.payment_transactions USING btree (user_id);

CREATE INDEX idx_rider_subscription_dates ON public.rider_profiles USING btree (subscription_end_date);

CREATE INDEX idx_rider_subscription_status ON public.rider_profiles USING btree (subscription_status);

CREATE INDEX idx_saved_places_created_at ON public.saved_places USING btree (user_id, created_at DESC);

CREATE INDEX idx_saved_places_location ON public.saved_places USING gist (location);

CREATE INDEX idx_saved_places_place_type ON public.saved_places USING btree (user_id, place_type);

CREATE INDEX idx_saved_places_user_id ON public.saved_places USING btree (user_id);

CREATE INDEX idx_subscriptions_end_date ON public.subscriptions USING btree (end_date);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_user ON public.subscriptions USING btree (user_id);

CREATE INDEX idx_trip_requests_expires ON public.trip_requests USING btree (expires_at) WHERE (status = 'requested'::trip_status);

CREATE INDEX idx_trip_requests_pickup ON public.trip_requests USING gist (pickup_location);

CREATE INDEX idx_trip_requests_rider ON public.trip_requests USING btree (rider_id);

CREATE INDEX idx_trip_requests_status ON public.trip_requests USING btree (status) WHERE (status = 'requested'::trip_status);

CREATE INDEX idx_trips_cancelled_by ON public.trips USING btree (cancelled_by_user_id);

CREATE INDEX idx_trips_driver ON public.trips USING btree (driver_id);

CREATE INDEX idx_trips_night_mode ON public.trips USING btree (is_night_trip) WHERE (is_night_trip = true);

CREATE INDEX idx_trips_requested_at ON public.trips USING btree (requested_at DESC);

CREATE INDEX idx_trips_rider ON public.trips USING btree (rider_id);

CREATE INDEX idx_trips_status ON public.trips USING btree (status);

CREATE INDEX idx_users_auth_id ON public.users USING btree (auth_id);

CREATE INDEX idx_users_fcm_token ON public.users USING btree (fcm_token) WHERE (fcm_token IS NOT NULL);

CREATE INDEX idx_users_phone ON public.users USING btree (phone_number);

CREATE INDEX idx_users_role ON public.users USING btree (role);

CREATE INDEX idx_vehicles_driver ON public.vehicles USING btree (driver_id);

CREATE INDEX idx_vehicles_license_plate ON public.vehicles USING btree (license_plate);

CREATE INDEX idx_verification_logs_driver ON public.verification_logs USING btree (driver_id, created_at DESC);

CREATE UNIQUE INDEX location_history_pkey ON public.location_history USING btree (id);

CREATE UNIQUE INDEX message_logs_pkey ON public.message_logs USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX payment_transactions_pkey ON public.payment_transactions USING btree (id);

CREATE UNIQUE INDEX rider_profiles_pkey ON public.rider_profiles USING btree (id);

CREATE UNIQUE INDEX rider_profiles_user_id_key ON public.rider_profiles USING btree (user_id);

CREATE UNIQUE INDEX saved_places_pkey ON public.saved_places USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX system_config_pkey ON public.system_config USING btree (key);

CREATE UNIQUE INDEX trip_requests_pkey ON public.trip_requests USING btree (id);

CREATE UNIQUE INDEX trips_pkey ON public.trips USING btree (id);

CREATE UNIQUE INDEX users_auth_id_key ON public.users USING btree (auth_id);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX vehicles_driver_id_license_plate_key ON public.vehicles USING btree (driver_id, license_plate);

CREATE UNIQUE INDEX vehicles_license_plate_key ON public.vehicles USING btree (license_plate);

CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id);

CREATE UNIQUE INDEX verification_logs_pkey ON public.verification_logs USING btree (id);

alter table "public"."app_version_config" add constraint "app_version_config_pkey" PRIMARY KEY using index "app_version_config_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."driver_profiles" add constraint "driver_profiles_pkey" PRIMARY KEY using index "driver_profiles_pkey";

alter table "public"."location_history" add constraint "location_history_pkey" PRIMARY KEY using index "location_history_pkey";

alter table "public"."message_logs" add constraint "message_logs_pkey" PRIMARY KEY using index "message_logs_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."payment_transactions" add constraint "payment_transactions_pkey" PRIMARY KEY using index "payment_transactions_pkey";

alter table "public"."rider_profiles" add constraint "rider_profiles_pkey" PRIMARY KEY using index "rider_profiles_pkey";

alter table "public"."saved_places" add constraint "saved_places_pkey" PRIMARY KEY using index "saved_places_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."system_config" add constraint "system_config_pkey" PRIMARY KEY using index "system_config_pkey";

alter table "public"."trip_requests" add constraint "trip_requests_pkey" PRIMARY KEY using index "trip_requests_pkey";

alter table "public"."trips" add constraint "trips_pkey" PRIMARY KEY using index "trips_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."vehicles" add constraint "vehicles_pkey" PRIMARY KEY using index "vehicles_pkey";

alter table "public"."verification_logs" add constraint "verification_logs_pkey" PRIMARY KEY using index "verification_logs_pkey";

alter table "public"."app_version_config" add constraint "app_version_config_app_type_check" CHECK ((app_type = ANY (ARRAY['driver'::text, 'rider'::text]))) not valid;

alter table "public"."app_version_config" validate constraint "app_version_config_app_type_check";

alter table "public"."app_version_config" add constraint "app_version_config_build_number_check" CHECK ((build_number >= 0)) not valid;

alter table "public"."app_version_config" validate constraint "app_version_config_build_number_check";

alter table "public"."app_version_config" add constraint "app_version_config_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text]))) not valid;

alter table "public"."app_version_config" validate constraint "app_version_config_platform_check";

alter table "public"."audit_logs" add constraint "audit_logs_action_check" CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_action_check";

alter table "public"."driver_profiles" add constraint "driver_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."driver_profiles" validate constraint "driver_profiles_user_id_fkey";

alter table "public"."driver_profiles" add constraint "driver_profiles_user_id_key" UNIQUE using index "driver_profiles_user_id_key";

alter table "public"."location_history" add constraint "location_history_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES driver_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."location_history" validate constraint "location_history_driver_id_fkey";

alter table "public"."location_history" add constraint "location_history_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE not valid;

alter table "public"."location_history" validate constraint "location_history_trip_id_fkey";

alter table "public"."message_logs" add constraint "message_logs_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'push'::text]))) not valid;

alter table "public"."message_logs" validate constraint "message_logs_channel_check";

alter table "public"."message_logs" add constraint "message_logs_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES users(id) not valid;

alter table "public"."message_logs" validate constraint "message_logs_recipient_user_id_fkey";

alter table "public"."message_logs" add constraint "message_logs_sent_by_user_id_fkey" FOREIGN KEY (sent_by_user_id) REFERENCES users(id) not valid;

alter table "public"."message_logs" validate constraint "message_logs_sent_by_user_id_fkey";

alter table "public"."message_logs" add constraint "message_logs_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text]))) not valid;

alter table "public"."message_logs" validate constraint "message_logs_status_check";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."payment_transactions" add constraint "payment_transactions_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL not valid;

alter table "public"."payment_transactions" validate constraint "payment_transactions_subscription_id_fkey";

alter table "public"."payment_transactions" add constraint "payment_transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."payment_transactions" validate constraint "payment_transactions_user_id_fkey";

alter table "public"."rider_profiles" add constraint "rider_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."rider_profiles" validate constraint "rider_profiles_user_id_fkey";

alter table "public"."rider_profiles" add constraint "rider_profiles_user_id_key" UNIQUE using index "rider_profiles_user_id_key";

alter table "public"."saved_places" add constraint "check_place_type" CHECK (((place_type)::text = ANY ((ARRAY['home'::character varying, 'work'::character varying, 'other'::character varying])::text[]))) not valid;

alter table "public"."saved_places" validate constraint "check_place_type";

alter table "public"."saved_places" add constraint "saved_places_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."saved_places" validate constraint "saved_places_user_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."system_config" add constraint "system_config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) not valid;

alter table "public"."system_config" validate constraint "system_config_updated_by_fkey";

alter table "public"."trip_requests" add constraint "trip_requests_rider_id_fkey" FOREIGN KEY (rider_id) REFERENCES rider_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."trip_requests" validate constraint "trip_requests_rider_id_fkey";

alter table "public"."trips" add constraint "trips_cancelled_by_user_id_fkey" FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."trips" validate constraint "trips_cancelled_by_user_id_fkey";

alter table "public"."trips" add constraint "trips_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES driver_profiles(id) ON DELETE SET NULL not valid;

alter table "public"."trips" validate constraint "trips_driver_id_fkey";

alter table "public"."trips" add constraint "trips_driver_rating_check" CHECK (((driver_rating >= 1) AND (driver_rating <= 5))) not valid;

alter table "public"."trips" validate constraint "trips_driver_rating_check";

alter table "public"."trips" add constraint "trips_driver_rating_clean_check" CHECK (((driver_rating_clean IS NULL) OR ((driver_rating_clean >= 1) AND (driver_rating_clean <= 5)))) not valid;

alter table "public"."trips" validate constraint "trips_driver_rating_clean_check";

alter table "public"."trips" add constraint "trips_driver_rating_communicated_fairly_check" CHECK (((driver_rating_communicated_fairly IS NULL) OR ((driver_rating_communicated_fairly >= 1) AND (driver_rating_communicated_fairly <= 5)))) not valid;

alter table "public"."trips" validate constraint "trips_driver_rating_communicated_fairly_check";

alter table "public"."trips" add constraint "trips_driver_rating_friendly_check" CHECK (((driver_rating_friendly IS NULL) OR ((driver_rating_friendly >= 1) AND (driver_rating_friendly <= 5)))) not valid;

alter table "public"."trips" validate constraint "trips_driver_rating_friendly_check";

alter table "public"."trips" add constraint "trips_driver_rating_safe_check" CHECK (((driver_rating_safe IS NULL) OR ((driver_rating_safe >= 1) AND (driver_rating_safe <= 5)))) not valid;

alter table "public"."trips" validate constraint "trips_driver_rating_safe_check";

alter table "public"."trips" add constraint "trips_request_id_fkey" FOREIGN KEY (request_id) REFERENCES trip_requests(id) ON DELETE SET NULL not valid;

alter table "public"."trips" validate constraint "trips_request_id_fkey";

alter table "public"."trips" add constraint "trips_rider_id_fkey" FOREIGN KEY (rider_id) REFERENCES rider_profiles(id) ON DELETE SET NULL not valid;

alter table "public"."trips" validate constraint "trips_rider_id_fkey";

alter table "public"."trips" add constraint "trips_rider_rating_check" CHECK (((rider_rating >= 1) AND (rider_rating <= 5))) not valid;

alter table "public"."trips" validate constraint "trips_rider_rating_check";

alter table "public"."trips" add constraint "trips_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL not valid;

alter table "public"."trips" validate constraint "trips_vehicle_id_fkey";

alter table "public"."users" add constraint "users_auth_id_fkey" FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_auth_id_fkey";

alter table "public"."users" add constraint "users_auth_id_key" UNIQUE using index "users_auth_id_key";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

alter table "public"."vehicles" add constraint "vehicles_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES driver_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."vehicles" validate constraint "vehicles_driver_id_fkey";

alter table "public"."vehicles" add constraint "vehicles_driver_id_license_plate_key" UNIQUE using index "vehicles_driver_id_license_plate_key";

alter table "public"."vehicles" add constraint "vehicles_license_plate_key" UNIQUE using index "vehicles_license_plate_key";

alter table "public"."verification_logs" add constraint "verification_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL not valid;

alter table "public"."verification_logs" validate constraint "verification_logs_admin_id_fkey";

alter table "public"."verification_logs" add constraint "verification_logs_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES driver_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."verification_logs" validate constraint "verification_logs_driver_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_trip_request(p_driver_id uuid, p_request_id uuid, p_vehicle_id uuid)
 RETURNS trips
 LANGUAGE plpgsql
AS $function$DECLARE
  v_request trip_requests;
  v_driver driver_profiles;
  v_vehicle vehicles;
  v_new_trip trips;
  v_is_night BOOLEAN;
BEGIN
  -- 1. Lock and validate trip request (prevent race conditions)
  SELECT * INTO v_request
  FROM trip_requests
  WHERE id = p_request_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip request not found';
  END IF;
  
  IF v_request.status != 'requested' THEN
    RAISE EXCEPTION 'Trip request is no longer available (status: %)', v_request.status;
  END IF;
  
  IF v_request.expires_at IS NOT NULL AND v_request.expires_at < NOW() THEN
    RAISE EXCEPTION 'Trip request has expired';
  END IF;
  
  -- 2. Validate driver
  SELECT * INTO v_driver
  FROM driver_profiles
  WHERE id = p_driver_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  
  IF NOT v_driver.is_online THEN
    RAISE EXCEPTION 'Driver must be online to accept trips';
  END IF;
  
  IF NOT v_driver.is_available THEN
    RAISE EXCEPTION 'Driver is not available (already on a trip)';
  END IF;
  
  IF v_driver.verification_status != 'approved' THEN
    RAISE EXCEPTION 'Driver verification required';
  END IF;


  IF NOT is_subscription_active(v_driver.user_id, 'driver') THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;
  
  
  IF v_driver.subscription_status NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;
  
  -- 3. Validate vehicle belongs to driver
  SELECT * INTO v_vehicle
  FROM vehicles
  WHERE id = p_vehicle_id AND driver_id = p_driver_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or does not belong to driver';
  END IF;
  
  IF NOT v_vehicle.is_active THEN
    RAISE EXCEPTION 'Vehicle is not active';
  END IF;
  
  -- 4. Check if it's night mode
  v_is_night := is_night_mode();
  
  -- 5. Create trip record
  INSERT INTO trips (
    rider_id,
    driver_id,
    vehicle_id,
    request_id,
    pickup_latitude,
    pickup_longitude,
    pickup_address,
    destination_latitude,
    destination_longitude,
    destination_address,
    trip_type,
    status,
    estimated_distance_km,
    estimated_duration_minutes,
    estimated_fare,
    requested_at,
    accepted_at,
    is_night_trip,
    currency,
    payment_method
  ) VALUES (
    v_request.rider_id,
    p_driver_id,
    p_vehicle_id,
    p_request_id,
    v_request.pickup_latitude,
    v_request.pickup_longitude,
    v_request.pickup_address,
    v_request.destination_latitude,
    v_request.destination_longitude,
    v_request.destination_address,
    v_request.trip_type,
    'accepted',
    v_request.estimated_distance_km,
    v_request.estimated_duration_minutes,
    v_request.estimated_fare,
    v_request.created_at,
    NOW(),
    v_is_night,
    'GYD',
    'cash'
  ) RETURNING * INTO v_new_trip;
  
  -- 6. update trip request status to accepted 
  UPDATE trip_requests
  SET status = 'accepted'
  WHERE id = p_request_id;
  
  -- 7. Update driver status (mark as unavailable)
  UPDATE driver_profiles
  SET is_available = false
  WHERE id = p_driver_id;
  
  -- 8. Return the created trip
  RETURN v_new_trip;
END;$function$
;

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_record_id uuid;
  v_old_data jsonb;
  v_new_data jsonb;
  v_action text;
BEGIN
  v_action := TG_OP;

  IF v_action = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF v_action = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id;
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (TG_TABLE_NAME, v_record_id, v_action, v_old_data, v_new_data, auth.uid());

  IF v_action = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_distance(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
    ) / 1000; -- Returns km
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_nearby_drivers(user_latitude numeric, user_longitude numeric, radius_km numeric DEFAULT 5)
 RETURNS TABLE(driver_id uuid, driver_name text, distance_km numeric, rating numeric, vehicle_info text)
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN QUERY
  SELECT 
    dp.id as driver_id,
    u.full_name::TEXT as driver_name,
    (
      ST_Distance(
        dp.current_location,
        ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography
      ) / 1000
    )::DECIMAL as distance_km,
    dp.rating_average::DECIMAL as rating,
    COALESCE(v.make || ' ' || v.model, 'No vehicle')::TEXT as vehicle_info
  FROM driver_profiles dp
  JOIN users u ON u.id = dp.user_id
  LEFT JOIN vehicles v ON v.driver_id = dp.id AND v.is_primary = true
  WHERE 
    dp.is_online = true
    AND dp.is_available = true
    AND dp.verification_status = 'approved'
    AND dp.subscription_status IN ('active', 'trial')
    AND dp.subscription_end_date IS NOT NULL
    AND dp.subscription_end_date > NOW()
    AND dp.current_location IS NOT NULL
    AND ST_DWithin(
      dp.current_location,
      ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography,
      15 * 1000
    )
  ORDER BY distance_km ASC
  LIMIT 20;
END;$function$
;

CREATE OR REPLACE FUNCTION public.find_nearby_requests(driver_latitude numeric, driver_longitude numeric, radius_km numeric DEFAULT 10)
 RETURNS TABLE(id uuid, rider_id uuid, pickup_latitude numeric, pickup_longitude numeric, pickup_address text, destination_latitude numeric, destination_longitude numeric, destination_address text, trip_type trip_type, estimated_distance_km numeric, estimated_duration_minutes integer, estimated_fare numeric, notes text, passenger_count integer, status trip_status, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, distance_km numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    tr.id,
    tr.rider_id,
    tr.pickup_latitude,
    tr.pickup_longitude,
    tr.pickup_address,
    tr.destination_latitude,
    tr.destination_longitude,
    tr.destination_address,
    tr.trip_type,
    tr.estimated_distance_km,
    tr.estimated_duration_minutes,
    tr.estimated_fare,
    tr.notes,
    tr.passenger_count,
    tr.status,
    tr.expires_at,
    tr.created_at,
    tr.updated_at,
    CAST(
      CASE 
        WHEN tr.pickup_location IS NOT NULL THEN
          ST_Distance(
            tr.pickup_location,
            ST_SetSRID(ST_MakePoint(driver_longitude, driver_latitude), 4326)::geography
          ) / 1000.0
        ELSE
          calculate_distance(
            driver_latitude,
            driver_longitude,
            tr.pickup_latitude,
            tr.pickup_longitude
          )
      END AS DECIMAL
    ) as distance_km
  FROM trip_requests tr
  WHERE 
    tr.status = 'requested'
    AND (tr.expires_at IS NULL OR tr.expires_at > NOW())
    AND (
      (tr.pickup_location IS NOT NULL AND ST_DWithin(
        tr.pickup_location,
        ST_SetSRID(ST_MakePoint(driver_longitude, driver_latitude), 4326)::geography,
        radius_km * 1000
      ))
      OR
      (tr.pickup_location IS NULL AND calculate_distance(
        driver_latitude,
        driver_longitude,
        tr.pickup_latitude,
        tr.pickup_longitude
      ) <= radius_km)
    )
  ORDER BY distance_km ASC
  LIMIT 50;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.get_all_available_drivers(user_latitude numeric DEFAULT NULL::numeric, user_longitude numeric DEFAULT NULL::numeric)
 RETURNS TABLE(driver_id uuid, driver_name text, distance_km numeric, rating numeric, vehicle_info text, latitude numeric, longitude numeric, vehicle_make text, vehicle_model text, vehicle_color text, license_plate text, rating_count integer, total_trips integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dp.id)
    dp.id as driver_id,
    u.full_name::TEXT as driver_name,
    CAST(
      CASE 
        WHEN user_latitude IS NOT NULL AND user_longitude IS NOT NULL THEN
          ST_Distance(
            dp.current_location,
            ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography
          ) / 1000
        ELSE
          NULL
      END AS DECIMAL
    ) as distance_km,
    dp.rating_average::DECIMAL as rating,
    COALESCE(v.make || ' ' || v.model, 'No vehicle')::TEXT as vehicle_info,
    CAST(ST_Y(dp.current_location::geometry) AS DECIMAL) as latitude,
    CAST(ST_X(dp.current_location::geometry) AS DECIMAL) as longitude,
    v.make::TEXT as vehicle_make,
    v.model::TEXT as vehicle_model,
    v.color::TEXT as vehicle_color,
    v.license_plate::TEXT,
    dp.rating_count,
    dp.total_trips
  FROM driver_profiles dp
  JOIN users u ON u.id = dp.user_id
  LEFT JOIN vehicles v ON v.driver_id = dp.id AND v.is_primary = true
  WHERE 
    dp.is_online = true
    AND dp.is_available = true
    AND dp.verification_status = 'approved'
    AND dp.subscription_status IN ('active', 'trial')
    AND dp.current_location IS NOT NULL
  ORDER BY 
    dp.id,
    CASE 
      WHEN user_latitude IS NOT NULL AND user_longitude IS NOT NULL THEN
        ST_Distance(
          dp.current_location,
          ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography
        )
      ELSE
        NULL
    END ASC NULLS LAST,
    dp.location_updated_at DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_night_mode()
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_config JSONB;
    v_current_time TIME;
    v_start_time TIME;
    v_end_time TIME;
BEGIN
    SELECT value INTO v_config FROM system_config WHERE key = 'night_mode_hours';
    v_current_time := CURRENT_TIME;
    v_start_time := (v_config->>'start')::TIME;
    v_end_time := (v_config->>'end')::TIME;
    
    -- Handle overnight range
    IF v_start_time > v_end_time THEN
        RETURN v_current_time >= v_start_time OR v_current_time < v_end_time;
    ELSE
        RETURN v_current_time >= v_start_time AND v_current_time < v_end_time;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_subscription_active(p_user_id uuid, p_role user_role)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_status subscription_status;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    IF p_role = 'rider' THEN
        SELECT subscription_status, subscription_end_date 
        INTO v_status, v_end_date
        FROM rider_profiles 
        WHERE user_id = p_user_id;
    ELSIF p_role = 'driver' THEN
        SELECT subscription_status, subscription_end_date 
        INTO v_status, v_end_date
        FROM driver_profiles 
        WHERE user_id = p_user_id;
    ELSE
        RETURN false;
    END IF;
    
    RETURN v_status IN ('active', 'trial') AND v_end_date > NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_cancelled_by_user()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    -- Only proceed if status is being changed to cancelled
    IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
        -- Try to get the current user's ID from auth context
        BEGIN
            SELECT id INTO v_user_id
            FROM users
            WHERE auth_id = auth.uid()
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            -- If auth.uid() is not available, leave cancelled_by_user_id as is
            v_user_id := NULL;
        END;
        
        -- Set cancelled_by_user_id if not already set and we have a user_id
        IF NEW.cancelled_by_user_id IS NULL AND v_user_id IS NOT NULL THEN
            NEW.cancelled_by_user_id := v_user_id;
        END IF;
        
        -- Ensure cancelled_at is set
        IF NEW.cancelled_at IS NULL THEN
            NEW.cancelled_at := NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.simulate_trip_request(p_rider_id uuid, p_pickup_lat numeric, p_pickup_lng numeric, p_pickup_address text, p_dest_lat numeric, p_dest_lng numeric, p_dest_address text, p_trip_type trip_type DEFAULT 'short_drop'::trip_type, p_notes text DEFAULT NULL::text, p_passenger_count integer DEFAULT 1, p_expiry_minutes integer DEFAULT NULL::integer)
 RETURNS trip_requests
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pickup_location GEOGRAPHY(POINT, 4326);
  v_dest_location GEOGRAPHY(POINT, 4326);
  v_distance_km DECIMAL;
  v_estimated_fare DECIMAL;
  v_base_fare DECIMAL;
  v_per_km_rate DECIMAL;
  v_expiry_minutes INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_estimated_duration_minutes INTEGER;
  v_new_request trip_requests;
BEGIN
  -- Get expiry minutes from config if not provided
  IF p_expiry_minutes IS NULL THEN
    SELECT (value::text)::INTEGER INTO v_expiry_minutes
    FROM system_config
    WHERE key = 'trip_expiry_minutes';
    
    IF v_expiry_minutes IS NULL THEN
      v_expiry_minutes := 10; -- Default fallback
    END IF;
  ELSE
    v_expiry_minutes := p_expiry_minutes;
  END IF;
  
  -- Calculate expiry time
  v_expires_at := NOW() + (v_expiry_minutes || ' minutes')::INTERVAL;
  
  -- Create geography points
  v_pickup_location := ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::geography;
  v_dest_location := ST_SetSRID(ST_MakePoint(p_dest_lng, p_dest_lat), 4326)::geography;
  
  -- Calculate distance using PostGIS
  v_distance_km := ST_Distance(v_pickup_location, v_dest_location) / 1000.0;
  
  -- Get fare rates from system config
  SELECT (value::text)::DECIMAL INTO v_base_fare
  FROM system_config
  WHERE key = 'base_fare';
  
  SELECT (value::text)::DECIMAL INTO v_per_km_rate
  FROM system_config
  WHERE key = 'per_km_rate';
  
  -- Set defaults if config not found
  IF v_base_fare IS NULL THEN
    v_base_fare := 500.0;
  END IF;
  
  IF v_per_km_rate IS NULL THEN
    v_per_km_rate := 150.0;
  END IF;
  
  -- Calculate estimated fare: base_fare + (distance * per_km_rate)
  v_estimated_fare := v_base_fare + (v_distance_km * v_per_km_rate);
  
  -- Estimate duration (rough: 1km ≈ 2 minutes in city traffic)
  v_estimated_duration_minutes := CEIL(v_distance_km * 2);
  
  -- Insert the trip request
  INSERT INTO trip_requests (
    rider_id,
    pickup_latitude,
    pickup_longitude,
    pickup_address,
    pickup_location,
    destination_latitude,
    destination_longitude,
    destination_address,
    destination_location,
    trip_type,
    estimated_distance_km,
    estimated_duration_minutes,
    estimated_fare,
    notes,
    passenger_count,
    status,
    expires_at
  ) VALUES (
    p_rider_id,
    p_pickup_lat,
    p_pickup_lng,
    p_pickup_address,
    v_pickup_location,
    p_dest_lat,
    p_dest_lng,
    p_dest_address,
    v_dest_location,
    p_trip_type,
    v_distance_km,
    v_estimated_duration_minutes,
    v_estimated_fare,
    p_notes,
    p_passenger_count,
    'requested',
    v_expires_at
  ) RETURNING * INTO v_new_request;
  
  RETURN v_new_request;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_driver_rating_on_trip_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_driver_id UUID;
    v_old_rating INTEGER;
    v_new_rating INTEGER;
    v_current_avg DECIMAL(3,2);
    v_current_count INTEGER;
    v_new_avg DECIMAL(3,2);
    v_new_count INTEGER;
BEGIN
    -- Get driver_id from the trip
    v_driver_id := NEW.driver_id;
    
    -- Only proceed if driver_id exists and driver_rating is being set/updated
    IF v_driver_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get old and new rating values
    v_old_rating := COALESCE(OLD.driver_rating, NULL);
    v_new_rating := NEW.driver_rating;
    
    -- If rating is being removed (set to NULL), handle decrement
    IF v_new_rating IS NULL AND v_old_rating IS NOT NULL THEN
        -- Get current driver stats
        SELECT rating_average, rating_count
        INTO v_current_avg, v_current_count
        FROM driver_profiles
        WHERE id = v_driver_id;
        
        -- If this was the only rating, reset to defaults
        IF v_current_count <= 1 THEN
            UPDATE driver_profiles
            SET 
                rating_average = 5.0,
                rating_count = 0,
                updated_at = NOW()
            WHERE id = v_driver_id;
        ELSE
            -- Recalculate average: (current_avg * current_count - old_rating) / (current_count - 1)
            v_new_avg := ((v_current_avg * v_current_count) - v_old_rating) / (v_current_count - 1);
            v_new_count := v_current_count - 1;
            
            -- Ensure average is between 1 and 5
            v_new_avg := GREATEST(1.0, LEAST(5.0, v_new_avg));
            
            UPDATE driver_profiles
            SET 
                rating_average = v_new_avg,
                rating_count = v_new_count,
                updated_at = NOW()
            WHERE id = v_driver_id;
        END IF;
        
        RETURN NEW;
    END IF;
    
    -- If rating is being set or updated (not NULL)
    IF v_new_rating IS NOT NULL THEN
        -- Validate rating is between 1 and 5
        IF v_new_rating < 1 OR v_new_rating > 5 THEN
            RAISE EXCEPTION 'Rating must be between 1 and 5';
        END IF;
        
        -- Get current driver stats
        SELECT rating_average, rating_count
        INTO v_current_avg, v_current_count
        FROM driver_profiles
        WHERE id = v_driver_id;
        
        -- Handle first rating
        IF v_current_count IS NULL OR v_current_count = 0 THEN
            UPDATE driver_profiles
            SET 
                rating_average = v_new_rating,
                rating_count = 1,
                updated_at = NOW()
            WHERE id = v_driver_id;
        -- Handle rating update (changing existing rating)
        ELSIF v_old_rating IS NOT NULL THEN
            -- Recalculate: (current_avg * current_count - old_rating + new_rating) / current_count
            v_new_avg := ((v_current_avg * v_current_count) - v_old_rating + v_new_rating) / v_current_count;
            v_new_avg := GREATEST(1.0, LEAST(5.0, v_new_avg));
            
            UPDATE driver_profiles
            SET 
                rating_average = v_new_avg,
                updated_at = NOW()
            WHERE id = v_driver_id;
        -- Handle new rating (adding to existing ratings)
        ELSE
            -- Calculate new average: (current_avg * current_count + new_rating) / (current_count + 1)
            v_new_avg := ((v_current_avg * v_current_count) + v_new_rating) / (v_current_count + 1);
            v_new_count := v_current_count + 1;
            
            UPDATE driver_profiles
            SET 
                rating_average = v_new_avg,
                rating_count = v_new_count,
                updated_at = NOW()
            WHERE id = v_driver_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_saved_place_location()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update geography column when latitude or longitude changes
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

create policy "Admins can view audit logs"
on "public"."audit_logs"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_id = auth.uid()) AND (u.role = 'admin'::user_role)))));


create policy "Drivers can update own profile"
on "public"."driver_profiles"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = driver_profiles.user_id) AND (users.auth_id = auth.uid())))));


create policy "Drivers can view own profile"
on "public"."driver_profiles"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = driver_profiles.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can update own notifications"
on "public"."notifications"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = notifications.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can view own notifications"
on "public"."notifications"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = notifications.user_id) AND (users.auth_id = auth.uid())))));


create policy "Riders can view own profile"
on "public"."rider_profiles"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = rider_profiles.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can delete own saved places"
on "public"."saved_places"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = saved_places.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can insert own saved places"
on "public"."saved_places"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = saved_places.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can update own saved places"
on "public"."saved_places"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = saved_places.user_id) AND (users.auth_id = auth.uid())))));


create policy "Users can view own saved places"
on "public"."saved_places"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = saved_places.user_id) AND (users.auth_id = auth.uid())))));


create policy "Riders can view own trip requests"
on "public"."trip_requests"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (rider_profiles rp
     JOIN users u ON ((u.id = rp.user_id)))
  WHERE ((rp.id = trip_requests.rider_id) AND (u.auth_id = auth.uid())))));


create policy "Verified drivers can view active requests"
on "public"."trip_requests"
as permissive
for select
to public
using (((status = 'requested'::trip_status) AND (EXISTS ( SELECT 1
   FROM (driver_profiles dp
     JOIN users u ON ((u.id = dp.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND (dp.verification_status = 'approved'::verification_status) AND (dp.subscription_status = ANY (ARRAY['active'::subscription_status, 'trial'::subscription_status])))))));


create policy "Drivers can update own trips"
on "public"."trips"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM (users u
     JOIN driver_profiles dp ON ((dp.user_id = u.id)))
  WHERE ((u.auth_id = auth.uid()) AND (trips.driver_id = dp.id)))))
with check (((EXISTS ( SELECT 1
   FROM (users u
     JOIN driver_profiles dp ON ((dp.user_id = u.id)))
  WHERE ((u.auth_id = auth.uid()) AND (trips.driver_id = dp.id)))) AND (status = ANY (ARRAY['picked_up'::trip_status, 'completed'::trip_status, 'cancelled'::trip_status, 'accepted'::trip_status]))));


create policy "Riders can cancel own trips"
on "public"."trips"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM (users u
     JOIN rider_profiles rp ON ((rp.user_id = u.id)))
  WHERE ((u.auth_id = auth.uid()) AND (trips.rider_id = rp.id) AND (trips.status = ANY (ARRAY['accepted'::trip_status, 'picked_up'::trip_status]))))))
with check (((EXISTS ( SELECT 1
   FROM (users u
     JOIN rider_profiles rp ON ((rp.user_id = u.id)))
  WHERE ((u.auth_id = auth.uid()) AND (trips.rider_id = rp.id)))) AND (status = 'cancelled'::trip_status) AND (cancelled_at IS NOT NULL)));


create policy "Users can view own trips"
on "public"."trips"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM ((users u
     LEFT JOIN rider_profiles rp ON ((rp.user_id = u.id)))
     LEFT JOIN driver_profiles dp ON ((dp.user_id = u.id)))
  WHERE ((u.auth_id = auth.uid()) AND ((trips.rider_id = rp.id) OR (trips.driver_id = dp.id))))));


create policy "Users can update own profile"
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = auth_id));


create policy "Users can view own profile"
on "public"."users"
as permissive
for select
to public
using ((auth.uid() = auth_id));


CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER update_driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.rider_profiles FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER update_rider_profiles_updated_at BEFORE UPDATE ON public.rider_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_place_location_trigger BEFORE INSERT OR UPDATE ON public.saved_places FOR EACH ROW EXECUTE FUNCTION update_saved_place_location();

CREATE TRIGGER update_saved_places_updated_at BEFORE UPDATE ON public.saved_places FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.trip_requests FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER update_trip_requests_updated_at BEFORE UPDATE ON public.trip_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_cancelled_by_user_trigger BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION set_cancelled_by_user();

CREATE TRIGGER trigger_update_driver_rating_on_trip_rating AFTER INSERT OR UPDATE OF driver_rating ON public.trips FOR EACH ROW WHEN ((new.driver_id IS NOT NULL)) EXECUTE FUNCTION update_driver_rating_on_trip_rating();

CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.verification_logs FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();



  create policy "Admins can delete from driver_docs"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.auth_id = auth.uid()) AND (users.role = 'admin'::user_role))))));



  create policy "Admins can read from driver_docs"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.auth_id = auth.uid()) AND (users.role = 'admin'::user_role))))));



  create policy "Admins can update driver_docs"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.auth_id = auth.uid()) AND (users.role = 'admin'::user_role))))));



  create policy "Admins can upload to driver_docs"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.auth_id = auth.uid()) AND (users.role = 'admin'::user_role))))));



  create policy "Avatar bucket is public read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'avatars'::text));



  create policy "Drivers can delete their own documents"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM (driver_profiles dp
     JOIN users u ON ((u.id = dp.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND ((string_to_array(objects.name, '/'::text))[1] = (dp.id)::text))))));



  create policy "Drivers can read their own documents"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM (driver_profiles dp
     JOIN users u ON ((u.id = dp.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND ((string_to_array(objects.name, '/'::text))[1] = (dp.id)::text))))));



  create policy "Drivers can update their own documents"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM (driver_profiles dp
     JOIN users u ON ((u.id = dp.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND ((string_to_array(objects.name, '/'::text))[1] = (dp.id)::text))))));



  create policy "Drivers can upload their own documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'driver_docs'::text) AND (EXISTS ( SELECT 1
   FROM (driver_profiles dp
     JOIN users u ON ((u.id = dp.user_id)))
  WHERE ((u.auth_id = auth.uid()) AND ((string_to_array(objects.name, '/'::text))[1] = (dp.id)::text))))));



  create policy "Users can delete own avatar"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((string_to_array(name, '/'::text))[1] = (auth.uid())::text)));



  create policy "Users can update own avatar"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'avatars'::text) AND ((string_to_array(name, '/'::text))[1] = (auth.uid())::text)));



  create policy "Users can upload own avatar"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND ((string_to_array(name, '/'::text))[1] = (auth.uid())::text)));
