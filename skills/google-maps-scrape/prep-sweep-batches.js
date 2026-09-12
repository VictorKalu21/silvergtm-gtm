#!/usr/bin/env node
/* prep-sweep-batches.js — queue the leads that still have NO named decision-maker for a web-search
 * sweep by a cheap model (SKILL STEP 6 flow 2c; owner-finding.md "WHERE the names live").
 *
 *   node prep-sweep-batches.js --leads <leads_icp.csv> --out <out>/owner/sweep2 [--have <contacts.jsonl>]...
 *        [--batch 20] [--limit N] [--registry bbb.org]
 *
 * --have may repeat: any lead with >=1 contact in any of those files is excluded.
 * Writes <out>/batches/batch-<N>-in.json ([{place_id, business_name, city, state, zip, website,
 * brand_family, query, registry}]), <out>/manifest.json. The model does the searching and the
 * reading; nothing here names a person.
 */
const fs = require('fs'), path = require('path');
const argv = process.argv;
function arg(n, d) { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; }
function args(n) { const o = []; argv.forEach((a, i) => { if (a === '--' + n && argv[i + 1]) o.push(argv[i + 1]); }); return o; }
const LEADS = arg('leads'), OUT = arg('out'), BATCH = parseInt(arg('batch', '20'), 10), LIMIT = parseInt(arg('limit', '0'), 10), REG = arg('registry', 'bbb.org');
if (!LEADS || !OUT) { console.error('usage: --leads <csv> --out <dir> [--have <jsonl>]...'); process.exit(1); }
const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
function csv(f) { const L = strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift()); return L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); }); }
const have = new Set();
for (const f of args('have')) { if (!fs.existsSync(f)) continue; for (const l of strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.place_id && Array.isArray(d.contacts) && d.contacts.length) have.add(d.place_id); } catch (e) { } } }
const leads = csv(LEADS);
let items = leads.filter(r => !have.has(r.place_id)).map(r => {
  const st = r.state || (r.city.match(/,\s*([A-Z]{2})\b/) || [])[1] || '';
  const town = (r.city || '').split(',')[0].trim();
  return { place_id: r.place_id, business_name: r.name, city: r.city, state: st, zip: r.zip, website: r.website, brand_family: r.brand_family || '',
    query: `"${r.name}" ${town} ${st} owner`, registry: REG };
});
if (LIMIT > 0) items = items.slice(0, LIMIT);
fs.mkdirSync(path.join(OUT, 'batches'), { recursive: true });
let n = 0; for (let i = 0; i < items.length; i += BATCH) { fs.writeFileSync(path.join(OUT, 'batches', `batch-${n}-in.json`), JSON.stringify(items.slice(i, i + BATCH), null, 1)); n++; }
const manifest = { leads: leads.length, already_named: have.size, queued: items.length, batches: n, batch_size: BATCH, registry: REG };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
