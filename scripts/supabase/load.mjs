#!/usr/bin/env node
// Load pipeline CSVs into Supabase via PostgREST upsert. Node 22, zero deps.
//
//   node scripts/supabase/load.mjs --table ats_postings --csv postings.csv \
//        [--run-id 2026-09-22] [--dry-run] [--batch 500]
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (not needed for --dry-run).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('../csv.js'); // shared RFC-4180 parser

// ---------------------------------------------------------------------------
// Column mapping. One object, one place to adjust.
//   type: text | int | num | ts | date
//   from: source CSV header (defaults to the column name)
//   fill: () => value, used when the CSV has no such column
// Columns absent from the CSV and without `fill` are simply omitted from the
// payload, so DB defaults (e.g. ats_postings.first_seen_at) still apply.
// ---------------------------------------------------------------------------
const NOW = () => new Date().toISOString();

const TABLES = {
  ats_boards: {
    keyColumn: 'board_key',
    // ats:token:region:shard:site — empty segments keep the key stable for nulls
    makeKey: r => [r.ats, r.token, r.region || '', r.shard || '', r.site || ''].join(':'),
    required: ['ats', 'token'],
    columns: {
      ats: 'text', token: 'text', region: 'text', shard: 'text', site: 'text',
      company_name: 'text', status: 'text',
      jobs_total: 'int', jobs_matched: 'int', url_count: 'int',
      crawls: 'text', fetched_at: 'ts',
    },
  },

  ats_postings: {
    keyColumn: 'posting_key',
    makeKey: r => [r.ats, r.token, r.job_id].join(':'),
    required: ['ats', 'token', 'job_id'],
    // NOTE: first_seen_at is deliberately NOT listed. PostgREST
    // merge-duplicates overwrites every column it is sent, so leaving it out
    // preserves the original value on conflict and lets the DB default fill it
    // on insert. last_seen_at is refreshed on every load.
    columns: {
      ats: 'text', token: 'text', company_name: 'text', name_source: 'text',
      job_id: 'text', title_raw: 'text', title_bucket: 'text', seniority: 'text',
      published_at: 'ts', location_raw: 'text', country: 'text',
      country_tier: 'text', remote: 'text', department: 'text',
      salary_min: 'num', salary_max: 'num', salary_currency: 'text',
      apply_url: 'text',
      last_seen_at: { type: 'ts', fill: NOW },
      run_id: { type: 'text', fill: ctx => ctx.runId },
    },
  },

  hiring_companies: {
    keyColumn: 'company_key',
    makeKey: r => [normName(r.company_name), r.ats, r.token].join(':'),
    required: ['company_name'],
    columns: {
      company_name: 'text', domain: 'text', domain_conf: 'text', flag: 'text',
      ats: 'text', token: 'text', n_postings: 'int',
      titles: 'text', buckets: 'text', seniority_max: 'text',
      earliest_published: 'date', latest_published: 'date',
      countries: 'text', country_tier_min: 'text',
      remote_share: 'num', locations: 'text',
      run_id: { type: 'text', fill: ctx => ctx.runId },
      updated_at: { type: 'ts', fill: NOW },
    },
  },
};

// ---------------------------------------------------------------------------
// Normalization / coercion
// ---------------------------------------------------------------------------
// Company-name normalizer for company_key: lowercase, strip punctuation, strip
// legal suffixes, collapse to [a-z0-9]. Kept local (not csv.js `norm`) because
// the key needs plc stripped and "the" preserved.
const LEGAL = /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g;
function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // punctuation -> space
    .replace(LEGAL, ' ')
    .replace(/[^a-z0-9]/g, '');
}

const isBlank = v => v === undefined || v === null || String(v).trim() === '';

function toNumber(v, col, warn) {
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) { warn(`non-numeric ${col}: ${JSON.stringify(v)} -> null`); return null; }
  return n;
}

function toIso(v, col, warn) {
  const s = String(v).trim();
  // Bare YYYY-MM-DD is a calendar date; pin it to UTC midnight rather than
  // letting the runtime's local zone shift it a day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  if (/^\d{9,13}$/.test(s)) { // epoch seconds or millis
    const n = Number(s);
    return new Date(s.length > 10 ? n : n * 1000).toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) { warn(`unparseable timestamp ${col}: ${JSON.stringify(v)} -> null`); return null; }
  return d.toISOString();
}

function toDate(v, col, warn) {
  const iso = toIso(v, col, warn);
  return iso ? iso.slice(0, 10) : null;
}

function coerce(type, raw, col, warn) {
  if (isBlank(raw)) return null;              // empty string -> null, always
  const v = String(raw).trim();
  switch (type) {
    case 'int': { const n = toNumber(v, col, warn); return n === null ? null : Math.trunc(n); }
    case 'num': return toNumber(v, col, warn);
    case 'ts': return toIso(v, col, warn);
    case 'date': return toDate(v, col, warn);
    default: return v;
  }
}

// ---------------------------------------------------------------------------
// CSV -> payload rows
// ---------------------------------------------------------------------------
function readCsv(path) {
  const rows = parse(readFileSync(path, 'utf8'));
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map(h => h.trim().replace(/^﻿/, ''));
  const records = rows.slice(1).map(cells => {
    const rec = {};
    header.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
  return { header, records };
}

function buildRows(spec, records, ctx, warnings) {
  const out = [];
  const seen = new Map();          // key -> index in out
  const stats = { read: records.length, skipped: 0, duplicates: 0 };

  records.forEach((rec, i) => {
    const line = i + 2;            // 1-based, +1 for the header
    const warn = m => warnings.push(`row ${line}: ${m}`);

    const missing = spec.required.filter(c => isBlank(rec[c]));
    if (missing.length) {
      stats.skipped++;
      warn(`skipped — missing ${missing.join(', ')}`);
      return;
    }

    const payload = { [spec.keyColumn]: spec.makeKey(rec) };
    for (const [col, def] of Object.entries(spec.columns)) {
      const type = typeof def === 'string' ? def : def.type;
      const fill = typeof def === 'string' ? null : def.fill;
      const src = (typeof def === 'object' && def.from) || col;
      if (Object.prototype.hasOwnProperty.call(rec, src) && !isBlank(rec[src])) {
        payload[col] = coerce(type, rec[src], col, warn);
      } else if (fill) {
        const filled = fill(ctx);
        if (filled !== undefined && filled !== null) payload[col] = filled;
      } else if (Object.prototype.hasOwnProperty.call(rec, src)) {
        payload[col] = null;       // present but empty -> explicit null
      }
      // absent from the CSV and no fill: omit, let the DB default stand
    }

    // A batch may not touch the same PK twice (ON CONFLICT DO UPDATE errors),
    // so collapse duplicates here — last row wins.
    const key = payload[spec.keyColumn];
    if (seen.has(key)) {
      stats.duplicates++;
      warnings.push(`row ${line}: duplicate ${spec.keyColumn} ${JSON.stringify(key)} — later row wins`);
      out[seen.get(key)] = payload;
    } else {
      seen.set(key, out.length);
      out.push(payload);
    }
  });

  stats.loaded = out.length;
  return { rows: out, stats };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postBatch(url, key, table, batch) {
  return fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });
}

async function sendWithRetry(url, key, table, batch, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res, err;
    try { res = await postBatch(url, key, table, batch); }
    catch (e) { err = e; }

    if (res && res.ok) return { ok: true, status: res.status };

    const status = res ? res.status : 0;
    const retryable = !res || status === 429 || status >= 500;
    const body = res ? (await res.text().catch(() => '')).slice(0, 400) : String(err && err.message);

    if (attempt === 1 && retryable) {
      const wait = Number(res?.headers?.get('retry-after')) * 1000 || 2000;
      console.error(`  ${label}: ${status || 'network error'} — retrying in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    return { ok: false, status, body };
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const USAGE = `usage: node scripts/supabase/load.mjs --table <${Object.keys(TABLES).join('|')}> --csv <file> [--run-id ID] [--dry-run] [--batch 500]`;

function parseArgs(argv) {
  const a = { batch: 500, dryRun: false, runId: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--table') a.table = argv[++i];
    else if (k === '--csv') a.csv = argv[++i];
    else if (k === '--run-id') a.runId = argv[++i];
    else if (k === '--batch') a.batch = Number(argv[++i]);
    else if (k === '-h' || k === '--help') a.help = true;
    else die(`unknown argument: ${k}\n${USAGE}`);
  }
  return a;
}

function die(msg) { console.error(msg); process.exit(1); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }
  if (!args.table || !args.csv) die(USAGE);

  const spec = TABLES[args.table];
  if (!spec) die(`unknown table: ${args.table}\n${USAGE}`);
  if (!Number.isFinite(args.batch) || args.batch < 1) die('--batch must be a positive integer');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!args.dryRun && (!url || !key)) {
    die('missing env: set SUPABASE_URL and SUPABASE_SERVICE_KEY (or pass --dry-run).\n' +
        '  export SUPABASE_URL=https://<project-ref>.supabase.co\n' +
        '  export SUPABASE_SERVICE_KEY=<service_role key>');
  }

  const warnings = [];
  const { header, records } = readCsv(args.csv);
  const { rows, stats } = buildRows(spec, records, { runId: args.runId }, warnings);

  console.log(`table       ${args.table}`);
  console.log(`csv         ${args.csv}`);
  console.log(`columns     ${header.join(',') || '(none)'}`);
  console.log(`run_id      ${args.runId ?? '(none)'}`);
  console.log(`rows read   ${stats.read}`);
  console.log(`  skipped   ${stats.skipped} (missing ${spec.required.join('/')})`);
  console.log(`  dup keys  ${stats.duplicates} (collapsed, last wins)`);
  console.log(`rows to load ${stats.loaded}`);

  const batches = [];
  for (let i = 0; i < rows.length; i += args.batch) batches.push(rows.slice(i, i + args.batch));
  console.log(`batches     ${batches.length} x up to ${args.batch}`);

  if (warnings.length) {
    console.log(`warnings    ${warnings.length}`);
    for (const w of warnings.slice(0, 20)) console.log(`  - ${w}`);
    if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} more`);
  }

  if (args.dryRun) {
    console.log('\n--dry-run: nothing sent. First batch payload:');
    console.log(JSON.stringify(batches[0] ?? [], null, 2));
    console.log(`\nDRY RUN — ${args.table}: ${stats.loaded} rows in ${batches.length} batch(es) would be upserted on ${spec.keyColumn}.`);
    return;
  }

  let sent = 0, failed = 0;
  for (let i = 0; i < batches.length; i++) {
    const label = `batch ${i + 1}/${batches.length} (${batches[i].length} rows)`;
    const r = await sendWithRetry(url, key, args.table, batches[i], label);
    if (r.ok) { sent += batches[i].length; console.log(`  ${label}: ok ${r.status}`); }
    else { failed += batches[i].length; console.error(`  ${label}: FAILED ${r.status} ${r.body}`); }
  }

  console.log(`\n${args.table}: upserted ${sent} rows, ${failed} failed, ${stats.skipped} skipped, ${stats.duplicates} duplicate keys collapsed.`);
  if (failed) process.exit(1);
}

main().catch(e => die(e.stack || String(e)));
