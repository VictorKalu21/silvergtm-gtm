# Supabase load (job-posting triggers)
Apply the schema once: paste `schema.sql` into the Supabase SQL editor, or
`psql "$SUPABASE_DB_URL" -f scripts/supabase/schema.sql` (Project settings -> Database ->
Connection string). Idempotent. RLS stays off — service-key loads only.
Env (server-side only):
    export SUPABASE_URL=https://<project-ref>.supabase.co
    export SUPABASE_SERVICE_KEY=<service_role key>
Load in this order:
    node scripts/supabase/load.mjs --table ats_boards       --csv out/boards.csv    --run-id 2026-09-22
    node scripts/supabase/load.mjs --table ats_postings     --csv out/postings.csv  --run-id 2026-09-22
    node scripts/supabase/load.mjs --table hiring_companies --csv out/companies.csv --run-id 2026-09-22
`--dry-run` prints the first batch payload and row counts without sending (no env needed);
`--batch N` sets batch size (default 500). All loads upsert on the primary key; postings
refresh last_seen_at and never overwrite first_seen_at.
Shortlist view: `v_hiring_companies_tier1` (flag='ok', country_tier_min='1', newest first).
