// STEP 7c · Search-term sanity pass (Haiku). The verifier's term comes from meta.json name / <title>; on ~5-8% of rows it is a
// category word or tagline ("curly" for patternbeauty.com, "tropical fish" for predatoryfins.com, "gladiator" for
// gladiatorgarageworks.com) and the verdict is then about the wrong thing. This writes the LEAD rows (none / 3p / dormant, i.e.
// the rows that would ship) for a Haiku pass that returns the brand name as Amazon would name the store; the merge step writes
// {RUN}_query_overrides.json entries for every changed term, and `ONLY=... REPASS=1` re-checks just those.
//
//   RUN=<run> DIR=<dir> node prep-query-review.mjs            # -> {RUN}_query_review_N.json (BATCH=110)
//   RUN=<run> DIR=<dir> node prep-query-review.mjs --merge    # reads {RUN}_query_review_N_out.json -> {RUN}_query_overrides.json + prints ONLY= list
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run', BATCH = Number(process.env.BATCH || 110);
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const keeps = rd(`${RUN}_keeps.json`), v = rd(`${RUN}_amazon_verify.json`);
const ovr = existsSync(`${DIR}/${RUN}_query_overrides.json`) ? rd(`${RUN}_query_overrides.json`) : {};
if (process.argv[2] === '--merge') {
  let n = 0, changed = [];
  for (let i = 0; existsSync(`${DIR}/${RUN}_query_review_${i}_out.json`); i++) for (const r of rd(`${RUN}_query_review_${i}_out.json`)) {
    n++; const cur = (v[r.domain]?.query || '').toLowerCase().trim(), term = (r.term || '').toLowerCase().trim();
    if (term && term !== cur && !ovr[r.domain]) { ovr[r.domain] = term; changed.push(r.domain); }
  }
  writeFileSync(`${DIR}/${RUN}_query_overrides.json`, JSON.stringify(ovr, null, 1)); writeFileSync(`${DIR}/only_query.txt`, changed.join(','));
  console.error(`${RUN}: ${n} reviewed, ${changed.length} terms changed -> ${RUN}_query_overrides.json; re-check: ONLY=$(cat only_query.txt) REPASS=1 MAX_DP=8`);
  process.exit(0);
}
const LEAD = new Set(['none', 'listings_3p', 'listings_dormant', 'listings_unverified']);
const rows = keeps.filter((k) => LEAD.has(v[k.domain]?.amazon_status)).map((k) => ({ domain: k.domain, shopName: k.shopName || '', title: (k.title || '').slice(0, 120), topVendors: (k.vendors || []).slice(0, 3), currentTerm: v[k.domain]?.query || '' }));
let b = 0; for (let i = 0; i < rows.length; i += BATCH, b++) writeFileSync(`${DIR}/${RUN}_query_review_${b}.json`, JSON.stringify(rows.slice(i, i + BATCH), null, 1));
console.error(`${RUN}: ${rows.length} lead rows -> ${b} query-review batch(es). Haiku prompt: for each row return {"domain","term","changed","reason"} where term = the brand name exactly as Amazon would name its store (brand words only, no category words, no taglines; use the domain when the title is a tagline).`);
