-- Rider verification: mirror driver verification_status + auditable logs keyed by rider_id.

-- 1) rider_profiles: verification fields (default pending; backfill will approve existing users)
ALTER TABLE public.rider_profiles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE public.rider_profiles
SET
  verification_status = 'approved',
  verified_at = COALESCE(created_at, now())
WHERE verification_status = 'pending';

-- New signups use pending until admin approves
ALTER TABLE public.rider_profiles
  ALTER COLUMN verification_status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_rider_verification
  ON public.rider_profiles (verification_status);

-- 2) verification_logs: optional rider_id for rider review trail
ALTER TABLE public.verification_logs
  ADD COLUMN IF NOT EXISTS rider_id uuid
    REFERENCES public.rider_profiles (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_verification_logs_rider
  ON public.verification_logs (rider_id, created_at DESC);

-- Exactly one of driver_id or rider_id must be set (existing rows: driver only)
ALTER TABLE public.verification_logs
  DROP CONSTRAINT IF EXISTS verification_logs_driver_or_rider;

ALTER TABLE public.verification_logs
  ADD CONSTRAINT verification_logs_driver_or_rider CHECK (
    (driver_id IS NOT NULL) <> (rider_id IS NOT NULL)
  );
