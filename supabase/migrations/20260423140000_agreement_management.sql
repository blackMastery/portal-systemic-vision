-- User agreements: versioned text, acceptances, PDF storage.

create table if not exists public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('driver', 'rider')),
  version_label text not null,
  title text not null,
  body text not null,
  content_sha256 text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  constraint agreement_versions_audience_version_label_unique unique (audience, version_label)
);

create table if not exists public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agreement_version_id uuid not null references public.agreement_versions (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  device jsonb,
  content_sha256 text not null,
  pdf_storage_path text,
  constraint agreement_acceptances_user_version_unique unique (user_id, agreement_version_id)
);

create index if not exists agreement_acceptances_user_id_idx
  on public.agreement_acceptances (user_id);
create index if not exists agreement_acceptances_version_id_idx
  on public.agreement_acceptances (agreement_version_id);
create index if not exists agreement_acceptances_accepted_at_idx
  on public.agreement_acceptances (accepted_at desc);
create index if not exists agreement_versions_audience_published_at_idx
  on public.agreement_versions (audience, published_at desc nulls last);

comment on table public.agreement_versions is 'Published and draft user agreements (driver / rider), versioned.';
comment on table public.agreement_acceptances is 'User acceptance of a specific agreement version; audit + PDF path.';

alter table public.agreement_versions enable row level security;
alter table public.agreement_acceptances enable row level security;

-- No GRANT to anon/auth for direct access; service role and API use server-side clients.

-- Private bucket: uploads and signed URLs are server-side (service role) only.
insert into storage.buckets (id, name, public)
values ('agreement_pdfs', 'agreement_pdfs', false)
on conflict (id) do nothing;

-- Placeholder published agreements (same body; SHA-256 of UTF-8 string below)
-- Body: "Placeholder agreement text. Replace with legal v1.0 when ready."
insert into public.agreement_versions (
  audience,
  version_label,
  title,
  body,
  content_sha256,
  published_at
) values
(
  'driver',
  'v0.1-placeholder',
  'Driver platform agreement (placeholder)',
  'Placeholder agreement text. Replace with legal v1.0 when ready.',
  '079782a0a39468971624c886a9d799b543ff928d0edbe65b2bc7656fbdfe040b',
  now()
),
(
  'rider',
  'v0.1-placeholder',
  'Rider terms of use (placeholder)',
  'Placeholder agreement text. Replace with legal v1.0 when ready.',
  '079782a0a39468971624c886a9d799b543ff928d0edbe65b2bc7656fbdfe040b',
  now()
)
on conflict (audience, version_label) do nothing;
