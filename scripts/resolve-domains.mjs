#!/usr/bin/env node
// resolve-domains.mjs — thin wrapper around the name-to-domain skill's Tier 0.5
// free HTTP resolver (skills/name-to-domain/scripts/script-resolve.mjs).
//
//   node scripts/resolve-domains.mjs --companies run/companies.csv --out run/domains.json \
//        [--limit 40] [--conc 6] [--timeout 15000] [--work <stagedir>]
//
// It does NOT reimplement the resolver. It stages the skill's own script in a work
// dir, feeds it the input shape that script already reads (dbatch-<N>-in.json +
// resolved_partial.json), child_processes it once per hint pass, and merges the
// results. The only edits applied to the staged copy are the two knobs this
// pipeline sets (concurrency, socket timeout) — the candidate generation, the
// parked-domain reject and the brand-token-in-page guard are untouched.
//
// Hints, in the order they are tried (one pass each, later passes only see the
// companies still unresolved):
//   1. the board token — ATS slugs are usually the apex label, so https://<token>.com
//      is tried first for rows whose company_name IS the slug (name_source=token).
//   2. the company_name as the board reported it.
//   3. company_name with a trailing legal/marketing suffix stripped.
// The first location is carried alongside as context: it is not a domain guess, it
// is scored as corroborating evidence on the verified page.
//
// Output: domains.json in the split-noise.js shape — { "<name or token>": [domain, conf, flag] }
// with flag=ok for a confident resolution and flag=verify otherwise. A sidecar
// domains.evidence.json records why each row got the flag it got.
//
// Node 22, zero deps.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const require = createRequire(import.meta.url);
const { parse } = require('./csv.js');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_SCRIPT = path.join(REPO, 'skills/name-to-domain/scripts/script-resolve.mjs');

const MAX_BATCH_FILES = 20;      // the skill script scans dbatch-1..20-in.json
const SHORT_SLUG = 4;            // slugs below this are collision-prone -> never auto-ok

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2), n = argv[i + 1];
    if (!n || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
}

const slugOf = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const apexLabel = d => String(d || '').replace(/^www\./, '').split('.')[0];

// ---------------------------------------------------------------------------
// Stage the skill's script with only the two knobs this pipeline overrides.
// ---------------------------------------------------------------------------
function stageSkillScript(stageDir, conc, timeoutMs) {
  let src = readFileSync(SKILL_SCRIPT, 'utf8');
  const patches = [
    [/const CONC = \d+;/, `const CONC = ${conc};`],
    [/timeout: \d+\s*\}/, `timeout: ${timeoutMs} }`],
  ];
  for (const [re, to] of patches) {
    if (!re.test(src)) throw new Error(`resolve-domains: skill script no longer matches ${re} — re-check skills/name-to-domain/scripts/script-resolve.mjs`);
    src = src.replace(re, to);
  }
  const dst = path.join(stageDir, 'script-resolve.mjs');
  writeFileSync(dst, src);
  return dst;
}

// ---------------------------------------------------------------------------
// One pass = write the script's native inputs, run it, read its native output.
// ---------------------------------------------------------------------------
function runPass(stageDir, staged, entries, alreadyResolved) {
  // clear previous pass inputs
  for (let i = 1; i <= MAX_BATCH_FILES; i++) {
    const p = path.join(stageDir, `dbatch-${i}-in.json`);
    if (existsSync(p)) rmSync(p);
  }
  writeFileSync(path.join(stageDir, 'resolved_partial.json'), JSON.stringify(alreadyResolved));

  const per = Math.ceil(entries.length / MAX_BATCH_FILES) || 1;
  let n = 0;
  for (let i = 0; i < entries.length; i += per) {
    n++;
    writeFileSync(path.join(stageDir, `dbatch-${n}-in.json`), JSON.stringify(entries.slice(i, i + per), null, 2));
  }

  const outPath = path.join(stageDir, 'script_resolved.json');
  if (existsSync(outPath)) rmSync(outPath);
  execFileSync(process.execPath, [staged], { stdio: ['ignore', 'inherit', 'inherit'] });
  return existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
}

// ---------------------------------------------------------------------------
// Evidence pass: one GET per resolved domain to capture the <title> and check
// whether the posting's location corroborates. Not resolution — scoring.
// ---------------------------------------------------------------------------
function getPage(host, timeoutMs, redirects = 0) {
  return new Promise(resolve => {
    const req = https.get({ host, path: '/', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; leadbot/1.0)', Accept: 'text/html' }, timeout: timeoutMs }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        res.resume();
        try {
          const u = new URL(res.headers.location, `https://${host}/`);
          if (!/^https?:$/.test(u.protocol)) return resolve(null);
          return getPage(u.hostname, timeoutMs, redirects + 1).then(resolve);
        } catch { return resolve(null); }
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.on('data', d => { if (body.length < 20000) body += d; });
      res.on('end', () => resolve({ host, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function pool(items, conc, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: conc }, async () => {
    while (q.length) await fn(q.shift());
  }));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const a = args(process.argv.slice(2));
if (!a.companies || !a.out) {
  console.error('usage: node scripts/resolve-domains.mjs --companies <companies.csv> --out <domains.json> [--limit N] [--conc 6] [--timeout 15000]');
  process.exit(1);
}
const CONC = Number(a.conc || 6);
const TIMEOUT = Number(a.timeout || 15000);
const stageDir = a.work || path.join(path.dirname(path.resolve(a.out)), '.domain-work');
mkdirSync(stageDir, { recursive: true });

const rows = parse(readFileSync(a.companies, 'utf8'));
const header = rows[0].map(h => h.trim());
const ci = Object.fromEntries(header.map((h, i) => [h, i]));
const recs = rows.slice(1)
  .filter(r => r.length === header.length)
  .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));

// Only rows that still need a domain and are still in play.
let todo = recs.filter(r => !r.domain && !['aggregator', 'nonicp', 'dup'].includes(r.flag));
if (a.limit) todo = todo.slice(0, Number(a.limit));

for (const r of todo) {
  r._key = `${r.ats}:${r.token}`;
  // name_source=token is recoverable from the output CSV: the board gave no real
  // name, so company_name IS the slug.
  r._slugName = slugOf(r.company_name) === slugOf(r.token);
  r._loc = (r.locations || '').split('|')[0] || '';
  const nameNoSuffix = r.company_name.replace(/[\s,]+(inc|llc|ltd|limited|corp|corporation|gmbh|plc|technologies|technology|labs|software|group)\.?$/i, '').trim();
  r._hints = [...new Set([
    ...(r._slugName ? [r.token, r.company_name] : [r.company_name, r.token]),
    nameNoSuffix,
  ].map(s => (s || '').trim()).filter(s => s.length >= 2))];
}

console.error(`resolve-domains: ${todo.length} companies need a domain (conc ${CONC}, timeout ${TIMEOUT}ms)`);
const staged = stageSkillScript(stageDir, CONC, TIMEOUT);

const resolved = {};           // _key -> {domain, resolved, confidence}
const hintUsed = {};           // _key -> hint string
const maxPasses = Math.max(...todo.map(r => r._hints.length), 0);

for (let p = 0; p < maxPasses; p++) {
  const entries = todo.filter(r => !resolved[r._key] && r._hints[p])
    .map(r => ({ key: r._key, name: r._hints[p], location: r._loc }));
  if (!entries.length) continue;
  console.error(`\n-- pass ${p + 1}: ${entries.length} entries, hint = ${p === 0 ? 'token/name (slug first)' : p === 1 ? 'alternate name' : 'de-suffixed name'}`);
  const got = runPass(stageDir, staged, entries, resolved);
  for (const k in got) { resolved[k] = got[k]; hintUsed[k] = entries.find(e => e.key === k)?.name || ''; }
}

// evidence + confidence
const evidence = {};
await pool(todo.filter(r => resolved[r._key]), CONC, async r => {
  const hit = resolved[r._key];
  const page = await getPage(hit.domain, TIMEOUT).catch(() => null);
  const title = page ? ((page.body.match(/<title[^>]*>([^<]{0,160})<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim() : '';
  const bslug = slugOf(hit.resolved);
  const direct = apexLabel(hit.domain) === bslug;
  const locTok = (r._loc.match(/[A-Za-z]{4,}/g) || []).map(s => s.toLowerCase());
  const locHit = page ? locTok.filter(t => page.body.toLowerCase().includes(t)).slice(0, 3) : [];

  const ok = direct && bslug.length >= SHORT_SLUG;
  evidence[r._key] = {
    company_name: r.company_name, ats: r.ats, token: r.token,
    hint_used: hintUsed[r._key], brand: hit.resolved, domain: hit.domain,
    apex_matches_brand: direct, brand_slug_len: bslug.length,
    title, location: r._loc, location_terms_on_page: locHit,
    conf: ok ? 'high' : 'medium', flag: ok ? 'ok' : 'verify',
  };
});

// split-noise shape, keyed by company_name AND token so build-companies finds it either way
const out = {};
for (const r of todo) {
  const hit = resolved[r._key];
  if (!hit) { out[r.company_name] = ['', 'low', 'verify']; continue; }
  const ev = evidence[r._key] || { conf: 'medium', flag: 'verify' };
  const val = [hit.domain, ev.conf, ev.flag];
  out[r.company_name] = val;
  if (r.token && r.token !== r.company_name) out[r.token] = val;
}
writeFileSync(a.out, JSON.stringify(out, null, 2));
writeFileSync(a.out.replace(/\.json$/, '') + '.evidence.json', JSON.stringify(evidence, null, 2));

const nHit = Object.keys(resolved).length;
const nOk = Object.values(evidence).filter(e => e.flag === 'ok').length;
console.error(`\nDONE: ${nHit}/${todo.length} resolved (${(100 * nHit / (todo.length || 1)).toFixed(0)}% hit rate) — ok=${nOk} verify=${nHit - nOk}`);
console.error(`  -> ${a.out}`);
console.error(`  -> ${a.out.replace(/\.json$/, '')}.evidence.json`);
