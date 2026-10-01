#!/usr/bin/env bash
# Replay the ENTIRE deterministic ($0, no API) chain from the merged scrape output.
# Idempotent: safe to re-run after a rule change or after the remaining tiles are scraped.
# Everything here is deterministic — the only paid step in the whole pipeline is the scrape itself.
set -euo pipefail
cd "$(dirname "$0")/../../.."                 # repo root
E=skills/google-maps-scrape
C=clients/atlas-growth
R=$C/2026-09-11_foundation-repair

echo "=== 0. merge shards (place_id dedupe; rejoins google_types with '|', NOT ';' — see IMPROVEMENTS) ==="
node $R/merge-shards.js

echo; echo "=== 1. qualify (main rules) ==="
node $E/qualify-leads.js --in $R/leads_clean.csv --config $C/atlas-growth-config.json --out $R

echo; echo "=== 2. recovery: generic contractor types WITH a foundation name token ==="
mkdir -p $R/recover
node $E/qualify-leads.js --in $R/excluded_officp.csv --config $C/recover-generic-config.json --out $R/recover

echo; echo "=== 3. merge the two qualify passes ==="
node $R/merge-qualified.js

echo; echo "=== 4. geo: drop FOREIGN only, keep all US (client directive 2026-09-11) ==="
# --keep-domestic and NO --regions: the hub gate is off (sparse KS/MS need it off) and the region
# allow-list is gone, so only non-US pins drop. The 10-state footprint becomes a SEGMENT, applied as
# a tag in step 5, not a filter — the operator decides whether to work the spillover.
node $E/footprint-gate.js --in $R/leads_qualified_all.csv --runsheet $C/atlas-growth-runsheet.csv \
  --config $C/atlas-growth-config.json --out $R --keep-domestic | tail -4

echo; echo "=== 5. tag in_footprint (yes / border / spillover / unknown) — nothing dropped ==="
node $R/tag-footprint.js --in $R/leads_clean_qualified_infootprint.csv \
  --runsheet $C/atlas-growth-runsheet.csv --out $R/leads_tagged.csv --border-deg 1.0

echo; echo "=== 6. backfill city for address-less SABs (guarded: no metro inferred beyond 1.5deg) ==="
node $R/sab-backfill-city.js --in $R/leads_tagged.csv \
  --runsheet $C/atlas-growth-runsheet.csv --out $R/leads_infootprint_final.csv --maxdeg 1.5

echo; echo "=== 7. cross-run dedupe (per client) ==="
node $E/build-netnew.js --new $R/leads_infootprint_final.csv --client $C --out $R/leads_netnew.csv

echo; echo "=== 8. collapse domains + route shared hosts ==="
node $E/collapse-domains.js --in $R/leads_netnew.csv --out $R --config $C/atlas-growth-config.json

echo; echo "=== DONE. Next: fetch-sites -> prep-classify -> in-session fit classify -> apply-classify -> qualify on business_type ==="
