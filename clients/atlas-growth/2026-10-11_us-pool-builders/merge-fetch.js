#!/usr/bin/env node
/* merge-fetch.js :: the site fetch ran as 4 shards (owner/fetch-N/site_text.jsonl) plus an optional retry pass
 * (owner/fetch-retry/site_text.jsonl). Merge them into the canonical owner/site_text.jsonl, one record per
 * place_id, an `ok` record always beating a failed one. --residue instead writes owner/domains-retry.csv: the
 * leads_domains.csv rows whose best record is a TRANSIENT failure (timeout/abort/reset/5xx/429/TypeError), for a
 * re-run of fetch-sites.js — needed because a shard's worker pool can exit silently before its own PASS-2 retry
 * (IMPROVEMENTS.md OPEN: fetch-sites lets an escaped error end the pool with promises pending).
 * Usage: node merge-fetch.js [--residue] */
const fs = require('fs'), path = require('path');
const R = __dirname, O = path.join(R, 'owner');
const RESIDUE = process.argv.includes('--residue');
function pc(t) { const RR = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); RR.push(r); r = []; c = ''; } else if (ch === '\r') { } else c += ch; } } if (c !== '' || r.length) { r.push(c); RR.push(r); } return RR; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const files = [...fs.readdirSync(O).filter(d => /^fetch-\d+$/.test(d)).map(d => path.join(O, d, 'site_text.jsonl')), path.join(O, 'fetch-retry', 'site_text.jsonl')].filter(f => fs.existsSync(f));
const best = new Map(); let read = 0;
for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)) { let o; try { o = JSON.parse(l); } catch { continue; } read++; const prev = best.get(o.place_id); if (!prev || (o.status === 'ok' && prev.status !== 'ok')) best.set(o.place_id, o); }
const transient = s => /AbortError|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|TypeError|reset|:(429|5\d\d)$/i.test(s);
const tally = {}; for (const o of best.values()) { const k = o.status === 'ok' ? 'ok' : o.status.replace(/^home_failed:/, '').slice(0, 14); tally[k] = (tally[k] || 0) + 1; }
if (RESIDUE) {
  const rows = pc(fs.readFileSync(path.join(R, 'leads_domains.csv'), 'utf8')).filter(r => r.length > 1); const H = rows.shift(); const pi = H.indexOf('place_id');
  const want = new Set([...best.values()].filter(o => o.status !== 'ok' && transient(o.status)).map(o => o.place_id));
  const missing = rows.filter(r => !best.has(r[pi])); // never fetched at all (pool died before reaching them)
  const out = rows.filter(r => want.has(r[pi]) || !best.has(r[pi]));
  fs.writeFileSync(path.join(O, 'domains-retry.csv'), [H.map(esc).join(','), ...out.map(r => r.map(esc).join(','))].join('\n') + '\n');
  console.log(`residue -> owner/domains-retry.csv: ${out.length} rows (${want.size} transient failures + ${missing.length} never fetched) | best-record tally: ${JSON.stringify(tally)}`);
} else {
  fs.writeFileSync(path.join(O, 'site_text.jsonl'), [...best.values()].map(o => JSON.stringify(o)).join('\n') + '\n');
  console.log(`merged ${read} records from ${files.length} files -> ${best.size} unique place_ids in owner/site_text.jsonl | tally: ${JSON.stringify(tally)}`);
}
