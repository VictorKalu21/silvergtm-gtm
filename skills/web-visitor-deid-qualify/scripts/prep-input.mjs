// STEP 0: Apollo accounts-export CSV -> {RUN}_input.json. Dedups by domain. Maps Apollo's
// common column names; override with COLS='name=Company,website=Website,...' if a header differs.
//
//   RUN=<run> DIR=<dir> node prep-input.mjs path/to/apollo_export.csv
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const FILE = process.argv[2];
if (!FILE) { console.error('usage: node prep-input.mjs <apollo_export.csv>'); process.exit(1); }

// minimal RFC4180-ish CSV parser
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const pick = (h, names) => { for (const n of names) { const i = h.findIndex((x) => x.trim().toLowerCase() === n.toLowerCase()); if (i >= 0) return i; } return -1; };

const rows = parseCSV(readFileSync(FILE, 'utf8'));
const header = rows.shift();
const override = {};
(process.env.COLS || '').split(',').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); override[k] = pick(header, [v]); });
const idx = {
  name: override.name ?? pick(header, ['Company', 'Company Name', 'Account', 'Name']),
  website: override.website ?? pick(header, ['Website', 'Company Website', 'Domain', 'Primary Domain']),
  employees: override.employees ?? pick(header, ['# Employees', 'Employees', 'Employee Count', 'Company Headcount']),
  state: override.state ?? pick(header, ['Company State', 'State', 'Account State']),
  industry: override.industry ?? pick(header, ['Industry', 'Company Industry']),
  desc: override.desc ?? pick(header, ['Short Description', 'SEO Description', 'Company Description', 'Keywords']),
  facebook: override.facebook ?? pick(header, ['Facebook Url', 'Facebook', 'Company Facebook Url']),
  linkedin: override.linkedin ?? pick(header, ['Company Linkedin Url', 'Company LinkedIn Url', 'LinkedIn Url', 'Linkedin']),
};
const fbHandle = (u) => { if (!u) return null; const m = String(u).match(/facebook\.com\/([A-Za-z0-9_.\-]{2,})/i); const h = m && m[1]; return h && !/^(tr|sharer|dialog|plugins|pages|profile\.php)$/i.test(h) ? h : null; };
const liVanity = (u) => { if (!u) return null; const m = String(u).match(/linkedin\.com\/company\/([A-Za-z0-9_.\-]{2,})/i); return m ? m[1].replace(/\/$/, '') : null; };
const dom = (u) => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return (u || '').toLowerCase(); } };
const out = [], seen = new Set();
for (const r of rows) {
  if (!r.length || r.every((c) => !c)) continue;
  const website = idx.website >= 0 ? r[idx.website] : '';
  const d = dom(website);
  if (!d || seen.has(d)) continue; seen.add(d);
  out.push({
    name: idx.name >= 0 ? r[idx.name] : '', website,
    employees: idx.employees >= 0 ? Number(String(r[idx.employees]).replace(/[^\d]/g, '')) || null : null,
    state: idx.state >= 0 ? r[idx.state] : '', industry: idx.industry >= 0 ? r[idx.industry] : '',
    desc: idx.desc >= 0 ? r[idx.desc] : '',
    fbApollo: idx.facebook >= 0 ? fbHandle(r[idx.facebook]) : null,
    liVanity: idx.linkedin >= 0 ? liVanity(r[idx.linkedin]) : null,
  });
}
writeFileSync(`${DIR}/${RUN}_input.json`, JSON.stringify(out, null, 2));
console.error(`mapped cols:`, Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, v >= 0 ? header[v] : 'MISSING'])));
console.error(`wrote ${DIR}/${RUN}_input.json : ${out.length} domain-deduped rows (from ${rows.length} csv rows)`);
