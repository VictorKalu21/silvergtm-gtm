#!/usr/bin/env node
/* combine-owner-contacts.js — union the per-source model-read files (flow 2b read, flow 2c sweeps) into one
 * contacts file for the run, plus a summary against the lead spine.
 *   node combine-owner-contacts.js --leads <leads_icp.csv> --out <out>/owner/contacts_final.jsonl <contacts_a.jsonl> <contacts_b.jsonl> ...
 * Precedence = argument order: the first file that names a lead wins; later files only fill leads still unnamed.
 * Writes contacts_final.jsonl, contacts_final.csv, contacts_final_summary.json.
 */
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
function arg(n, d) { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; }
const LEADS = arg('leads'), OUT = arg('out');
const FILES = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--leads' && argv[i - 1] !== '--out');
if (!LEADS || !OUT || !FILES.length) { console.error('usage: --leads <csv> --out <jsonl> <contacts.jsonl>...'); process.exit(1); }
const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
const L = strip(fs.readFileSync(LEADS, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift());
const leads = L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); });
const best = new Map(), seen = new Map();
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.error('WARN missing ' + f); continue; }
  for (const l of strip(fs.readFileSync(f, 'utf8')).split(/\r?\n/)) {
    if (!l.trim()) continue; let d; try { d = JSON.parse(l); } catch (e) { continue; }
    if (!d.place_id) continue;
    if (!seen.has(d.place_id)) seen.set(d.place_id, path.basename(f));
    if (d.primary_name && !best.has(d.place_id)) best.set(d.place_id, { ...d, contacts_file: path.basename(f) });
  }
}
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const rows = [], sum = { leads: leads.length, read_or_swept: 0, named: 0, owner_level_primary: 0, by_primary_role: {}, by_file: {}, by_confidence: {}, contacts_total: 0 };
for (const r of leads) {
  const d = best.get(r.place_id);
  if (seen.has(r.place_id)) sum.read_or_swept++;
  if (!d) continue;
  sum.named++; sum.contacts_total += d.contacts.length;
  if (d.primary_is_owner) sum.owner_level_primary++;
  sum.by_primary_role[d.primary_role] = (sum.by_primary_role[d.primary_role] || 0) + 1;
  sum.by_file[d.contacts_file] = (sum.by_file[d.contacts_file] || 0) + 1;
  sum.by_confidence[d.confidence || '?'] = (sum.by_confidence[d.confidence || '?'] || 0) + 1;
  rows.push({ place_id: r.place_id, business_name: r.name, city: r.city, state: r.state, website: r.website, brand_family: r.brand_family || '', review_count: r.review_count,
    primary_name: d.primary_name, primary_first_name: d.primary_first_name, primary_role: d.primary_role, primary_is_owner: d.primary_is_owner,
    primary_title: (d.contacts.find(c => c.name === d.primary_name) || {}).title || '', primary_evidence: (d.contacts.find(c => c.name === d.primary_name) || {}).evidence || '',
    best_send_email: d.best_send_email || '', contacts: d.contacts, confidence: d.confidence || '', contacts_file: d.contacts_file });
}
sum.named_pct = Math.round(1000 * sum.named / leads.length) / 10;
fs.writeFileSync(OUT, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
const HH = ['place_id', 'business_name', 'city', 'state', 'website', 'brand_family', 'review_count', 'primary_name', 'primary_first_name', 'primary_title', 'primary_role', 'primary_is_owner', 'primary_evidence', 'best_send_email', 'contact_count', 'contacts_json', 'confidence', 'contacts_file'];
fs.writeFileSync(OUT.replace(/\.jsonl$/, '.csv'), [HH.join(',')].concat(rows.map(r => HH.map(h => esc(h === 'contact_count' ? r.contacts.length : h === 'contacts_json' ? JSON.stringify(r.contacts) : r[h])).join(','))).join('\n') + '\n');
fs.writeFileSync(OUT.replace(/\.jsonl$/, '_summary.json'), JSON.stringify(sum, null, 2));
console.log(JSON.stringify(sum));
