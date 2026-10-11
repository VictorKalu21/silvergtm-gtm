#!/usr/bin/env bash
# Watchdog-chunked site fetch for the residue (owner/domains-retry.csv from merge-fetch.js --residue).
# Why: a fetch-sites.js worker pool can stall on one pathological page (two 5,706-row shards froze at 730 and
# 51 records at ~95% CPU) or exit silently before its retry pass. Chunks of $CHUNK rows run one process each
# under `timeout`; a chunk that hits the limit is logged to owner/fetch-chunks.timeouts and skipped (bisect it
# by re-running with a smaller CHUNK). Output dirs fetch-1NN are picked up by merge-fetch.js. Resumable: a chunk
# whose site_text.jsonl already has rows is skipped. Chunk files live in owner/chunks-$BASE so parallel runs
# (different BASE) never overwrite each other's part files (2026-10-11: shared owner/chunks/ collided).
set -u
cd "$(dirname "$0")/../../.."
E=skills/google-maps-scrape; R=clients/atlas-growth/2026-10-11_us-pool-builders
IN=${IN:-$R/owner/domains-retry.csv}; CHUNK=${CHUNK:-400}; LIMIT=${LIMIT:-900}; CONC=${CONC:-12}; BASE=${BASE:-100}
hdr=$(head -1 "$IN"); total=$(($(wc -l < "$IN") - 1)); n=0; i=0
C=$R/owner/chunks-$BASE; rm -rf $C; mkdir -p $C   # chunk dir keyed by BASE so parallel runs never share part files
tail -n +2 "$IN" | split -l $CHUNK -d -a 3 - $C/part-
for p in $C/part-???; do
  idx=$((BASE + i)); i=$((i+1)); out=$R/owner/fetch-$idx
  if [ -s $out/site_text.jsonl ]; then echo "[chunk $idx] skip (has rows)"; continue; fi
  { echo "$hdr"; cat "$p"; } > $p.csv
  rows=$(($(wc -l < $p.csv) - 1))
  echo "[chunk $idx] $rows rows -> $out (limit ${LIMIT}s)"
  timeout $LIMIT node $E/fetch-sites.js --in $p.csv --out $out --concurrency $CONC --config clients/atlas-growth/atlas-growth-pools-config.json > $out.log 2>&1
  rc=$?
  if [ $rc -eq 124 ]; then echo "[chunk $idx] TIMEOUT after ${LIMIT}s ($(wc -l < $out/site_text.jsonl 2>/dev/null || echo 0) rows written)"; echo "$idx $p.csv" >> $R/owner/fetch-chunks.timeouts; fi
  n=$((n+rows))
done
echo "chunks done: $n rows processed; timeouts: $(wc -l < $R/owner/fetch-chunks.timeouts 2>/dev/null || echo 0)"
