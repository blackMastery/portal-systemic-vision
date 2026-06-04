-- One active trip per trip_request (accepted/picked_up only).
-- Preserves cancel-and-re-offer: cancelled/completed trips are excluded from the index.
--
-- Pre-flight duplicate check (run manually on staging/prod before deploy):
--   SELECT request_id, array_agg(id) AS trip_ids, count(*)
--   FROM public.trips
--   WHERE request_id IS NOT NULL
--     AND status IN ('accepted', 'picked_up')
--   GROUP BY request_id
--   HAVING count(*) > 1;

DO $$
DECLARE
  v_dup_count integer;
BEGIN
  SELECT count(*)::integer INTO v_dup_count
  FROM (
    SELECT request_id
    FROM public.trips
    WHERE request_id IS NOT NULL
      AND status IN ('accepted'::trip_status, 'picked_up'::trip_status)
    GROUP BY request_id
    HAVING count(*) > 1
  ) duplicates;
  RAISE NOTICE 'v_dup_count: %', v_dup_count;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % request_id(s) have multiple active trips. Resolve duplicates before migrating.',
      v_dup_count;
  END IF;
END $$;

-- driver_request_blocks: required by accept_trip_request blocklist check.
-- Idempotent if already applied from driver-app migrations on prod.
CREATE TABLE IF NOT EXISTS public.driver_request_blocks (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.driver_profiles (id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.trip_requests (id) ON DELETE CASCADE,
  blocked_at timestamp with time zone DEFAULT now() NOT NULL,
  cancellation_reason text,
  source_trip_id uuid REFERENCES public.trips (id) ON DELETE SET NULL,
  CONSTRAINT driver_request_blocks_driver_id_request_id_key UNIQUE (driver_id, request_id)
);

COMMENT ON TABLE public.driver_request_blocks IS
  'Blocks (driver_id, request_id) when the driver cancels an accepted trip for that request; accept_trip_request rejects matching accepts.';

CREATE OR REPLACE FUNCTION public.trips_block_driver_request_on_driver_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'cancelled'
     AND (OLD.status IS DISTINCT FROM 'cancelled')
     AND NEW.driver_id IS NOT NULL
     AND NEW.request_id IS NOT NULL
     AND NEW.cancelled_by_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM driver_profiles dp
       WHERE dp.id = NEW.driver_id
         AND dp.user_id = NEW.cancelled_by_user_id
     )
  THEN
    INSERT INTO driver_request_blocks (
      driver_id,
      request_id,
      blocked_at,
      cancellation_reason,
      source_trip_id
    )
    VALUES (
      NEW.driver_id,
      NEW.request_id,
      COALESCE(NEW.cancelled_at, now()),
      NEW.cancellation_reason,
      NEW.id
    )
    ON CONFLICT (driver_id, request_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_block_driver_request_on_driver_cancel ON public.trips;

CREATE TRIGGER trips_block_driver_request_on_driver_cancel
  AFTER UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_block_driver_request_on_driver_cancel();

ALTER TABLE public.driver_request_blocks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.driver_request_blocks TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_per_request_idx
ON public.trips (request_id)
WHERE request_id IS NOT NULL
  AND status IN ('accepted'::trip_status, 'picked_up'::trip_status);

CREATE OR REPLACE FUNCTION public.accept_trip_request(
  p_driver_id uuid,
  p_request_id uuid,
  p_vehicle_id uuid
)
RETURNS public.trips
LANGUAGE plpgsql
AS $$
DECLARE
  v_request trip_requests;
  v_driver driver_profiles;
  v_vehicle vehicles;
  v_new_trip trips;
  v_is_night boolean;
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

  IF EXISTS (
    SELECT 1
    FROM driver_request_blocks b
    WHERE b.driver_id = p_driver_id
      AND b.request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'Cannot accept this trip request again after you cancelled it';
  END IF;

  -- 2. Validate driver (lock row to prevent concurrent accepts on different requests)
  SELECT * INTO v_driver
  FROM driver_profiles
  WHERE id = p_driver_id
  FOR UPDATE;

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

  -- 5. Create trip record (partial unique index is last-resort race guard)
  BEGIN
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
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Trip request is no longer available';
  END;

  -- 6. Update trip request status to accepted (conditional with row lock held)
  UPDATE trip_requests
  SET status = 'accepted'
  WHERE id = p_request_id AND status = 'requested';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip request is no longer available';
  END IF;

  -- 7. Update driver status (mark as unavailable)
  UPDATE driver_profiles
  SET is_available = false
  WHERE id = p_driver_id;

  -- 8. Return the created trip
  RETURN v_new_trip;
END;
$$;

ALTER FUNCTION public.accept_trip_request(uuid, uuid, uuid) OWNER TO postgres;
