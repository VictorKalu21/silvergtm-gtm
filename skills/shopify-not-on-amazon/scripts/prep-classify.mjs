// STEP 8 prep: batch the free-gate survivors for the Haiku brand/category judge. Input per row is what the
// site itself says (pruned homepage text + catalog product types/vendors + the free-gate flags), never a
// third-party description. Keep/drop + category logic lives ENTIRELY in the prompt (SKILL.md), not here.
//
//   RUN=<run> DIR=<dir> node prep-classify.mjs   # {RUN}_signal.json -> {RUN}_review_batch_{b}.json
//   env: BATCH (60)  MIN_RANK_ONLY=1 (only rows with a rank)
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', BATCH = Number(process.env.BATCH || 60);
const rows = JSON.parse(readFileSync(`${DIR}/${RUN}_signal.json`, 'utf8').replace(/^﻿/, ''));
const survivors = rows.filter((r) => r.status === 'pass_free_gates').sort((a, b) => (a.rank || 9e9) - (b.rank || 9e9))
  .map((r) => ({ domain: r.domain, brand: r.shopName || r.title || r.domain, rank: r.rank, state: r.province, productCount: r.productCount, medianPrice: r.medianPrice,
    types: (r.types || []).slice(0, 6), vendors: (r.vendors || []).slice(0, 4), flags: [...(r.dropshipWhy || []), r.podMerchLine ? 'pod_merch_line' : '', r.headless ? 'headless' : '', r.retailerScore >= 2 ? `likely_retailer(vendor_diversity=${r.vendorDistinctShare},top_vendor=${r.topVendorShare})` : '', ...(r.foreignParentHints || []).map((h) => 'foreign_hint:' + h)].filter(Boolean),
    text: (r.text || '').slice(0, 1500) }));
let b = 0;
for (let i = 0; i < survivors.length; i += BATCH, b++) writeFileSync(`${DIR}/${RUN}_review_batch_${b}.json`, JSON.stringify(survivors.slice(i, i + BATCH), null, 1));
console.error(`wrote ${b} batch file(s) for ${survivors.length} survivors (BATCH=${BATCH}).`);
console.error(`Next: one Haiku subagent per {RUN}_review_batch_{n}.json -> {RUN}_review_batch_{n}_out.json = [{domain,isKeep,category,reason}] (prompt in SKILL.md), then merge.mjs classify`);
