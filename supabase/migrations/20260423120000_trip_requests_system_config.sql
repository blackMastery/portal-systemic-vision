-- Default kill-switch for new trip requests (admin can disable via system_config).
insert into public.system_config (key, value, description)
values (
  'trip_requests',
  '{"enabled": true}'::jsonb,
  'When enabled is false, POST /api/trip-requests returns 403 until an admin re-enables it.'
)
on conflict (key) do nothing;
