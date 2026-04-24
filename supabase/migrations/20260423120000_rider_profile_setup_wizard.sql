-- Rider profile setup: ID document storage, completion flag, and rider_docs bucket.

-- 1) Columns
ALTER TABLE public.rider_profiles
  ADD COLUMN IF NOT EXISTS id_card_storage_path text,
  ADD COLUMN IF NOT EXISTS profile_setup_completed boolean NOT NULL DEFAULT false;

-- Grandfather existing riders (do not block them on the new wizard)
UPDATE public.rider_profiles SET profile_setup_completed = true;

-- 2) Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rider_docs', 'rider_docs', false)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS: riders can update their own rider_profiles row (for id path + setup flag)
DROP POLICY IF EXISTS "Riders can update own profile" ON public.rider_profiles;
CREATE POLICY "Riders can update own profile" ON public.rider_profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = rider_profiles.user_id AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = rider_profiles.user_id AND u.auth_id = auth.uid()
    )
  );

-- 4) Admins: full access to rider_docs (same pattern as driver_docs)
DROP POLICY IF EXISTS "Admins can upload to rider_docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read from rider_docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update rider_docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete from rider_docs" ON storage.objects;

CREATE POLICY "Admins can upload to rider_docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can read from rider_docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update rider_docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete from rider_docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

-- 5) Riders: own folder in rider_docs — path: {rider_profiles.id}/...
DROP POLICY IF EXISTS "Riders can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Riders can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Riders can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Riders can delete their own documents" ON storage.objects;

CREATE POLICY "Riders can upload their own documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1
      FROM public.rider_profiles rp
      JOIN public.users u ON u.id = rp.user_id
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = rp.id::text
    )
  );

CREATE POLICY "Riders can read their own documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1
      FROM public.rider_profiles rp
      JOIN public.users u ON u.id = rp.user_id
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = rp.id::text
    )
  );

CREATE POLICY "Riders can update their own documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1
      FROM public.rider_profiles rp
      JOIN public.users u ON u.id = rp.user_id
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = rp.id::text
    )
  );

CREATE POLICY "Riders can delete their own documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rider_docs'
    AND EXISTS (
      SELECT 1
      FROM public.rider_profiles rp
      JOIN public.users u ON u.id = rp.user_id
      WHERE u.auth_id = auth.uid()
        AND (string_to_array(name, '/'))[1] = rp.id::text
    )
  );
