#!/usr/bin/env bash
# One-command runner for the shopify-not-on-amazon pipeline. Resume-safe: every step skips what is already done, so re-running
# after a crash, a throttle, or a Haiku step just continues. The two Haiku steps (classify, lead review) need an agent: the script
# writes the batch files, prints the prompt location, and exits with code 3 until every batch has its _out.json. Then run again.
#
#   DIR=~/clients/amazon-leads RUN=us DATAFORSEO_LOGIN=.. DATAFORSEO_PASSWORD=.. ./run-all.sh top-1m.csv
#   env: FROM/TO (Tranco rank window, default 1-300000) MIN_TRAFFIC (50000) GATE_CONC (4) GATE_DELAY (1000) VERIFY_CONC (2)
#        SOURCE_CSV (skip the DNS seed and use this domain,rank CSV, e.g. an HTTP Archive export)  N (100; 0 = whole pool)
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; export DIR="${DIR:-.}" RUN="${RUN:-run}"
TRANCO="${1:-top-1m.csv}"; MIN_TRAFFIC="${MIN_TRAFFIC:-50000}"
step() { printf '\n== %s\n' "$*"; }
need_agent() { local pat="$1" prompt="$2"; local missing=0; for f in "$DIR"/${RUN}_${pat}_*.json; do [[ "$f" == *_out.json ]] && continue; [[ -f "$f" ]] || continue; [[ -f "${f%.json}_out.json" ]] || { missing=1; echo "  needs a Haiku judge: $f -> ${f%.json}_out.json"; }; done; [[ $missing == 0 ]] || { echo "Dispatch one claude-haiku-4-5 subagent per batch with the $prompt prompt in SKILL.md, then re-run this script."; exit 3; }; }

if [[ ! -f "$DIR/${RUN}_input.json" ]]; then
  if [[ -n "${SOURCE_CSV:-}" ]]; then step "prep-input from $SOURCE_CSV"; node "$S/prep-input.mjs" "$SOURCE_CSV"
  else step "seed: Tranco x DNS (${FROM:-1}-${TO:-300000})"; FROM="${FROM:-1}" TO="${TO:-300000}" node "$S/seed-tranco-dns.mjs" "$TRANCO"; node "$S/prep-input.mjs" "$DIR/${RUN}_seed.csv"; fi
fi
if [[ -n "${DATAFORSEO_LOGIN:-}" && ! -f "$DIR/${RUN}_input_all.json" ]]; then
  step "traffic gate BEFORE the gates (DataForSEO, ~\$0.11 per 1,000 domains) -> keep >= $MIN_TRAFFIC visits"
  SOURCE=input node "$S/dataforseo.mjs" traffic; MIN_TRAFFIC="$MIN_TRAFFIC" node "$S/prep-input.mjs" --filter
fi
step "free gates (CONC=${GATE_CONC:-4} DELAY=${GATE_DELAY:-1000}; residential IP recommended)"; CONC="${GATE_CONC:-4}" DELAY="${GATE_DELAY:-1000}" node "$S/pipeline.mjs"
step "gates: one retry of blocked / catalog-less rows"; RETRY=1 CONC=3 DELAY=1500 node "$S/pipeline.mjs" || true
step "amazon autocomplete demand"; SOURCE=signal node "$S/amazon-autocomplete.mjs"
step "classify batches (incremental)"; BATCH=100 node "$S/prep-classify.mjs"; need_agent review_batch "step 8 classify"
step "merge classify"; node "$S/merge.mjs" classify
step "amazon verify, full strength (accumulates; re-run to retry blocked)"; CONC="${VERIFY_CONC:-2}" SEARCH_PASSES=2 BF_VARIANTS=3 MAX_DP=5 node "$S/amazon-verify.mjs"; RETRY=1 CONC="${VERIFY_CONC:-2}" SEARCH_PASSES=2 BF_VARIANTS=3 MAX_DP=5 node "$S/amazon-verify.mjs" || true
step "contacts"; node "$S/enrich-contacts.mjs"
step "lead review batches (incremental)"; node "$S/prep-lead-review.mjs"; need_agent lead_review "step 8b lead review"
step "review guard"; node "$S/review-guard.mjs"
if [[ -n "${DATAFORSEO_LOGIN:-}" ]]; then step "amazon branded search volume on the keeps"; node "$S/dataforseo.mjs" amazon-volume; fi
step "merge final"; CAP_SHARE="${CAP_SHARE:-1}" node "$S/merge.mjs" final
step "select (denylist.json in DIR; DELIVERED=prior csvs)"; N="${N:-100}" CAP_SHARE="${CAP_SHARE_SELECT:-0.25}" node "$S/select.mjs"
echo; echo "done -> $DIR/${RUN}_SELECT.csv  (pool: $DIR/${RUN}_LEADS_full.csv)"
