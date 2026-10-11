#!/usr/bin/env bash
# UK home-extensions Maps leg: 8 run-scrape.js workers over the round-robin shards (shards-extensions-uk/),
# same pattern as 2026-10-11_us-pool-builders/run-shards.sh (sequential engine; run_log written only at
# the end — IMPROVEMENTS OPEN). Pass RESUME=1 to skip tiles already ok. CAL=1 runs the 3-row calibration
# sheet instead (one worker) — read its leads_clean.csv + run_log.json before launching the full sheet.
# Launch through the harness's background runner, never `nohup … &` inside a tool call (IMPROVEMENTS 2026-09-12).
# Needs SCRAPER_TECH_KEY in skills/google-maps-scrape/.env (the proxy-injected ScraperTech credential answered
# {"error":"Access denied"} on searchmaps.php from this container, 2026-10-11 — probe in RUN-NOTES.md).
set -u
cd "$(dirname "$0")/../../.."          # repo root
ENGINE=skills/google-maps-scrape
CLIENT=clients/atlas-growth
CFG=$CLIENT/atlas-growth-extensions-uk-config.json
RUN=$CLIENT/2026-10-11_uk-home-extensions-maps/maps
mkdir -p "$RUN"
EXTRA=""; [ "${RESUME:-0}" = 1 ] && EXTRA="--resume"
if [ "${CAL:-0}" = 1 ]; then
  node $ENGINE/run-scrape.js --runsheet $CLIENT/atlas-growth-extensions-uk-calibration-runsheet.csv \
    --config $CFG --out $RUN/calibration --max-retries 3 --stall 30 $EXTRA
  exit $?
fi
pids=(); idx=()
for i in 0 1 2 3 4 5 6 7; do
  node $ENGINE/run-scrape.js \
    --runsheet $CLIENT/shards-extensions-uk/shard-$i.csv \
    --config   $CFG \
    --out      $RUN/shard-$i \
    --max-retries 3 --stall 30 $EXTRA \
    >> $RUN/shard-$i.log 2>&1 &
  pids+=($!); idx+=($i)
done
echo "launched ${#pids[@]} workers: ${pids[*]}"
fail=0
for k in "${!pids[@]}"; do
  if wait "${pids[$k]}"; then echo "shard-${idx[$k]}: exit 0 (COMPLETE)"
  else rc=$?; echo "shard-${idx[$k]}: exit $rc (INCOMPLETE — do NOT proceed on this shard)"; fail=$((fail+1)); fi
done
echo "=== $fail shard(s) incomplete ==="
exit $fail
