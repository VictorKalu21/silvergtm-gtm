#!/usr/bin/env node
// build-companies.mjs — collapse an ats-pull postings.csv to one row per (ats, token)
// hiring company, attach domains, and apply the Step 6 aggregator / non-ICP denylist.
//
//   node scripts/build-companies.mjs --postings run/postings.csv --out run/companies.csv \
//        [--domains run/domains.json] [--tier 1]
//
// Output columns are exactly the `hiring_companies` mapping in scripts/supabase/load.mjs,
// whose company_key is normName(company_name):ats:token — so company_name is never blank
// and (ats, token) is the grouping key here.
//
// Node 22, zero deps. Safe to run against a postings.csv that a pull is still appending to:
// short / truncated trailing rows are reported, not silently dropped.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse, write, norm } = require('./csv.js'); // shared RFC-4180 parser

// ---------------------------------------------------------------------------
// Denylists. Keep these at the top — they are the whole noise filter and they
// get tuned by hand after eyeballing a run's *_review rows.
// ---------------------------------------------------------------------------

// Step 6 (1) name pattern — verbatim from scripts/split-noise.js. The "company"
// is actually the job board / an aggregator reposting someone else's role.
const AGG_NAME = /\b(jobs via|via (dice|linkedin|workable|greenhouse|lever)|jobster|hiring|careers|staffing|recruiting)\b/i;

// Step 6 (2) domain check — verbatim from scripts/split-noise.js.
const AGG_DOMAIN = /(^|\.)(dice|linkedin|indeed|ziprecruiter|glassdoor)\.com$/i;

// Non-ICP: staffing / recruiting / talent shops and consultancies that post RevOps
// roles on behalf of an unnamed client, plus PE-holdco "… Partners" shells.
// DELIBERATELY CONSERVATIVE — every token here is anchored with \b so it cannot
// eat a real product brand ("Talently", "Consultingly", "Partnerstack" all miss),
// and the generic words (partners / advisors / group) only fire at end-of-name,
// which is where an agency puts them and a product company does not.
const NONICP_NAME = new RegExp([
  // explicit agency vocabulary, anywhere in the name
  '\\b(staffing|recruiter|recruiters|recruitment|headhunters?|staffing agency)\\b',
  '\\btalent (solutions|acquisition|partners|group|agency|collective)\\b',
  '\\b(executive search|search partners|search group|search firm)\\b',
  '\\b(consulting|consultancy|consultants|advisory)\\b',
  '\\b(outsourcing|managed services|professional services group)\\b',
  '\\b(llp|pllc)\\b',
  // generic agency/holdco suffixes, END OF NAME ONLY
  '\\b(partners|advisors|advisers|associates|ventures capital)\\s*$',
].join('|'), 'i');

// ---------------------------------------------------------------------------
// Ranking / small helpers
// ---------------------------------------------------------------------------

// Head/Lead is normally the top of a function in a company small enough to be
// hiring its first RevOps person, so `lead` ranks above senior_manager here.
const SENIORITY_RANK = { director: 4, lead: 3, senior_manager: 2, manager: 1, unspecified: 0 };
const TIER_RANK = { 1: 1, 2: 2, 3: 3 }; // lower numeric tier wins; "unknown" only if all unknown

const MAX_LOCATIONS = 5;

const OUT_HEADER = [
  'company_name', 'domain', 'domain_conf', 'flag', 'ats', 'token', 'n_postings',
  'titles', 'buckets', 'seniority_max', 'earliest_published', 'latest_published',
  'countries', 'country_tier_min', 'remote_share', 'locations',
];

const day = s => {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);   // ISO, incl. bare dates
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

// distinct, insertion-ordered, blanks dropped
const distinct = arr => [...new Set(arr.map(v => String(v ?? '').trim()).filter(Boolean))];

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2), n = argv[i + 1];
    if (!n || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
}

function tally(rows, fn) {
  const t = {};
  for (const r of rows) for (const v of [].concat(fn(r))) if (v !== '') t[v] = (t[v] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}
const fmt = pairs => pairs.map(([k, v]) => `${k}=${v}`).join('  ') || '(none)';

// ---------------------------------------------------------------------------
// 1. Read postings, collapse to one row per (ats, token)
// ---------------------------------------------------------------------------

const a = args(process.argv.slice(2));
if (!a.postings || !a.out) {
  console.error('usage: node scripts/build-companies.mjs --postings <postings.csv> --out <companies.csv> [--domains <domains.json>] [--tier 1]');
  process.exit(1);
}

const rows = parse(readFileSync(a.postings, 'utf8'));
if (!rows.length) { console.error('empty postings file'); process.exit(1); }

const header = rows[0].map(h => h.trim().replace(/^﻿/, ''));
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const need of ['ats', 'token', 'company_name', 'job_id']) {
  if (col[need] === undefined) { console.error(`postings.csv is missing required column: ${need}`); process.exit(1); }
}

const groups = new Map();      // "ats\u0000token" -> accumulator
const badRows = [];            // rows that did not parse into the schema
let readRows = 0;

rows.slice(1).forEach((cells, i) => {
  const line = i + 2;                                   // 1-based, +1 for header
  if (cells.length === 1 && cells[0].trim() === '') return;  // blank line
  readRows++;

  // A pull that is mid-write leaves a short final row; a feed with an unbalanced
  // quote leaves a long one. Either way: report, never silently absorb.
  if (cells.length !== header.length) {
    badRows.push({ line, reason: `field count ${cells.length} != ${header.length}`, sample: cells.slice(0, 4).join(',').slice(0, 90) });
    return;
  }
  const g = h => (cells[col[h]] ?? '').trim();
  const ats = g('ats'), token = g('token');
  if (!ats || !token) {
    badRows.push({ line, reason: 'blank ats/token', sample: cells.slice(0, 4).join(',').slice(0, 90) });
    return;
  }

  const key = `${ats}\u0000${token}`;
  let acc = groups.get(key);
  if (!acc) {
    acc = {
      ats, token, names: [], nameSources: [], n: 0,
      titles: [], buckets: [], seniorities: [], countries: [], locations: [],
      tiers: [], dates: [], remoteYes: 0,
    };
    groups.set(key, acc);
  }
  acc.n++;
  acc.names.push(g('company_name'));
  acc.nameSources.push(g('name_source'));
  acc.titles.push(g('title_raw'));
  acc.buckets.push(g('title_bucket'));
  acc.seniorities.push(g('seniority'));
  acc.countries.push(g('country'));
  acc.locations.push(g('location_raw'));
  acc.tiers.push(g('country_tier'));
  const d = day(g('published_at'));
  if (d) acc.dates.push(d);
  if (g('remote').toLowerCase() === 'yes') acc.remoteYes++;
});

const companies = [...groups.values()].map(acc => {
  // Prefer a real board-supplied name over a bare board slug (name_source=token);
  // the slug is only a hint for the domain step. Fall back to the slug.
  const boardName = acc.names.find((n, i) => n && acc.nameSources[i] !== 'token');
  const company_name = boardName || acc.names.find(Boolean) || acc.token;

  const seniority_max = acc.seniorities.reduce(
    (best, s) => ((SENIORITY_RANK[s] ?? -1) > (SENIORITY_RANK[best] ?? -1) ? s : best),
    'unspecified');

  const known = acc.tiers.map(t => TIER_RANK[t]).filter(Boolean);
  const country_tier_min = known.length ? String(Math.min(...known)) : 'unknown';

  const dates = acc.dates.slice().sort();

  return {
    company_name,
    domain: '', domain_conf: '', flag: 'verify',
    ats: acc.ats, token: acc.token,
    n_postings: acc.n,
    titles: distinct(acc.titles).join('|'),
    buckets: distinct(acc.buckets).join('|'),
    seniority_max,
    earliest_published: dates[0] || '',
    latest_published: dates[dates.length - 1] || '',
    countries: distinct(acc.countries).join('|'),
    country_tier_min,
    remote_share: (acc.remoteYes / acc.n).toFixed(2),
    locations: distinct(acc.locations).slice(0, MAX_LOCATIONS).join('|'),
  };
});

// ---------------------------------------------------------------------------
// 2. Domains — split-noise.js shape: { "<company name or token>": [domain, conf, flag] }
// ---------------------------------------------------------------------------

if (a.domains) {
  const D = JSON.parse(readFileSync(a.domains, 'utf8'));
  const dmap = {};
  for (const k in D) dmap[norm(k)] = D[k];
  let matched = 0;
  for (const c of companies) {
    const hit = dmap[norm(c.company_name)] || dmap[norm(c.token)];
    if (!hit) continue;
    const [dom = '', conf = '', flag = 'verify'] = hit;
    c.domain = dom; c.domain_conf = conf; c.flag = flag || 'verify';
    if (dom) matched++;
  }
  console.log(`domains: ${matched}/${companies.length} companies matched from ${a.domains}`);
}

// ---------------------------------------------------------------------------
// 3. Step 6 denylist + dedupe on domain
// ---------------------------------------------------------------------------

// Freshest first, so "keep first" on a duplicate domain keeps the most recent poster.
companies.sort((x, y) =>
  (y.latest_published || '').localeCompare(x.latest_published || '') ||
  y.n_postings - x.n_postings ||
  x.company_name.localeCompare(y.company_name));

const seenDomain = new Set();
for (const c of companies) {
  if (AGG_NAME.test(c.company_name) || AGG_DOMAIN.test(c.domain)) c.flag = 'aggregator';
  else if (NONICP_NAME.test(c.company_name)) c.flag = 'nonicp';

  if (c.domain && c.flag !== 'aggregator' && c.flag !== 'nonicp') {
    if (seenDomain.has(c.domain)) c.flag = 'dup';
    else seenDomain.add(c.domain);
  }
}

// ---------------------------------------------------------------------------
// 4. Tier gate
// ---------------------------------------------------------------------------

let kept = companies, droppedByTier = [];
if (a.tier) {
  const want = String(a.tier);
  droppedByTier = companies.filter(c => c.country_tier_min !== want && c.country_tier_min !== 'unknown');
  kept = companies.filter(c => c.country_tier_min === want || c.country_tier_min === 'unknown');
  // Unknown-tier rows survive the gate but are never promoted past review.
  for (const c of kept) {
    if (c.country_tier_min === 'unknown' && (c.flag === 'ok' || c.flag === 'verify')) c.flag = 'verify';
  }
}

// ---------------------------------------------------------------------------
// Write + summary
// ---------------------------------------------------------------------------

writeFileSync(a.out, write([OUT_HEADER, ...kept.map(c => OUT_HEADER.map(h => c[h]))]) + '\n');

const unknownKept = kept.filter(c => c.country_tier_min === 'unknown').length;

console.log(`\npostings read: ${readRows}  |  unparsed rows: ${badRows.length}`);
if (badRows.length) {
  for (const b of badRows.slice(0, 20)) console.log(`  line ${b.line}: ${b.reason} — ${b.sample}`);
  if (badRows.length > 20) console.log(`  … and ${badRows.length - 20} more`);
}
if (a.tier) {
  console.log(`tier gate --tier ${a.tier}: dropped ${droppedByTier.length} of ${companies.length} companies` +
              ` (kept ${unknownKept} with country_tier_min=unknown, flagged verify)`);
  if (droppedByTier.length) console.log(`  dropped by tier: ${fmt(tally(droppedByTier, c => c.country_tier_min))}`);
}

console.log(`\ncompanies total: ${kept.length}  ->  ${a.out}`);
console.log(`  by ats:              ${fmt(tally(kept, c => c.ats))}`);
console.log(`  by flag:             ${fmt(tally(kept, c => c.flag))}`);
console.log(`  by country_tier_min: ${fmt(tally(kept, c => c.country_tier_min))}`);
console.log(`  by seniority_max:    ${fmt(tally(kept, c => c.seniority_max))}`);
console.log(`  by bucket:           ${fmt(tally(kept, c => c.buckets.split('|').filter(Boolean)))}`);
console.log(`  with domain:         ${kept.filter(c => c.domain).length}/${kept.length}`);
