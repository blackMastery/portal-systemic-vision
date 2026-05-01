-- Enable Supabase Realtime (Postgres Changes) for location_history so clients can subscribe by trip_id.
-- Idempotent: skip if publication already lists this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'location_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_history;
  END IF;
END $$;
