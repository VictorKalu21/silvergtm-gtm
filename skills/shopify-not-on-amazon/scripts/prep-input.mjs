// STEP 0 prep: HTTP Archive CSV export (domain,page,rank,stack) -> {RUN}_input.json, deduped by
// registrable domain (keep the best rank). Also accepts any CSV with a `domain`/`website`/`url` column
// (Store Leads export, Apollo accounts, a hand list) so the same pipeline runs on any source.
//
//   RUN=<run> DIR=<dir> node prep-input.mjs httparchive_export.csv [more.csv ...]
//   MIN_TRAFFIC=20000 node prep-input.mjs --filter        # second pass: keep only domains whose {RUN}_dfs_traffic.json organic+paid ETV
//                                                          # meets the bar (run `dataforseo.mjs traffic` with SOURCE=input first); writes {RUN}_input.json
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const files = process.argv.slice(2);
if (files[0] === '--filter') {
  const MIN = Number(process.env.MIN_TRAFFIC || 20000);
  const input = JSON.parse(readFileSync(`${DIR}/${RUN}_input.json`, 'utf8')); const tr = JSON.parse(readFileSync(`${DIR}/${RUN}_dfs_traffic.json`, 'utf8'));
  const kept = input.map((r) => { const t = tr[r.domain] || {}; const etv = (t.organic_etv || 0) + (t.paid_etv || 0); return { ...r, etv, traffic_band: etv >= 50000 ? '50k+' : etv >= 20000 ? '20k+' : etv >= 10000 ? '10k+' : '<10k' }; }).filter((r) => r.etv >= MIN);
  writeFileSync(`${DIR}/${RUN}_input_all.json`, JSON.stringify(input, null, 2)); writeFileSync(`${DIR}/${RUN}_input.json`, JSON.stringify(kept, null, 2));
  console.error(`${RUN}: ${kept.length}/${input.length} domains with DataForSEO ETV >= ${MIN} (50k+: ${kept.filter((r) => r.traffic_band === '50k+').length}); original saved as ${RUN}_input_all.json`);
  process.exit(0);
}
if (!files.length) { console.error('usage: RUN=x DIR=y node prep-input.mjs <export.csv> [...]'); process.exit(1); }

function parse(text) { // RFC-4180
  const rows = []; let f = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { f.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; if (cur !== '' || f.length) { f.push(cur); rows.push(f); f = []; cur = ''; } }
    else cur += c;
  }
  if (cur !== '' || f.length) { f.push(cur); rows.push(f); }
  return rows;
}
const regDomain = (u) => {
  if (!u) return null; let s = String(u).trim().toLowerCase(); if (!/^https?:\/\//.test(s)) s = 'https://' + s;
  try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return null; }
};

const best = new Map();
for (const file of files) {
  const rows = parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (names) => head.findIndex((h) => names.includes(h));
  const iDom = col(['domain', 'website', 'url', 'page', 'company website']);
  const iRank = col(['rank']); const iStack = col(['stack']); const iName = col(['name', 'company', 'company name', 'merchant name']);
  if (iDom < 0) { console.error(`${file}: no domain/website/url column`); continue; }
  for (const r of rows) {
    const d = regDomain(r[iDom]); if (!d) continue;
    const rank = iRank >= 0 && r[iRank] ? Number(r[iRank]) : null;
    const rec = { domain: d, rank, stack: iStack >= 0 ? (r[iStack] || '') : '', srcName: iName >= 0 ? (r[iName] || '') : '' };
    const prev = best.get(d);
    if (!prev || (rank && (!prev.rank || rank < prev.rank))) best.set(d, rec);
  }
}
const input = [...best.values()].sort((a, b) => (a.rank || 9e9) - (b.rank || 9e9) || a.domain.localeCompare(b.domain));
writeFileSync(`${DIR}/${RUN}_input.json`, JSON.stringify(input, null, 2));
const buckets = {}; for (const r of input) buckets[r.rank || 'none'] = (buckets[r.rank || 'none'] || 0) + 1;
console.error(`${RUN}: ${input.length} unique domains -> ${RUN}_input.json`);
console.error('rank buckets:', JSON.stringify(buckets));
