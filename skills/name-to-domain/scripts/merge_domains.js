#!/usr/bin/env node
/*
 * merge_domains.js — join cache hits + subagent batch outputs back to the source rows,
 * write the Apollo-ready CSV, and grow the cache.
 *
 * Usage:
 *   node merge_domains.js --in leads.csv --name company --work ./work \
 *        --cache ./domain_cache.csv --out leads_domains.csv --passthrough title,url
 *
 * Reads:
 *   <work>/cache_hits.json                     (from prep_batches.js)
 *   <work>/batches/batch-*-out.json            (from the Haiku subagents; keyed by `key`)
 */
const fs = require('fs');
const path = require('path');

function args() {
  const a = {}, v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (v[i].startsWith('--')) {
      const k = v[i].slice(2), n = v[i + 1];
      if (!n || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
    }
  }
  return a;
}
function parseCSV(txt) {
  const rows = []; let f = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else {
      if (c === '"') q = true;
      else if (c === ',') { f.push(cur); cur = ''; }
      else if (c === '\n') { f.push(cur); rows.push(f); f = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || f.length) { f.push(cur); rows.push(f); }
  return rows;
}
function norm(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function esc(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

const a = args();
const inCsv = a.in, nameCol = a.name, work = a.work || './work', cachePath = a.cache,
      outCsv = a.out || 'domains_out.csv',
      pass = (a.passthrough || '').split(',').map(s => s.trim()).filter(Boolean);
if (!inCsv || !nameCol) { console.error('need --in <csv> and --name <column>'); process.exit(1); }

const rows = parseCSV(fs.readFileSync(inCsv, 'utf8'));
const header = rows[0].map(h => h.trim());
const idx = h => header.indexOf(h);
const ni = idx(nameCol);

// gather all resolutions (cache hits + fresh subagent output)
const res = {}, fresh = {};
const hitsPath = path.join(work, 'cache_hits.json');
if (fs.existsSync(hitsPath)) Object.assign(res, JSON.parse(fs.readFileSync(hitsPath, 'utf8')));
const bdir = path.join(work, 'batches');
if (fs.existsSync(bdir)) {
  for (const f of fs.readdirSync(bdir)) {
    if (/-out\.json$/.test(f)) {
      const o = JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8'));
      for (const k in o) { res[k] = o[k]; fresh[k] = o[k]; }
    }
  }
}

// write output
const outHeader = [nameCol, 'resolved_company', 'domain', 'confidence', ...pass];
const out = [outHeader.map(esc).join(',')];
let hit = 0, miss = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length === 1 && r[0] === '') continue;
  const name = r[ni], key = norm(name), d = res[key] || {};
  const domain = d.domain || '';
  if (domain) hit++; else miss.push(name);
  const line = [name, d.resolved || '', domain, d.confidence || '',
    ...pass.map(c => { const ci = idx(c); return ci >= 0 ? r[ci] : ''; })];
  out.push(line.map(esc).join(','));
}
fs.writeFileSync(outCsv, out.join('\n'));

// grow the cache with fresh, non-empty resolutions (under input key AND resolved-brand key)
if (cachePath) {
  const cacheRows = {};
  if (fs.existsSync(cachePath)) {
    const cr = parseCSV(fs.readFileSync(cachePath, 'utf8'));
    const ch = cr[0].map(h => h.trim());
    const ck = ch.indexOf('norm_key'), cd = ch.indexOf('domain'),
          crn = ch.indexOf('resolved_company'), cc = ch.indexOf('confidence');
    for (let i = 1; i < cr.length; i++) {
      const rr = cr[i]; if (!rr[ck]) continue;
      cacheRows[rr[ck]] = { resolved: rr[crn] || '', domain: rr[cd] || '', confidence: rr[cc] || '' };
    }
  }
  for (const k in fresh) {
    const d = fresh[k]; if (!d.domain) continue;
    cacheRows[k] = { resolved: d.resolved || '', domain: d.domain, confidence: d.confidence || '' };
    if (d.resolved) { const rk = norm(d.resolved); if (rk && rk !== k) cacheRows[rk] = { resolved: d.resolved, domain: d.domain, confidence: d.confidence || '' }; }
  }
  const ch = ['norm_key,resolved_company,domain,confidence'];
  for (const k in cacheRows) { const d = cacheRows[k]; ch.push([k, d.resolved, d.domain, d.confidence].map(esc).join(',')); }
  fs.writeFileSync(cachePath, ch.join('\n'));
}

console.log(`wrote ${outCsv} | domains ${hit} | blank ${miss.length}` +
  (miss.length ? ' -> ' + miss.slice(0, 10).join(', ') + (miss.length > 10 ? ' ...' : '') : ''));
