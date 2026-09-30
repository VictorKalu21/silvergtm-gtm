#!/usr/bin/env bash
# RESUME variant: same 8 workers, but --resume skips the 590 tiles that already reached
# status:ok in the run the scraper.tech tariff killed. Scrapes the remaining 820 only.
# Launch N run-scrape.js workers over the round-robin shards, concurrently.
# WHY sharded: scrape.js is fully sequential and buffers to memory (IMPROVEMENTS, OPEN). ~1410 rows
# at ~4s/call is ~4h in one process, and a kill before the end loses everything. Eight workers each
# persist their own leads_clean.csv, so a failure is isolated and resumable.
# ALWAYS run-scrape.js, never scrape.js: the wrapper audits per-cell status and auto-refills tiles
# that never reached status:ok, then exits 1 if it could not heal them.
set -u
cd "$(dirname "$0")/../../.."          # repo root
ENGINE=skills/google-maps-scrape
CLIENT=clients/atlas-growth
RUN=clients/atlas-growth/2026-09-11_foundation-repair
pids=(); idx=()
for i in 0 1 2 3 4 5 6 7; do
  node $ENGINE/run-scrape.js \
    --runsheet $CLIENT/shards/shard-$i.csv \
    --config   $CLIENT/atlas-growth-config.json \
    --out      $RUN/shard-$i \
    --max-retries 3 --stall 30 --resume \
    > $RUN/shard-$i.resume.log 2>&1 &
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
