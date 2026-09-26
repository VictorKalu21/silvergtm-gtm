// STEP 8b guard: Haiku reviewers drop leads for reasons the brief does NOT exclude ("already has Amazon 3P/dormant listings",
// "catalog too small"). Honor a review drop only when its reason matches the allowed list; otherwise keep and annotate.
//   RUN=<run> DIR=<dir> node review-guard.mjs        # rewrites every {RUN}_lead_review_N_out.json in place
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.env.DIR || '.', RUN = process.env.RUN || 'run';
const OK = /resell|retailer|multi-brand|marketplace|dropship|print.on.demand|\bpod\b|digital|service|software|alcohol|beer|wine|spirits|brewery|tobacco|vape|cbd|cannabis|adult|weapon|firearm|non-?us|foreign|canada|\buk\b|australia|europe|fan merch|merch|licens|band|celebrity|artist|influencer|musician|team|athlete|nonprofit|non-profit|charity|publication|magazine|conglomerate|entertainment|restaurant|bakery|cafe|venue|dupes|trademark|\bip\b|b2b|industrial|wholesale-only|not a (real |recognizable )?brand|no physical/i;
for (let b = 0; existsSync(`${DIR}/${RUN}_lead_review_${b}_out.json`); b++) {
  const f = `${DIR}/${RUN}_lead_review_${b}_out.json`; const a = JSON.parse(readFileSync(f, 'utf8')); let o = 0;
  for (const x of a) if (x.isKeep === false && !OK.test(x.reason || '')) { x.isKeep = true; x.note = (x.note || '') + ' [review drop overridden: ' + (x.reason || '') + ']'; x.reason = ''; o++; }
  writeFileSync(f, JSON.stringify(a, null, 1)); console.error(`${f}: kept ${a.filter((x) => x.isKeep).length}, dropped ${a.filter((x) => !x.isKeep).length}, overridden ${o}`);
}
