#!/usr/bin/env node
/*
 * prep_batches.js — Tier-0 cache check + split cache-misses into batch input files.
 *
 * Usage:
 *   node prep_batches.js --in leads.csv --name company --context title,url \
 *        --batch 25 --out ./work --cache ./domain_cache.csv
 *
 * Writes:
 *   <out>/cache_hits.json                      resolved rows answered from cache
 *   <out>/batches/batch-<N>-in.json            [{key,name,<context...>}, ...] for the subagents
 *   <out>/manifest.json                        counts
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

// minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF)
function parseCSV(txt) {
  const rows = []; let f = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
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

// normalize a company name into a cache key. Kept deliberately LIGHT — only strip
// legal suffixes and punctuation. Do NOT strip tokens like "ai"/"io"/"labs" because
// they are part of real brands (Tali AI, OH.io) and stripping them causes bad collisions.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const a = args();
const inCsv = a.in, nameCol = a.name;
const ctx = (a.context || '').split(',').map(s => s.trim()).filter(Boolean);
const batchSize = parseInt(a.batch || '25', 10);
const outDir = a.out || './work';
const cachePath = a.cache;

if (!inCsv || !nameCol) { console.error('need --in <csv> and --name <column>'); process.exit(1); }

const rows = parseCSV(fs.readFileSync(inCsv, 'utf8'));
const header = rows[0].map(h => h.trim());
const idx = h => header.indexOf(h);
const ni = idx(nameCol);
if (ni < 0) { console.error('name column not found: ' + nameCol + ' (have: ' + header.join(', ') + ')'); process.exit(1); }

// load cache
const cache = {};
if (cachePath && fs.existsSync(cachePath)) {
  const cr = parseCSV(fs.readFileSync(cachePath, 'utf8'));
  const ch = cr[0].map(h => h.trim());
  const ck = ch.indexOf('norm_key'), cd = ch.indexOf('domain'),
        crn = ch.indexOf('resolved_company'), cc = ch.indexOf('confidence');
  for (let i = 1; i < cr.length; i++) {
    const r = cr[i]; if (!r[ck]) continue;
    cache[r[ck]] = { domain: r[cd] || '', resolved: r[crn] || '', confidence: (r[cc] || 'cache') };
  }
}

const misses = [], hits = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length === 1 && r[0] === '') continue; // blank line
  const name = r[ni], key = norm(name);
  if (cache[key] && cache[key].domain) {
    hits[key] = cache[key];
  } else {
    const o = { key, name };
    for (const c of ctx) { const ci = idx(c); if (ci >= 0) o[c] = r[ci] || ''; }
    misses.push(o);
  }
}

fs.mkdirSync(path.join(outDir, 'batches'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'cache_hits.json'), JSON.stringify(hits, null, 2));

let n = 0;
for (let i = 0; i < misses.length; i += batchSize) {
  n++;
  fs.writeFileSync(path.join(outDir, 'batches', `batch-${n}-in.json`),
    JSON.stringify(misses.slice(i, i + batchSize), null, 2));
}

const manifest = { total: rows.length - 1, cache_hits: Object.keys(hits).length, misses: misses.length, batches: n, batchSize };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`total ${manifest.total} | cache hits ${manifest.cache_hits} | misses ${manifest.misses} | batches ${n}`);
