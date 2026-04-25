-- Driver insurance document (photo/PDF storage URL) required for full profile completion.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS insurance_document_url text;

COMMENT ON COLUMN public.driver_profiles.insurance_document_url IS
  'Public URL of uploaded driver insurance document (image in driver_docs storage).';
