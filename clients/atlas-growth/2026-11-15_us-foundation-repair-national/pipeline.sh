#!/usr/bin/env bash
# Post-scrape chain for the national run (same steps the 2026-11-15 test ran), every step through the engine.
# Idempotent: a step whose output exists is skipped (delete it to redo). Usage: bash <run>/pipeline.sh [step]
# Steps: merge | qualify | geo | collapse | fetch | classify-prep | leadgen   (no arg = all, in order)
set -euo pipefail
cd "$(dirname "$0")/../../.."          # repo root
E=skills/google-maps-scrape
C=clients/atlas-growth
R=$C/2026-11-15_us-foundation-repair-national
F=$R/full
CFG=$C/atlas-growth-foundation-us-config.json
SHEET=$C/atlas-growth-foundation-us-runsheet.csv
export NODE_USE_ENV_PROXY=1
step=${1:-all}
want() { [ "$step" = all ] || [ "$step" = "$1" ]; }
mkdir -p $F

if want merge; then
  [ -s $F/leads_clean.csv ] && echo "[merge] skip" || node $R/merge-shards.js --shards maps --out full
fi
if want qualify; then
  if [ ! -s $F/leads_qualified.csv ]; then
    node $E/qualify-leads.js --in $F/leads_clean.csv --config $CFG --out $F
    mkdir -p $F/recover
    node $E/qualify-leads.js --in $F/excluded_officp.csv --config $C/recover-generic-foundation-us-config.json --out $F/recover
    node $R/union-qualified.js --dir full
  else echo "[qualify] skip"; fi
fi
if want geo; then
  # whole US is the footprint: keep every domestic pin, drop only foreign-country addresses
  [ -s $F/leads_clean_qualified_infootprint.csv ] && echo "[geo] skip" || \
    node $E/footprint-gate.js --in $F/leads_qualified.csv --runsheet $SHEET --config $CFG --out $F --keep-domestic
fi
# STEP 5c cross-run dedupe: WAIVED by the operator 2026-11-15 (the 2026-09-11 10-state list was never sent).
if want collapse; then
  [ -s $F/leads_domains.csv ] && echo "[collapse] skip" || \
    node $E/collapse-domains.js --in $F/leads_clean_qualified_infootprint.csv --out $F --config $CFG
fi
if want fetch; then
  [ -s $F/owner/site_text.jsonl ] && echo "[fetch] skip" || \
    node $E/fetch-sites.js --in $F/leads_domains.csv --out $F/owner --concurrency 12
fi
if want classify-prep; then
  [ -d $F/classify ] && echo "[classify-prep] skip" || \
    node $E/prep-classify.js --leads $F/leads_domains.csv --site $F/owner/site_text.jsonl --out $F/classify --batch 90
fi
if want leadgen; then
  node $R/flag-leadgen.js --leads $F/leads_annotated.csv --site $F/owner/site_text.jsonl --out $F
fi
echo "=== next: Haiku fit read per classify/batch_NNN.jsonl -> classify/out/, then apply-classify --fallback unclassified ==="
