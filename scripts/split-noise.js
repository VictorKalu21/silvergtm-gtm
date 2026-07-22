// Step 6: merge enriched domains onto the gated list, apply the aggregator/ICP denylist,
// split into *_clean.csv (ok) and *_review.csv (held, with reason).
//
// Usage: node split-noise.js <gate.csv> <domains.json> <cleanOut.csv> <reviewOut.csv>
//   domains.json = { "<company name>": ["domain","conf","flag"], ... }
//   flag: ok | verify | aggregator | nonicp | dup
//
// Name-pattern denylist auto-flags board artifacts even if the domain lookup missed them.
const fs = require('fs');
const { parse, write, norm } = require('./csv');

const [, , gateCsv, domainsJson, cleanOut = 'clean.csv', reviewOut = 'review.csv'] = process.argv;

const AGG_NAME = /\b(jobs via|via (dice|linkedin|workable|greenhouse|lever)|jobster|hiring|careers|staffing|recruiting)\b/i;
const AGG_DOMAIN = /(^|\.)(dice|linkedin|indeed|ziprecruiter|glassdoor)\.com$/i;

const D = JSON.parse(fs.readFileSync(domainsJson, 'utf8'));
const dmap = {}; for (const k in D) dmap[norm(k)] = D[k];

const rows = parse(fs.readFileSync(gateCsv, 'utf8'));
const h = rows[0].concat('domain', 'domain_conf', 'flag');
const seenDomain = new Set();
const clean = [h], review = [h];

for (const row of rows.slice(1)) {
  let [dom, conf, flag] = dmap[norm(row[0])] || ['', 'low', 'verify'];
  if (AGG_NAME.test(row[0]) || AGG_DOMAIN.test(dom)) flag = 'aggregator';
  if (flag === 'ok' && dom) { if (seenDomain.has(dom)) flag = 'dup'; else seenDomain.add(dom); }
  const outRow = row.concat(dom, conf, flag);
  (flag === 'ok' ? clean : review).push(outRow);
}

fs.writeFileSync(cleanOut, write(clean));
fs.writeFileSync(reviewOut, write(review));
const held = {}; review.slice(1).forEach(r => { const f = r[r.length - 1]; (held[f] = held[f] || []).push(r[0]); });
console.log(`clean: ${clean.length - 1} | review: ${review.length - 1}`);
for (const f in held) console.log(`  [${f}] ${held[f].join(', ')}`);
