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

echo; echo "=== 4. geo pass 1: 12 states, hub gate OFF (sparse KS/MS need it off) ==="
node $E/footprint-gate.js --in $R/leads_qualified_all.csv --runsheet $C/atlas-growth-runsheet.csv \
  --config $C/atlas-growth-config.json --out $R --keep-domestic \
  --regions "TX,KS,MO,OK,LA,MS,CO,GA,AL,AR,TN,FL" | tail -4

echo; echo "=== 5. split TN/FL + split address-less SABs ==="
node $R/split-tnfl.js --in $R/leads_clean_qualified_infootprint.csv --runsheet $C/atlas-growth-runsheet.csv --out $R
node $R/sab-split.js --in $R/infootprint_10state.csv --out $R

echo; echo "=== 6. geo pass 2: TN/FL vs the 3 border tiles only (drops Nashville/Miami/Tampa) ==="
mkdir -p $R/border
node $E/footprint-gate.js --in $R/tnfl.csv --runsheet $R/border-runsheet.csv \
  --config $C/atlas-growth-config.json --out $R/border --hub-radius-deg 1.0 | tail -4

echo; echo "=== 7. geo pass 3: address-less SABs by hub distance vs ALL tiles ==="
mkdir -p $R/sab
node $E/footprint-gate.js --in $R/sab_nostate.csv --runsheet $C/atlas-growth-runsheet.csv \
  --config $C/atlas-growth-config.json --out $R/sab --hub-radius-deg 1.0 | tail -4
node $R/sab-backfill-city.js --in $R/sab/leads_clean_qualified_infootprint.csv \
  --runsheet $C/atlas-growth-runsheet.csv --out $R/sab/sab_final.csv

echo; echo "=== 8. assemble the three geo tracks ==="
node $R/assemble.js

echo; echo "=== 9. cross-run dedupe (per client) ==="
node $E/build-netnew.js --new $R/leads_infootprint_final.csv --client $C --out $R/leads_netnew.csv

echo; echo "=== 10. collapse domains + route shared hosts ==="
node $E/collapse-domains.js --in $R/leads_netnew.csv --out $R --config $C/atlas-growth-config.json

echo; echo "=== DONE. Next: fetch-sites -> prep-classify -> in-session fit classify -> apply-classify -> qualify on business_type ==="
