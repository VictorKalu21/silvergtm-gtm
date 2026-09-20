#!/usr/bin/env node
/*
 * store-sync.js :: the pipeline's hand to the Supabase store (see store.js). Every sub-command is a
 * no-op with exit 0 and one line on stderr when the keys are absent, so PIPELINE.md can call it
 * unconditionally. Exit 2 = the store answered but refused (schema not applied, bad key); files stay
 * the source of truth and the caller decides whether that matters.
 *
 *   node store-sync.js run        --run-id <id> --client <c> --country <cc> [--config <json>]
 *   node store-sync.js finish     --run-id <id>
 *   node store-sync.js places     --in <leads_clean.csv>[,<more.csv>] --run-id <id> --country <cc>
 *   node store-sync.js site-text  --in <site_text.jsonl> [--source plain|retry|firecrawl|scrapling]
 *   node store-sync.js verdicts   --in <verify *_all.csv | emails_final.csv>
 *   node store-sync.js registry   --in <registry_*.jsonl>[,...]
 *   node store-sync.js contacts   --in <contacts_final.jsonl> --run-id <id>
 *   node store-sync.js ledger     --run-id <id> --service <s> --credits <n> [--note <text>]
 *   node store-sync.js pull-site-text --domains <leads_domains.csv> --out <cached.jsonl> [--max-age-days 180]
 *   node store-sync.js pull-verdicts  --emails <verify_input.csv> --out <cached.csv> [--max-age-days 90]
 *   node store-sync.js pull-places    --country <cc> --out <prior_places.csv>
 *
 * CSV in: the engine's own files (header row, RFC quoting). JSONL in: one record per line.
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./store.js');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const CMD = process.argv[2];

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function readCsvs(spec) { return spec.split(',').flatMap(f => parseCsv(fs.readFileSync(f.trim(), 'utf8'))); }
function readJsonl(spec) { return spec.split(',').flatMap(f => fs.readFileSync(f.trim(), 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l))); }
function done(label, r) {
  if (r === null) { console.error(`[store-sync] ${label}: store refused (see WARN above); files remain the source of truth`); process.exit(2); }
  console.log(`[store-sync] ${label}: ${typeof r === 'object' ? JSON.stringify(r) : r}`);
}

(async () => {
  const store = open({ envPath: arg('env') });
  if (!store) { console.error('[store-sync] no SUPABASE_URL / SUPABASE_SERVICE_KEY — skipped (file behaviour)'); process.exit(0); }
  switch (CMD) {
    case 'run': {
      const cfg = arg('config') ? JSON.parse(fs.readFileSync(arg('config'), 'utf8').replace(/^﻿/, '')) : {};
      return done('run', await store.run(arg('run-id'), arg('client'), arg('country'), cfg));
    }
    case 'finish': return done('finish', await store.finishRun(arg('run-id')));
    case 'places': {
      const leads = readCsvs(arg('in'));
      const uniq = new Map(); for (const l of leads) if (l.place_id) uniq.set(l.place_id, l);
      return done(`places (${uniq.size} unique of ${leads.length} rows)`, await store.upsertPlaces([...uniq.values()], arg('run-id'), arg('country')));
    }
    case 'site-text': return done('site-text', await store.upsertSiteText(readJsonl(arg('in')), arg('source', 'plain')));
    case 'verdicts': return done('verdicts', await store.upsertVerdicts(readCsvs(arg('in'))));
    case 'registry': return done('registry', await store.upsertRegistry(readJsonl(arg('in'))));
    case 'contacts': return done('contacts', await store.upsertContacts(readJsonl(arg('in')), arg('run-id')));
    case 'ledger': return done('ledger', await store.ledger(arg('run-id'), arg('service'), arg('credits'), arg('note')));
    case 'pull-site-text': {
      const rows = readCsvs(arg('domains'));
      const doms = rows.map(r => r.root_domain || require('./store.js').rootDomain(r.website)).filter(Boolean);
      const got = await store.pullSiteText(doms, Number(arg('max-age-days', '180')));
      if (got === null) return done('pull-site-text', null);
      fs.writeFileSync(arg('out'), got.map(r => JSON.stringify(r)).join('\n') + (got.length ? '\n' : ''));
      return done(`pull-site-text (${doms.length} domains asked)`, got.length + ' cached rows -> ' + arg('out'));
    }
    case 'pull-verdicts': {
      const rows = readCsvs(arg('emails'));
      const emails = rows.map(r => r.Email || r.email).filter(Boolean);
      const got = await store.pullVerdicts(emails, Number(arg('max-age-days', '90')));
      if (got === null) return done('pull-verdicts', null);
      const H = ['email', 'mv_result', 'bb_result', 'verdict', 'detail', 'verified_at'];
      fs.writeFileSync(arg('out'), [H.join(',')].concat(got.map(g => H.map(h => esc(g[h])).join(','))).join('\n') + '\n');
      return done(`pull-verdicts (${emails.length} asked)`, got.length + ' cached verdicts -> ' + arg('out'));
    }
    case 'pull-places': {
      const got = await store.pullPlaces(arg('country'));
      if (got === null) return done('pull-places', null);
      const H = ['place_id', 'root_domain', 'name', 'city', 'phone_number', 'first_seen_run', 'last_seen_run'];
      fs.writeFileSync(arg('out'), [H.join(',')].concat(got.map(g => H.map(h => esc(g[h])).join(','))).join('\n') + '\n');
      return done('pull-places', got.length + ' rows -> ' + arg('out'));
    }
    default:
      console.error('usage: see header of ' + path.basename(__filename)); process.exit(1);
  }
})();
