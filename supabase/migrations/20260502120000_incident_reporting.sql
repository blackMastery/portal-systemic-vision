-- Incident reporting: complaints, evidence snapshots, dashcam request hooks, storage.

------------------------------------------------------------
-- 1. Enums
------------------------------------------------------------

CREATE TYPE public.incident_category AS ENUM (
  'safety_concern',
  'harassment',
  'assault',
  'robbery',
  'accident',
  'payment_dispute',
  'driver_conduct',
  'passenger_conduct',
  'other'
);

CREATE TYPE public.incident_status AS ENUM (
  'open',
  'under_review',
  'resolved',
  'escalated'
);

CREATE TYPE public.incident_reporter_role AS ENUM (
  'driver',
  'rider'
);

CREATE TYPE public.dashcam_request_status AS ENUM (
  'pending',
  'submitted',
  'expired',
  'cancelled'
);

------------------------------------------------------------
-- 2. Tables
------------------------------------------------------------

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips (id) ON DELETE RESTRICT,
  reporter_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reporter_role public.incident_reporter_role NOT NULL,
  subject_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  category public.incident_category NOT NULL,
  description text NOT NULL,
  status public.incident_status NOT NULL DEFAULT 'open',
  evidence_paths text[] NOT NULL DEFAULT '{}',
  trip_snapshot jsonb,
  location_history_snapshot jsonb,
  admin_notes text,
  assigned_admin_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_description_len CHECK (
    char_length(description) >= 10 AND char_length(description) <= 5000
  )
);

CREATE INDEX incidents_status_created_idx
  ON public.incidents (status, created_at DESC);

CREATE INDEX incidents_trip_id_idx ON public.incidents (trip_id);

CREATE INDEX incidents_reporter_user_id_idx ON public.incidents (reporter_user_id);

CREATE INDEX incidents_category_idx ON public.incidents (category);

CREATE TABLE public.incident_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  from_status public.incident_status,
  to_status public.incident_status NOT NULL,
  changed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_status_history_incident_idx
  ON public.incident_status_history (incident_id, changed_at DESC);

CREATE TABLE public.dashcam_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.driver_profiles (id) ON DELETE CASCADE,
  status public.dashcam_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  notified_at timestamptz,
  CONSTRAINT dashcam_requests_incident_id_unique UNIQUE (incident_id)
);

CREATE INDEX dashcam_requests_trip_id_idx ON public.dashcam_requests (trip_id);

CREATE INDEX dashcam_requests_driver_id_idx ON public.dashcam_requests (driver_id);

CREATE INDEX dashcam_requests_status_idx ON public.dashcam_requests (status);

------------------------------------------------------------
-- 3. BEFORE INSERT: snapshot trip + location_history (SECURITY DEFINER)
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.incidents_snapshot_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.trip_id IS NOT NULL THEN
    SELECT to_jsonb(t.*)
    INTO NEW.trip_snapshot
    FROM public.trips t
    WHERE t.id = NEW.trip_id;

    IF NEW.trip_snapshot IS NULL THEN
      RAISE EXCEPTION 'Trip % not found', NEW.trip_id;
    END IF;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', lh.id,
            'latitude', lh.latitude,
            'longitude', lh.longitude,
            'recorded_at', lh.recorded_at,
            'accuracy_meters', lh.accuracy_meters,
            'speed_kmh', lh.speed_kmh,
            'heading', lh.heading,
            'driver_id', lh.driver_id
          )
          ORDER BY lh.recorded_at
        )
        FROM public.location_history lh
        WHERE lh.trip_id = NEW.trip_id
      ),
      '[]'::jsonb
    )
    INTO NEW.location_history_snapshot;
  ELSE
    NEW.trip_snapshot := NULL;
    NEW.location_history_snapshot := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_incidents_snapshot_before_insert
  BEFORE INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.incidents_snapshot_before_insert();

------------------------------------------------------------
-- 4. AFTER INSERT: auto dashcam request when trip has driver
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.incidents_auto_create_dashcam_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_driver_profile_id uuid;
BEGIN
  IF NEW.trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.driver_id
  INTO v_driver_profile_id
  FROM public.trips t
  WHERE t.id = NEW.trip_id;

  IF v_driver_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.dashcam_requests (
    incident_id,
    trip_id,
    driver_id,
    status,
    requested_at,
    deadline_at
  )
  VALUES (
    NEW.id,
    NEW.trip_id,
    v_driver_profile_id,
    'pending',
    now(),
    now() + interval '14 days'
  )
  ON CONFLICT (incident_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_incidents_auto_dashcam
  AFTER INSERT ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.incidents_auto_create_dashcam_request();

------------------------------------------------------------
-- 5. AFTER UPDATE OF status: audit trail (SECURITY DEFINER insert)
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.incidents_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_changer uuid;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT u.id
    INTO v_changer
    FROM public.users u
    WHERE u.auth_id = auth.uid()
    LIMIT 1;

    INSERT INTO public.incident_status_history (
      incident_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_changer,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_incidents_log_status_change
  AFTER UPDATE OF status ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.incidents_log_status_change();

------------------------------------------------------------
-- 6. updated_at
------------------------------------------------------------

CREATE TRIGGER trigger_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 7. Storage bucket (private)
------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('incident_evidence', 'incident_evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Admins: full access to incident_evidence
DROP POLICY IF EXISTS "Admins can upload to incident_evidence" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read from incident_evidence" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update incident_evidence" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete from incident_evidence" ON storage.objects;

CREATE POLICY "Admins can upload to incident_evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can read from incident_evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update incident_evidence"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete from incident_evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

-- Reporters: path {users.id}/...
DROP POLICY IF EXISTS "Users can upload own incident evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own incident evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own incident evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own incident evidence" ON storage.objects;

CREATE POLICY "Users can upload own incident evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = u.id::text
    )
  );

CREATE POLICY "Users can read own incident evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = u.id::text
    )
  );

CREATE POLICY "Users can update own incident evidence"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = u.id::text
    )
  );

CREATE POLICY "Users can delete own incident evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident_evidence'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = u.id::text
    )
  );

------------------------------------------------------------
-- 8. RLS: incidents
------------------------------------------------------------

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters can insert own incidents"
  ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_user_id = (
      SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Reporters can select own incidents"
  ON public.incidents
  FOR SELECT TO authenticated
  USING (
    reporter_user_id = (
      SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Admins full access incidents"
  ON public.incidents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );

------------------------------------------------------------
-- 9. RLS: incident_status_history (admin read; inserts via trigger bypass as definer)
------------------------------------------------------------

ALTER TABLE public.incident_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read incident status history"
  ON public.incident_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );

------------------------------------------------------------
-- 10. RLS: dashcam_requests
------------------------------------------------------------

ALTER TABLE public.dashcam_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access dashcam_requests"
  ON public.dashcam_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "Drivers can select own dashcam_requests"
  ON public.dashcam_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_profiles dp
      JOIN public.users u ON u.id = dp.user_id
      WHERE dp.id = dashcam_requests.driver_id
        AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Drivers can update own dashcam_requests"
  ON public.dashcam_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_profiles dp
      JOIN public.users u ON u.id = dp.user_id
      WHERE dp.id = dashcam_requests.driver_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.driver_profiles dp
      JOIN public.users u ON u.id = dp.user_id
      WHERE dp.id = dashcam_requests.driver_id
        AND u.auth_id = auth.uid()
    )
  );
