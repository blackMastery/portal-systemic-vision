-- Migration: Audit log for tracking all database changes
-- Creates audit_logs table, trigger function, and attaches triggers to audited tables.
-- Only admins can read audit_logs (RLS). Inserts are done by the trigger (SECURITY DEFINER).

-- Audit table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid
);

COMMENT ON TABLE public.audit_logs IS 'Tracks all INSERT/UPDATE/DELETE on audited tables. actor_id is auth.uid() when available.';

-- Trigger function: writes one row per changed row (handles multi-row operations)
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Attach trigger to each audited table (do not attach to audit_logs)
DO $$
DECLARE
  t text;
  tables_to_audit text[] := ARRAY[
    'users', 'rider_profiles', 'driver_profiles', 'vehicles', 'trips',
    'trip_requests', 'subscriptions', 'payment_transactions', 'notifications', 'verification_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_audit
  LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      t
    );
  END LOOP;
END;
$$;

-- RLS: only admins can read
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );

-- Indexes for admin UI filters and lookups
CREATE INDEX idx_audit_logs_table_changed ON public.audit_logs (table_name, changed_at DESC);
CREATE INDEX idx_audit_logs_record ON public.audit_logs (record_id, table_name);
CREATE INDEX idx_audit_logs_actor_changed ON public.audit_logs (actor_id, changed_at DESC);
