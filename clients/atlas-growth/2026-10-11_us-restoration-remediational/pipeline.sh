#!/usr/bin/env bash
# Post-import chain, SKILL STEP 5b -> 6 step 1, every step through the engine. Idempotent: a step whose output
# exists is skipped (delete the output to redo). Run from anywhere: bash <run>/pipeline.sh [step]
# Steps: import | qualify | dedupe | collapse | fetch | classify-prep   (no arg = all, in order)
# NO geo step: directory import (no runsheet tiles); every row carries a US state + ZIP from the source — RUN-NOTES.
set -euo pipefail
cd "$(dirname "$0")/../../.."          # repo root
E=skills/google-maps-scrape
C=clients/atlas-growth
R=$C/2026-10-11_us-restoration-remediational
CFG=$C/atlas-growth-restoration-config.json
SRC=${SRC:-/tmp/claude-0/-home-user-silvergtm-gtm/0276f050-0471-5f8f-a014-67f25d17e6af/scratchpad/remediational/remediational_merged.csv}
step=${1:-all}
want() { [ "$step" = all ] || [ "$step" = "$1" ]; }

if want import; then
  if [ ! -s $R/leads_clean.csv ]; then node $R/import-remediational.js --in "$SRC" --out $R/leads_clean.csv
  else echo "[import] skip"; fi
fi
if want qualify; then
  if [ ! -s $R/leads_clean_qualified.csv ]; then node $E/qualify-leads.js --in $R/leads_clean.csv --config $CFG --out $R
  else echo "[qualify] skip"; fi
fi
if want dedupe; then
  if [ ! -s $R/leads_netnew.csv ]; then
    # Prior shipped feeds are not on this container (gitignored) — run for the record; operator waives or supplies (RUN-NOTES).
    node $E/build-netnew.js --new $R/leads_clean_qualified.csv --client $C --out $R/leads_netnew.csv || true
    [ -s $R/leads_netnew.csv ] || cp $R/leads_clean_qualified.csv $R/leads_netnew.csv
  else echo "[dedupe] skip"; fi
fi
if want collapse; then
  if [ ! -s $R/leads_domains.csv ]; then node $E/collapse-domains.js --in $R/leads_netnew.csv --out $R --config $CFG
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
    # prep-classify keys site text by place_id; fan each domain representative's record to its siblings (franchise branches
    # share the brand site) so a branch is classified on the brand text, not as 'unclear'. Same step as the pool run.
    node -e "
const fs=require('fs');const sib=JSON.parse(fs.readFileSync('$R/domain_siblings.json','utf8'));const recs=fs.readFileSync('$R/owner/site_text.jsonl','utf8').split(/\\r?\\n/).filter(Boolean).map(l=>JSON.parse(l));
const byId=new Map(recs.map(r=>[r.place_id,r]));let fanned=0;const out=recs.map(r=>JSON.stringify(r));
for(const [s,rep] of Object.entries(sib)){const r=byId.get(rep);if(r&&!byId.has(s)){out.push(JSON.stringify({...r,place_id:s,fanned_from:rep}));fanned++}}
fs.writeFileSync('$R/owner/site_text_fanned.jsonl',out.join('\\n')+'\\n');console.log('site_text_fanned.jsonl:',out.length,'records,',fanned,'fanned to siblings')"
    node $E/prep-classify.js --leads $R/leads_annotated.csv --site $R/owner/site_text_fanned.jsonl --out $R/classify/in --batch 60
  else echo "[classify-prep] skip"; fi
fi
echo "pipeline step(s) '$step' done"
