#!/usr/bin/env bash
# Post-scrape chain, SKILL STEP 5 -> 6 step 1, every step through the engine. Idempotent: a step whose
# output exists is skipped (delete the output to redo). Run from anywhere: bash <run>/pipeline.sh [step]
# Steps: merge | qualify | geo | dedupe | collapse | fetch | classify-prep   (no arg = all, in order)
# Mirrors 2026-10-11_us-pool-builders/pipeline.sh with the UK differences: areas-mode geo gate WITHOUT
# --keep-domestic (the UK grid is the footprint; US/IE bleed drops as far_from_hubs / wrong_country),
# three recovery passes, and a cross-run dedupe against the 2026-09-16 UK foundation runs that is
# MANDATORY unless the operator waives it (those feeds are not on this container: `ref files used: 0`).
set -euo pipefail
cd "$(dirname "$0")/../../.."          # repo root
E=skills/google-maps-scrape
C=clients/atlas-growth
R=$C/2026-10-11_uk-home-extensions-maps
CFG=$C/atlas-growth-extensions-uk-config.json
RS=$C/atlas-growth-extensions-uk-runsheet.csv
step=${1:-all}
want() { [ "$step" = all ] || [ "$step" = "$1" ]; }

if want merge; then
  if [ ! -s $R/maps/leads_clean.csv ]; then
    node $R/merge-shards.js
    node -e "const s=require('./$R/maps/coverage_summary.json'); if(!s.all_complete){console.error('INCOMPLETE SHARDS '+s.incomplete_shards.join(','));process.exit(1)}"
  else echo "[merge] skip (maps/leads_clean.csv exists)"; fi
fi
if want qualify; then
  if [ ! -s $R/leads_qualified.csv ]; then
    node $E/qualify-leads.js --in $R/maps/leads_clean.csv --config $CFG --out $R/maps
    for t in baretype generic unrated baretype-unrated generic-unrated; do
      node $E/qualify-leads.js --in $R/maps/excluded_officp.csv --config $C/recover-$t-extensions-uk-config.json --out $R/maps/recover-$t
    done
    # lever L4 (operator): the 1-4 review band with a website — LOWRATED=1 bash pipeline.sh qualify
    [ "${LOWRATED:-0}" = 1 ] && node $E/qualify-leads.js --in $R/maps/excluded_officp.csv --config $C/recover-lowrated-extensions-uk-config.json --out $R/maps/recover-lowrated
    node $R/union-qualified.js --run $R
  else echo "[qualify] skip"; fi
fi
if want geo; then
  if [ ! -s $R/leads_clean_qualified_infootprint.csv ]; then
    node $E/footprint-gate.js --in $R/leads_qualified.csv --runsheet $RS --config $CFG --out $R
  else echo "[geo] skip"; fi
fi
if want dedupe; then
  if [ ! -s $R/leads_netnew.csv ]; then
    # Cross-run dedupe WAIVED by the operator 2026-10-11 ("waive dedupe": the 2026-09-16 UK foundation feeds are not on
    # this container). Run for the record; on `ref files used: 0` the in-footprint file passes through unchanged.
    node $E/build-netnew.js --new $R/leads_clean_qualified_infootprint.csv --client $C --out $R/leads_netnew.csv || true
    [ -s $R/leads_netnew.csv ] || cp $R/leads_clean_qualified_infootprint.csv $R/leads_netnew.csv
  else echo "[dedupe] skip"; fi
fi
if want collapse; then
  if [ ! -s $R/leads_domains.csv ]; then
    node $E/collapse-domains.js --in $R/leads_netnew.csv --out $R --config $CFG
  else echo "[collapse] skip"; fi
fi
if want fetch; then
  if [ ! -s $R/owner/site_text.jsonl ]; then
    [ -f $R/owner-prompt.md ] || { echo "owner-prompt.md missing (STEP 6a gate)"; exit 1; }
    node $E/fetch-sites.js --in $R/leads_domains.csv --out $R/owner --concurrency 12 --config $CFG
  else echo "[fetch] skip"; fi
fi
if want classify-prep; then
  if [ ! -d $R/classify/in ]; then
    node $E/prep-classify.js --leads $R/leads_domains.csv --site $R/owner/site_text.jsonl --out $R/classify --batch 60
    echo "next: one Haiku reader per classify/in/batch_NNN.jsonl with $R/classify-prompt.md, then apply-classify.js --fallback unclear"
  else echo "[classify-prep] skip"; fi
fi
