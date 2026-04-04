-- When true, clients that are not on the published version/build should treat the update as required (block app).

ALTER TABLE public.app_version_config
  ADD COLUMN IF NOT EXISTS mandatory_update boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_version_config.mandatory_update IS 'If true, /api/app/version signals update_required when client is behind.';
