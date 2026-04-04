-- Mobile app published version + build per app (driver/rider) and platform (ios/android).
-- RLS enabled with no policies: only the Supabase service role (server-side) can read/write.

CREATE TABLE public.app_version_config (
  app_type text NOT NULL CHECK (app_type IN ('driver', 'rider')),
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  version_string text NOT NULL,
  build_number integer NOT NULL CHECK (build_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_type, platform)
);

COMMENT ON TABLE public.app_version_config IS 'Published mobile app version/build; managed in Admin → Settings. Public /api/app/version reads via service role.';

INSERT INTO public.app_version_config (app_type, platform, version_string, build_number) VALUES
  ('driver', 'ios', '1.0.5', 37),
  ('driver', 'android', '1.0.5', 37),
  ('rider', 'ios', '1.0.5', 37),
  ('rider', 'android', '1.0.5', 37);

ALTER TABLE public.app_version_config ENABLE ROW LEVEL SECURITY;
