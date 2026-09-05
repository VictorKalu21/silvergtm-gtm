// STEP 5 merge (run TWICE): first to produce the B2B keeps that feed step 6, then again
// after ad-lib to produce the final qualified list.
//
//   RUN=<run> DIR=<dir> node merge.mjs classify   # merge Haiku verdicts -> {RUN}_keeps.json (+ _dropped_b2b.csv)
//   RUN=<run> DIR=<dir> node merge.mjs final       # join keeps x ad-lib -> {RUN}_QUALIFIED.csv (+ _dropped_adlib.csv)
//
// Verdicts are matched BY NAME, never by array index: big Haiku batches sometimes truncate,
// and an index merge then silently misaligns/drops rows. Unmatched names are reported for a re-run.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const MODE = process.argv[2] || 'classify';
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = rd(`${RUN}_signal.json`);
const byName = new Map(rows.map((r) => [(r.name || '').trim(), r]));

if (MODE === 'classify') {
  const vmap = new Map(); let total = 0;
  for (let b = 0; existsSync(`${DIR}/${RUN}_review_batch_${b}_out.json`); b++) {
    for (const v of rd(`${RUN}_review_batch_${b}_out.json`)) if (v && v.name) { vmap.set(v.name.trim(), v); total++; }
  }
  const survivors = rows.filter((r) => r.status === 'pass_free_gates');
  const keeps = [], dropped = [], unmatched = [];
  for (const r of survivors) {
    const v = vmap.get((r.name || '').trim());
    if (!v) { unmatched.push(r); continue; }
    if (v.isKeep) keeps.push({ name: r.name, url: r.url, employees: r.employees, state: r.state, industry: r.industry, tag: v.tag || '', primaryPixels: r.primaryPixels, liVanity: r.liVanity || null });
    else dropped.push({ ...r, dropReason: v.tag || 'non_b2b_fit' });
  }
  writeFileSync(`${DIR}/${RUN}_keeps.json`, JSON.stringify(keeps, null, 2));
  writeFileSync(`${DIR}/${RUN}_dropped_b2b.csv`,
    ['name,url,employees,state,dropReason'].concat(dropped.map((r) => [esc(r.name), esc(r.url), esc(r.employees), esc(r.state), esc(r.dropReason)].join(','))).join('\n'));
  if (unmatched.length) writeFileSync(`${DIR}/${RUN}_unmatched.json`, JSON.stringify(unmatched, null, 2));
  console.error(`===== ${RUN} CLASSIFY MERGE (by name) =====`);
  console.error(`survivors: ${survivors.length}  verdicts: ${total}`);
  console.error(`  KEEP (B2B): ${keeps.length}  -> ${RUN}_keeps.json (feeds step 6)`);
  console.error(`  dropped: ${dropped.length}   UNMATCHED (need re-run): ${unmatched.length}`);
} else if (MODE === 'final') {
  const keeps = rd(`${RUN}_keeps.json`);
  const adlibArr = Object.values(rd(`${RUN}_adlib.json`));
  const adlib = new Map(adlibArr.map((v) => [(v.name || '').trim(), v]));
  const qualified = [], dropped = [];
  for (const k of keeps) {
    const a = adlib.get((k.name || '').trim());
    if (a && a.adlib_active) qualified.push({ ...k, page_id: a.page_id, active_ads: a.active_count_text });
    else dropped.push({ ...k, dropReason: a ? (a.reason || 'no_active_ads') : 'adlib_not_checked' });
  }
  const qCols = ['name', 'url', 'employees', 'state', 'industry', 'tag', 'primaryPixels', 'page_id', 'active_ads'];
  writeFileSync(`${DIR}/${RUN}_QUALIFIED.csv`,
    [qCols.join(',')].concat(qualified.map((r) => qCols.map((c) => esc(Array.isArray(r[c]) ? r[c].join('|') : r[c])).join(','))).join('\n'));
  writeFileSync(`${DIR}/${RUN}_dropped_adlib.csv`,
    ['name,url,dropReason'].concat(dropped.map((r) => [esc(r.name), esc(r.url), esc(r.dropReason)].join(','))).join('\n'));
  console.error(`===== ${RUN} FINAL MERGE =====`);
  console.error(`B2B keeps: ${keeps.length}`);
  console.error(`  QUALIFIED (ad-lib confirmed): ${qualified.length}  -> ${RUN}_QUALIFIED.csv`);
  console.error(`  dropped (no active ads / unresolved): ${dropped.length}`);
} else {
  console.error('usage: node merge.mjs [classify|final]');
  process.exit(1);
}
