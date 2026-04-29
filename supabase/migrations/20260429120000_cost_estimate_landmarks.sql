-- cost_estimate_zones + cost_estimate_landmarks (portal-managed; Edge Function reads landmarks).
-- Seed: zones only (from pricing.ts). Landmarks start empty — no data from landmarks.json.

drop table if exists public.cost_estimate_landmarks cascade;
drop table if exists public.cost_estimate_zones cascade;

drop function if exists public.set_cost_estimate_landmarks_updated_at();
drop function if exists public.touch_cost_estimate_updated_at();

create table public.cost_estimate_zones (
    code text not null,
    label text not null default '',
    sort_order integer not null default 0,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint cost_estimate_zones_pkey primary key (code)
);

create table public.cost_estimate_landmarks (
    id uuid not null default gen_random_uuid(),
    name text not null,
    aliases text[] not null default '{}'::text[],
    lat double precision not null,
    lng double precision not null,
    area text not null,
    zone_code text not null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint cost_estimate_landmarks_pkey primary key (id),
    constraint cost_estimate_landmarks_zone_code_fkey foreign key (zone_code) references public.cost_estimate_zones (code) on delete restrict
);

create unique index cost_estimate_landmarks_name_lower_key on public.cost_estimate_landmarks (lower(trim(name)));

create index cost_estimate_landmarks_zone_code_idx on public.cost_estimate_landmarks (zone_code);

alter table public.cost_estimate_zones enable row level security;

alter table public.cost_estimate_landmarks enable row level security;

create or replace function public.touch_cost_estimate_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cost_estimate_zones_set_updated_at
  before update on public.cost_estimate_zones
  for each row
  execute function public.touch_cost_estimate_updated_at();

create trigger cost_estimate_landmarks_set_updated_at
  before update on public.cost_estimate_landmarks
  for each row
  execute function public.touch_cost_estimate_updated_at();

insert into public.cost_estimate_zones (code, label, sort_order) values
  ('CENTRAL', 'Central Georgetown', 10),
  ('EAST_BANK', 'East Bank Demerara', 20),
  ('EAST_COAST', 'East Coast Demerara', 30),
  ('WEST_COAST', 'West Coast Demerara', 40),
  ('WEST_BANK', 'West Bank Demerara', 50),
  ('AIRPORT', 'CJIA / Timehri', 60),
  ('LINDEN', 'Linden', 70),
  ('BERBICE', 'Berbice', 80),
  ('ESSEQUIBO', 'Essequibo Coast', 90),
  ('INTERIOR', 'Interior / Hinterland', 100);
