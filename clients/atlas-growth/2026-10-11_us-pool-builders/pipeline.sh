#!/usr/bin/env bash
# Post-scrape chain, SKILL STEP 5 -> 6 step 1, every step through the engine. Idempotent: a step whose
# output exists is skipped (delete the output to redo). Run from anywhere: bash <run>/pipeline.sh [step]
# Steps: merge | qualify | geo | dedupe | collapse | fetch | classify-prep   (no arg = all, in order)
set -euo pipefail
cd "$(dirname "$0")/../../.."          # repo root
E=skills/google-maps-scrape
C=clients/atlas-growth
R=$C/2026-10-11_us-pool-builders
CFG=$C/atlas-growth-pools-config.json
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
    node $E/qualify-leads.js --in $R/maps/excluded_officp.csv --config $C/recover-generic-pools-config.json --out $R/maps/recover
    node $R/union-qualified.js --run $R
  else echo "[qualify] skip"; fi
fi
if want geo; then
  if [ ! -s $R/leads_clean_qualified_infootprint.csv ]; then
    # whole US is the footprint: keep every domestic pin, drop only foreign-country addresses
    node $E/footprint-gate.js --in $R/leads_qualified.csv --runsheet $C/atlas-growth-pools-runsheet.csv --config $CFG --out $R --keep-domestic
    node $E/footprint-gate.js --in $R/keyword_candidates.csv --runsheet $C/atlas-growth-pools-runsheet.csv --config $CFG --out $R/kw --keep-domestic
    # Maps-stage excluded for the deliverable = qualify drops + geo drops
    node -e "
const fs=require('fs');const a=fs.readFileSync('$R/excluded_maps.csv','utf8').trimEnd().split('\n');const g=fs.existsSync('$R/excluded_geo.csv')?fs.readFileSync('$R/excluded_geo.csv','utf8').trimEnd().split('\n'):[];
if(g.length>1){const ha=a[0].split(','),hg=g[0].split(',');const di=hg.indexOf('drop_reason');const out=[a[0],...a.slice(1)];for(const l of g.slice(1)){out.push(l)}fs.writeFileSync('$R/excluded_maps.csv',out.join('\n')+'\n');console.log('excluded_maps += geo drops',g.length-1)}"
  else echo "[geo] skip"; fi
fi
if want dedupe; then
  if [ ! -s $R/leads_netnew.csv ]; then
    # Cross-run dedupe WAIVED by the operator 2026-10-11 (prior shipped feeds not on this container); run for the record.
    node $E/build-netnew.js --new $R/leads_clean_qualified_infootprint.csv --client $C --out $R/leads_netnew.csv || true
    [ -s $R/leads_netnew.csv ] || cp $R/leads_clean_qualified_infootprint.csv $R/leads_netnew.csv
  else echo "[dedupe] skip"; fi
fi
if want collapse; then
  if [ ! -s $R/leads_domains.csv ]; then
    # keyword candidates ride the same collapse so their sites are fetched for classify
    node -e "
const fs=require('fs');const a=fs.readFileSync('$R/leads_netnew.csv','utf8').trimEnd().split('\n');const k=fs.existsSync('$R/kw/keyword_adjacent.csv')?fs.readFileSync('$R/kw/keyword_adjacent.csv','utf8').trimEnd().split('\n'):[];
const H=a[0].split(',');const hk=k.length?k[0].split(','):[];const idx=hk.map(h=>H.indexOf(h));
// keyword rows carry drop_reason as an extra trailing column; re-project onto the netnew header by position (same leads_clean columns first)
const rows=[...a];for(const l of k.slice(1)){rows.push(l.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).slice(0,H.length).join(','))}
fs.writeFileSync('$R/leads_for_collapse.csv',rows.join('\n')+'\n');console.log('collapse input rows',rows.length-1,'(keyword candidates',Math.max(0,k.length-1)+')')"
    node $E/collapse-domains.js --in $R/leads_for_collapse.csv --out $R --config $CFG
  else echo "[collapse] skip"; fi
fi
if want fetch; then
  # The fetch was run as 4 parallel shards (owner/domains-N.csv -> owner/fetch-N/site_text.jsonl) to fit the
  # 22,823-domain list into ~1 h; concatenate them into the canonical owner/site_text.jsonl when present.
  if [ ! -s $R/owner/site_text.jsonl ] && ls $R/owner/fetch-*/site_text.jsonl >/dev/null 2>&1; then
    cat $R/owner/fetch-*/site_text.jsonl > $R/owner/site_text.jsonl && echo "[fetch] concatenated $(wc -l < $R/owner/site_text.jsonl) shard records into owner/site_text.jsonl"
  fi
  if [ ! -s $R/owner/site_text.jsonl ]; then
    [ -f $R/owner-prompt.md ] || { echo "owner-prompt.md missing (STEP 6a gate)"; exit 1; }
    node $E/fetch-sites.js --in $R/leads_domains.csv --out $R/owner --concurrency 12 --config $CFG
  else echo "[fetch] skip"; fi
fi
if want classify-prep; then
  if [ ! -d $R/classify/in ]; then
    # prep-classify keys site text by place_id only; fan each representative's record to its domain siblings
    # (domain_siblings.json from collapse-domains) so a branch is classified on its brand site, not as 'unclear'.
    node -e "
const fs=require('fs');const sj=JSON.parse(fs.readFileSync('$R/domain_siblings.json','utf8'));const sib={};if(sj.reps){for(const [rep,v] of Object.entries(sj.reps))for(const s of (v.siblings||[]))sib[s]=rep}else Object.assign(sib,sj);const recs=fs.readFileSync('$R/owner/site_text.jsonl','utf8').split(/\\r?\\n/).filter(Boolean).map(l=>JSON.parse(l));
const byId=new Map(recs.map(r=>[r.place_id,r]));let fanned=0;const out=recs.map(r=>JSON.stringify(r));
for(const [s,rep] of Object.entries(sib)){const r=byId.get(rep);if(r&&!byId.has(s)){out.push(JSON.stringify({...r,place_id:s,fanned_from:rep}));fanned++}}
fs.writeFileSync('$R/owner/site_text_fanned.jsonl',out.join('\\n')+'\\n');console.log('site_text_fanned.jsonl:',out.length,'records,',fanned,'fanned to siblings')"
    node $E/prep-classify.js --leads $R/leads_annotated.csv --site $R/owner/site_text_fanned.jsonl --out $R/classify/in --batch 60
  else echo "[classify-prep] skip"; fi
fi
echo "pipeline step(s) '$step' done"
