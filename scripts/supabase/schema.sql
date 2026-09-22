-- silvergtm job-posting trigger pipeline — Supabase schema
-- Idempotent: safe to re-run in the SQL editor or via psql.
--
-- RLS: intentionally left OFF on all three tables. Loads run with the service
-- role key (scripts/supabase/load.mjs), which bypasses RLS anyway, and nothing
-- reads these tables from the browser/anon key. If an anon-key client is ever
-- pointed at this project, enable RLS here first and add explicit policies.

-- ---------------------------------------------------------------------------
-- ats_boards — one row per crawled board (ats + token, optionally scoped by
-- region/shard/site). board_key is built by the loader, not the DB, so that a
-- plain PostgREST upsert (Prefer: resolution=merge-duplicates) has a single,
-- always-present conflict target.
-- ---------------------------------------------------------------------------
create table if not exists ats_boards (
  board_key     text primary key,   -- ats:token:region:shard:site (empty segs for nulls)
  ats           text not null,
  token         text not null,
  region        text,
  shard         text,
  site          text,
  company_name  text,
  status        text,
  jobs_total    int,
  jobs_matched  int,
  url_count     int,
  crawls        text,
  fetched_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- ats_postings — one row per job posting seen on a board.
-- first_seen_at is set once by the default; the loader never sends that column,
-- so a merge-duplicates upsert refreshes last_seen_at and leaves it alone.
-- ---------------------------------------------------------------------------
create table if not exists ats_postings (
  posting_key     text primary key, -- ats:token:job_id
  ats             text not null,
  token           text not null,
  company_name    text,
  name_source     text,
  job_id          text not null,
  title_raw       text,
  title_bucket    text,
  seniority       text,
  published_at    timestamptz,
  location_raw    text,
  country         text,
  country_tier    text,
  remote          text,
  department      text,
  salary_min      numeric,
  salary_max      numeric,
  salary_currency text,
  apply_url       text,
  first_seen_at   timestamptz default now(),
  last_seen_at    timestamptz default now(),
  run_id          text
);

-- ---------------------------------------------------------------------------
-- hiring_companies — one row per company rolled up from its postings.
-- ---------------------------------------------------------------------------
create table if not exists hiring_companies (
  company_key       text primary key, -- normalized(company_name):ats:token
  company_name      text,
  domain            text,
  domain_conf       text,
  flag              text,             -- ok | verify | aggregator | nonicp | dup
  ats               text,
  token             text,
  n_postings        int,
  titles            text,
  buckets           text,
  seniority_max     text,
  earliest_published date,
  latest_published  date,
  countries         text,
  country_tier_min  text,
  remote_share      numeric,
  locations         text,
  run_id            text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists ats_postings_published_at_idx on ats_postings (published_at desc);
create index if not exists ats_postings_title_bucket_idx on ats_postings (title_bucket);
create index if not exists ats_postings_country_tier_idx on ats_postings (country_tier);
create index if not exists ats_postings_ats_token_idx    on ats_postings (ats, token);
create index if not exists ats_postings_run_id_idx       on ats_postings (run_id);

create index if not exists hiring_companies_flag_idx     on hiring_companies (flag);
create index if not exists hiring_companies_domain_idx   on hiring_companies (domain);
create index if not exists hiring_companies_latest_pub_idx on hiring_companies (latest_published desc);
create index if not exists hiring_companies_tier_min_idx on hiring_companies (country_tier_min);

create index if not exists ats_boards_ats_token_idx      on ats_boards (ats, token);

-- ---------------------------------------------------------------------------
-- v_hiring_companies_tier1 — the shortlist: clean companies hiring in tier-1
-- countries, freshest first.
-- ---------------------------------------------------------------------------
create or replace view v_hiring_companies_tier1 as
select *
from hiring_companies
where flag = 'ok'
  and country_tier_min = '1'
order by latest_published desc nulls last;
