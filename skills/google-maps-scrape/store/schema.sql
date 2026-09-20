-- google-maps-scrape :: Supabase store schema (DRAFT 2026-09-20, awaiting operator approval).
-- Companion to the IMPROVEMENTS.md entry "OPEN 2026-09-20: store.js — a cross-run Supabase store".
-- Purpose: a second run of the same country is a QUERY, not a re-buy. Fetches, verdicts and registry
-- matches become reusable across runs. This is the gitignored data's new home and nothing more:
-- no PII is ever committed to the repo; it lives in the project this schema is applied to.
--
-- Apply once with the Supabase SQL editor (or `psql "$SUPABASE_DB_URL" -f schema.sql`).
-- All writes go through the service-role key held ONLY in skills/google-maps-scrape/.env
-- (SUPABASE_URL, SUPABASE_SERVICE_KEY). Row-level security stays ON with no anon policies, so the
-- anon key can read nothing.

create extension if not exists pgcrypto;

-- One row per run. `config` is the client config as run (so a verdict can be traced to its rules).
create table if not exists runs (
  run_id      text primary key,                    -- e.g. atlas-growth/2026-09-20_au-foundation-repair-maps
  client      text not null,
  country     text not null,                       -- iso-2 lowercase as passed to scraper.tech (au, gb, us)
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  config      jsonb not null default '{}'::jsonb
);

-- Every Maps row ever bought, keyed on Google's stable id. first/last_seen make cross-run dedupe a query.
create table if not exists places (
  place_id       text primary key,
  business_id    text,
  name           text not null,
  country        text not null,
  lat            double precision,
  lng            double precision,
  full_address   text,
  city           text,
  region         text,                             -- state/region token as parsed by geo.region_from_city
  website        text,
  root_domain    text,
  google_types   text[] not null default '{}',     -- split on '|' at write time; never stored joined
  review_count   integer,
  rating         numeric(3,2),
  first_seen_run text references runs(run_id),
  last_seen_run  text references runs(run_id),
  raw            jsonb not null default '{}'::jsonb
);
create index if not exists places_root_domain_idx on places (root_domain);
create index if not exists places_country_region_idx on places (country, region);

-- One fetch per root domain. `source` = plain | retry | firecrawl | scrapling; `pages` = the L1/L2 urls read.
create table if not exists site_text (
  root_domain      text primary key,
  fetched_at       timestamptz not null default now(),
  status           text not null,                  -- ok | 403 | timeout | dead | thin | ...
  source           text not null,
  pages            jsonb not null default '[]'::jsonb,
  text             text,
  emails           jsonb not null default '[]'::jsonb,
  emails_by_source jsonb not null default '{}'::jsonb
);

-- One verdict per address. A verdict younger than 90 days is reused and never re-bought (store.js enforces it).
create table if not exists email_verdicts (
  email       text primary key,
  mv_result   text,                                -- MillionVerifier raw result
  bb_result   text,                                -- BounceBan raw result (null when not routed)
  verdict     text not null,                       -- sendable | risky | dropped | unverified
  detail      text,
  verified_at timestamptz not null default now()
);
create index if not exists email_verdicts_verified_at_idx on email_verdicts (verified_at);

-- Registry matches: Companies House, the Australian state licence boards, ABN, and any future registry.
create table if not exists registry_matches (
  place_id   text not null references places(place_id) on delete cascade,
  registry   text not null,                        -- companies_house | nsw_fair_trading | qbcc | vba | wa_building_energy | sa_cbs | abn
  match_key  text not null,                        -- company number / licence number / ABN
  basis      text,                                 -- exact_title | postcode | name_overlap | title_contains+town | city_only | licence_class
  confidence text,                                 -- matched | low_confidence
  officers   jsonb not null default '[]'::jsonb,   -- [{name, role, appointed_on, resigned_on, status}]
  matched_at timestamptz not null default now(),
  primary key (place_id, registry, match_key)
);

-- Named people, one row per (place, name, run). `source` mirrors the reader enum; `evidence` is verbatim.
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  place_id    text not null references places(place_id) on delete cascade,
  name        text not null,
  first_name  text,
  title       text,
  role_bucket text not null,                       -- owner_or_partner | gm | marketing | sales_manager | office_manager | other
  source      text not null,                       -- companies_house (= registry) | website | serp | model_read
  evidence    text,
  confidence  text,
  run_id      text references runs(run_id),
  unique (place_id, name, run_id)
);

-- Credit spend recorded once, at the moment it happens, instead of reconstructed from logs.
create table if not exists ledger (
  id        bigint generated always as identity primary key,
  run_id    text references runs(run_id),
  service   text not null,                         -- scraper_tech_maps | firecrawl | millionverifier | bounceban | quickenrich | ...
  credits   integer not null,
  note      text,
  logged_at timestamptz not null default now()
);

-- Raw shard directories go to Supabase Storage bucket `run-shards` as <run_id>/shard-N.tar.gz so a run can be
-- resumed from any session without the tarball hand-off the UK run needed. Bucket is private; created by store.js
-- on first use if the service key allows it.

alter table runs             enable row level security;
alter table places           enable row level security;
alter table site_text        enable row level security;
alter table email_verdicts   enable row level security;
alter table registry_matches enable row level security;
alter table contacts         enable row level security;
alter table ledger           enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads or writes.
