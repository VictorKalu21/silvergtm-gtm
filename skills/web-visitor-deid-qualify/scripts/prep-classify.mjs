// STEP 5 prep: take the free-gate survivors and split their PRUNED HOMEPAGE TEXT into
// batches for parallel Haiku B2B classification. Homepage text (not the Apollo description)
// is the classify input -- richer + current. Vertical keep/drop logic lives ENTIRELY in the
// prompt you co-author at run time (see SKILL.md), NOT in this script.
//
//   RUN=<run> DIR=<dir> node prep-classify.mjs   # writes {RUN}_review_batch_{b}.json
//
// Each batch row = {name, url, employees, industry, text}. Keep batches ~80 (big batches
// truncate on some Haiku agents -> the merge matches BY NAME to survive that).
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const BATCH = Number(process.env.BATCH || 80);
const rows = JSON.parse(readFileSync(`${DIR}/${RUN}_signal.json`, 'utf8').replace(/^﻿/, ''));

const survivors = rows.filter((r) => r.status === 'pass_free_gates')
  .map((r) => ({ name: r.name, url: r.url, employees: r.employees, industry: r.industry, text: (r.text || '').slice(0, 2000) }));

let b = 0;
for (let i = 0; i < survivors.length; i += BATCH, b++) {
  writeFileSync(`${DIR}/${RUN}_review_batch_${b}.json`, JSON.stringify(survivors.slice(i, i + BATCH), null, 2));
}
console.error(`wrote ${b} batch file(s) for ${survivors.length} survivors (BATCH=${BATCH}).`);
console.error(`Next: dispatch one Haiku subagent per {RUN}_review_batch_{0..${b - 1}}.json with the co-authored`);
console.error(`keep/drop prompt (SKILL.md step 5). Each agent writes {RUN}_review_batch_{n}_out.json = [{name,isKeep,tag}].`);
