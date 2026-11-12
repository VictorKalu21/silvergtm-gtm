#!/usr/bin/env node
/* fan-classify.js — streaming version of the pool run's inline fan-out: every domain sibling gets its representative's site record
 * (place_id swapped, fanned_from set) so a branch is classified on its brand site, not as 'unclear'. Streams line by line: the
 * 300 MB site_text.jsonl cannot be JSON.parse'd / joined whole (engine OOM, IMPROVEMENTS 2026-11-12). Out: owner/site_text_fanned.jsonl
 *   node fan-classify.js     (run from this folder)
 */
const fs = require('fs'), readline = require('readline');
const sib = JSON.parse(fs.readFileSync('domain_siblings.json', 'utf8')).sibling_of || {};
const ann = new Set(); for (const l of fs.readFileSync('leads_annotated_work.csv', 'utf8').split('\n')) { const m = l.match(/^"?(ChIJ[^",]+)/); if (m) ann.add(m[1]); }
const byRep = new Map(); for (const [s, r] of Object.entries(sib)) { if (!ann.has(s)) continue; (byRep.get(r) || byRep.set(r, []).get(r)).push(s); }
(async () => {
  const out = fs.createWriteStream('owner/site_text_fanned.jsonl'); let n = 0, f = 0;
  for await (const l of readline.createInterface({ input: fs.createReadStream('owner/site_text.jsonl'), crlfDelay: Infinity })) {
    if (!l) continue; out.write(l + '\n'); n++;
    const id = (l.match(/"place_id":"([^"]+)"/) || [])[1];
    for (const s of byRep.get(id) || []) { out.write(l.replace(`"place_id":"${id}"`, `"place_id":"${s}","fanned_from":"${id}"`) + '\n'); f++; }
  }
  await new Promise(r => out.end(r)); console.log(JSON.stringify({ records: n, fanned: f }));
})();
