#!/usr/bin/env bash
# Keenable sweep over sweep_in/leads_sweep.csv in resumable chunks of 500 leads (cost file written per chunk); aborts on repeated 401/402
# or credits-per-lead > 2.5. Total cap 6,946 searches (= ceil(2894*2*1.2)). Key from the skill .env (never printed). Run from repo root.
set -u
cd "$(dirname "$0")/../../.."
R=clients/atlas-growth/2026-11-12_us-concrete-contractors-maps; O=$R/sweep_in/serp; mkdir -p $O
total_calls=0; total_credits=0
for chunk in 1 2 3 4 5 6; do
  lim=500
  node skills/google-maps-scrape/search-owner.js --leads $R/sweep_in/leads_sweep.csv --config clients/atlas-growth/atlas-growth-concrete-config.json \
     --out $O --backend keenable --max-calls 1400 --concurrency 4 --limit $lim --resume > $R/sweep_in/chunk$chunk.log 2>&1
  rc=$?
  cp $O/serp_cost.json $R/sweep_in/chunk$chunk.cost.json
  calls=$(node -e "const c=require('./$O/serp_cost.json');console.log(c.calls_this_run)"); cred=$(node -e "const c=require('./$O/serp_cost.json');console.log(c.credits_used_this_run)")
  e4=$(node -e "const c=require('./$O/serp_cost.json').errors_by_http;console.log((c['401']||0)+(c['402']||0))")
  done_l=$(node -e "const c=require('./$O/serp_cost.json');console.log(c.leads_done_this_run)")
  echo "chunk $chunk: rc=$rc leads_done=$done_l calls=$calls credits=$cred 401/402=$e4"
  total_calls=$((total_calls+calls))
  [ "$e4" -ge 3 ] && { echo "ABORT: repeated 401/402"; exit 2; }
  [ "$done_l" -gt 0 ] && awk -v c=$cred -v l=$done_l 'BEGIN{exit !(c/l>2.5)}' && { echo "ABORT: credits per lead >2.5"; exit 3; }
  [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ] && { echo "ABORT rc=$rc"; exit 4; }
  [ "$done_l" -lt 500 ] && break
done
echo "SWEEP DONE total_calls=$total_calls"
