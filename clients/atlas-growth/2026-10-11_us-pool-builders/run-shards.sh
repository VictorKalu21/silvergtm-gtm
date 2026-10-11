#!/usr/bin/env bash
# Warm-states Maps leg: 8 run-scrape.js workers over the round-robin shards (shards-pools/), same pattern
# and reasons as 2026-09-24_us-generator-dealers/run-shards.sh (sequential engine; run_log written only at
# the end — IMPROVEMENTS OPEN). Pass RESUME=1 to skip tiles already ok. Launch through the harness's
# background runner, never `nohup … &` inside a tool call (IMPROVEMENTS 2026-09-12).
set -u
cd "$(dirname "$0")/../../.."          # repo root
ENGINE=skills/google-maps-scrape
CLIENT=clients/atlas-growth
RUN=$CLIENT/2026-10-11_us-pool-builders/maps
mkdir -p "$RUN"
EXTRA=""; [ "${RESUME:-0}" = 1 ] && EXTRA="--resume"
pids=(); idx=()
for i in 0 1 2 3 4 5 6 7; do
  node $ENGINE/run-scrape.js \
    --runsheet $CLIENT/shards-pools/shard-$i.csv \
    --config   $CLIENT/atlas-growth-pools-config.json \
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
