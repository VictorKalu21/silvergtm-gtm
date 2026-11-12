#!/usr/bin/env node
/* apply-verdicts.js — job-side bookkeeping around the engine's apply-classify.js (which is run first):
 *  - read set (batches 000-263) vs deferred_unread (264-415, never read) kept apart
 *  - 'other' -> unclear
 *  - sibling fan-out: a domain's verdict = its REPRESENTATIVE's verdict; siblings inherit it (own verdict kept in own_verdict + verdict_disagrees)
 *  - evidence verbatim check (case/whitespace-insensitive) against the exact text the reader was given -> needs_review
 * Run from this folder after:  node ../../../skills/google-maps-scrape/apply-classify.js --leads leads_read.csv --llm-out classify/out --out leads_classified_raw.csv --fallback unclear
 */
const fs = require('fs'), path = require('path');
const { csv } = require('../../../skills/google-maps-scrape/build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const wr = (f, H, rs) => fs.writeFileSync(f, [H.join(',')].concat(rs.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const text = new Map(), readIds = new Set();
for (let n = 0; n <= 263; n++) for (const l of fs.readFileSync(`classify/in/batch_${String(n).padStart(3, '0')}.jsonl`, 'utf8').split('\n').filter(Boolean)) { const d = JSON.parse(l); text.set(d.place_id, d.text); readIds.add(d.place_id); }
const ver = new Map(); for (let n = 0; n <= 263; n++) for (const o of JSON.parse(fs.readFileSync(`classify/out/batch_${String(n).padStart(3, '0')}.json`, 'utf8').replace(/^﻿/, ''))) ver.set(o.place_id, o);
const all = csv('leads_classify.csv');
if (process.argv[2] === 'split') { const H = Object.keys(all[0]); wr('leads_read.csv', H, all.filter(r => readIds.has(r.place_id))); wr('leads_deferred_unread.csv', [...H, 'status'], all.filter(r => !readIds.has(r.place_id)).map(r => ({ ...r, status: 'deferred_unread' }))); console.log('read', all.filter(r => readIds.has(r.place_id)).length, 'deferred', all.filter(r => !readIds.has(r.place_id)).length); process.exit(0); }
const rows = csv('leads_classified_raw.csv'); const sib = JSON.parse(fs.readFileSync('domain_siblings.json', 'utf8')).sibling_of || {};
const byId = new Map(rows.map(r => [r.place_id, r]));
const BT = t => (['residential_flatwork', 'commercial_only', 'supplier_or_readymix', 'pumping_cutting', 'foundation_or_lifting_only', 'franchise', 'unclear'].includes(t) ? t : 'unclear');
let disagree = 0, inherited = 0, otherFixed = 0, noverb = 0;
for (const r of rows) {
  const v = ver.get(r.place_id) || {}; const own = BT(v.business_type); if (v.business_type && !['residential_flatwork', 'commercial_only', 'supplier_or_readymix', 'pumping_cutting', 'foundation_or_lifting_only', 'franchise', 'unclear'].includes(v.business_type)) otherFixed++;
  r.own_verdict = own; r.confidence = v.confidence || ''; r.why = v.why || ''; r.evidence = v.evidence || ''; r.services = v.services || ''; r.also_commercial = v.also_commercial === true || v.also_commercial === 'true' ? 'true' : 'false';
  r.had_text = norm(text.get(r.place_id)).length > 0 ? 'yes' : 'no';
  const rep = sib[r.place_id]; r.rep_place_id_used = rep || '';
}
for (const r of rows) { const rep = sib[r.place_id]; const rr = rep && byId.get(rep); if (rr) { r.business_type_final = rr.own_verdict; inherited++; if (rr.own_verdict !== r.own_verdict) { disagree++; r.verdict_disagrees = 'yes'; } } else r.business_type_final = r.own_verdict; }
for (const r of rows) {
  r.evidence_ok = ''; if (r.business_type_final === 'residential_flatwork') { const src = rows.find ? null : null; }
}
// evidence check on the verdict-owning row (the representative's own text and evidence)
for (const r of rows) {
  if (r.business_type_final !== 'residential_flatwork') continue;
  const owner = sib[r.place_id] && byId.get(sib[r.place_id]) ? byId.get(sib[r.place_id]) : r;
  const ev = norm(owner.evidence), tx = norm(text.get(owner.place_id));
  r.evidence_for_verdict = owner.evidence; r.needs_review = ev && tx.includes(ev) ? '' : (ev ? 'evidence_not_verbatim_in_text' : 'no_evidence');
}
const H = [...Object.keys(rows[0]).filter(h => !['business_type', 'business_type_confidence'].includes(h))];
for (const h of ['business_type_final', 'own_verdict', 'verdict_disagrees', 'evidence_for_verdict', 'needs_review']) if (!H.includes(h)) H.push(h);
wr('leads_classified.csv', H, rows);
console.log(JSON.stringify({ rows: rows.length, other_to_unclear: otherFixed, siblings_inheriting_rep_verdict: inherited, sibling_verdict_disagrees: disagree }));
