// STEP 8b prep: batch the LEAD candidates (keeps whose Amazon status is none / listings_3p / listings_dormant) that have not
// been reviewed yet -> {RUN}_lead_review_N.json for the second Haiku pass (prompt in SKILL.md). Incremental: safe to re-run
// after more brands are verified; existing {RUN}_lead_review_N_out.json files are respected and new batches get new indexes.
//
//   RUN=<run> DIR=<dir> node prep-lead-review.mjs     # env: BATCH (55)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', BATCH = Number(process.env.BATCH || 55);
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const k = rd(`${RUN}_keeps.json`), v = rd(`${RUN}_amazon_verify.json`), ac = existsSync(`${DIR}/${RUN}_amazon_ac.json`) ? rd(`${RUN}_amazon_ac.json`) : {}, ct = existsSync(`${DIR}/${RUN}_contacts.json`) ? rd(`${RUN}_contacts.json`) : {};
const have = new Set(); let b = 0;
for (; existsSync(`${DIR}/${RUN}_lead_review_${b}_out.json`); b++) for (const x of rd(`${RUN}_lead_review_${b}_out.json`)) if (x && x.domain) have.add(x.domain.toLowerCase());
for (let c = b; existsSync(`${DIR}/${RUN}_lead_review_${c}.json`); c++) b = c + 1;   // never overwrite a pending (not yet answered) batch
const L = k.filter((x) => v[x.domain] && ['none', 'listings_3p', 'listings_dormant'].includes(v[x.domain].amazon_status) && !have.has(x.domain.toLowerCase())).sort((a, z) => (a.rank || 9e9) - (z.rank || 9e9))
  .map((x) => ({ domain: x.domain, brand: x.shopName || x.title, rank: x.rank, state: x.province, city: x.city, productCount: x.productCount, medianPrice: x.medianPrice, types: (x.types || []).slice(0, 6), vendors: (x.vendors || []).slice(0, 4), classifyCategory: x.category, amazon: v[x.domain].amazon_status, amazonDemand: ac[x.domain]?.demand, contacts: (ct[x.domain]?.emails || []).slice(0, 2), text: (x.text || '').slice(0, 900) }));
const start = b;
for (let i = 0; i < L.length; i += BATCH, b++) writeFileSync(`${DIR}/${RUN}_lead_review_${b}.json`, JSON.stringify(L.slice(i, i + BATCH)));
console.error(`${RUN}: ${L.length} unreviewed lead candidates -> batches ${start}..${b - 1} (already reviewed: ${have.size})`);
console.error(`Next: one Haiku subagent per batch (SKILL.md step 8b prompt) -> {RUN}_lead_review_N_out.json; then apply the drop-reason guard and merge.mjs final`);
