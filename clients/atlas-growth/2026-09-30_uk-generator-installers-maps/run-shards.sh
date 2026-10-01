#!/usr/bin/env bash
# UK generator installers — Maps leg: 8 run-scrape.js workers over the round-robin shards
# (clients/atlas-growth/shards-generators-uk/, written by gen-runsheet-generators-uk.js), same
# pattern and reasons as the 2026-09-16 UK foundation run (sequential engine, run_log written only
# at the end — IMPROVEMENTS OPEN). Pass RESUME=1 to skip tiles already ok.
#
# Key: skills/google-maps-scrape/.env must hold SCRAPER_TECH_KEY (gitignored; ask the operator).
# Run the 3-row CALIBRATION sheet first and read GATE1.md before launching this:
#   node skills/google-maps-scrape/run-scrape.js \
#     --runsheet clients/atlas-growth/atlas-growth-generators-uk-calibration-runsheet.csv \
#     --config   clients/atlas-growth/atlas-growth-generators-uk-config.json \
#     --out      clients/atlas-growth/2026-09-30_uk-generator-installers-maps/calibration --max-retries 3
set -u
cd "$(dirname "$0")/../../.."          # repo root
ENGINE=skills/google-maps-scrape
CLIENT=clients/atlas-growth
RUN=$CLIENT/2026-09-30_uk-generator-installers-maps
if ! grep -q '^SCRAPER_TECH_KEY=.\+' "$ENGINE/.env" 2>/dev/null; then
  echo "ERROR: $ENGINE/.env has no SCRAPER_TECH_KEY — nothing launched" >&2; exit 2
fi
EXTRA=""; [ "${RESUME:-0}" = 1 ] && EXTRA="--resume"
pids=(); idx=()
for i in 0 1 2 3 4 5 6 7; do
  node $ENGINE/run-scrape.js \
    --runsheet $CLIENT/shards-generators-uk/shard-$i.csv \
    --config   $CLIENT/atlas-growth-generators-uk-config.json \
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
