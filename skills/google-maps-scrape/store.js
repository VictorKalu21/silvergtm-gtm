#!/usr/bin/env node
/*
 * store.js :: the cross-run Supabase store (approved 2026-09-20, Atlas Growth AU run; IMPROVEMENTS "store.js").
 *
 * WHAT IT IS. A thin PostgREST client over the seven tables in store/schema.sql (runs, places, site_text,
 * email_verdicts, registry_matches, contacts, ledger) so that a second run of the same country is a QUERY,
 * not a re-buy. No dependencies: Node 22's global fetch. Keys come from the skill's gitignored .env
 * (SUPABASE_URL, SUPABASE_SERVICE_KEY) or the process environment; with either missing, open() returns
 * null and every caller falls back to today's file behaviour. Nothing here ever throws on a store
 * failure: a 4xx/5xx or a network error prints ONE warning and returns null, and the run continues.
 *
 * HOW IT IS USED (kept deliberately simple — operator, 2026-09-20: "keep it simple"):
 *   - store-sync.js is the CLI the pipeline calls between steps (push shard CSVs into `places`, push
 *     site_text.jsonl, push verify results, record ledger rows; pull cached site text / verdicts / prior
 *     places for the next run). Engine scripts are NOT modified; reuse happens by seeding their inputs
 *     from a pull. That is one module + one CLI instead of six engine edits, and every existing test
 *     passes unchanged.
 *   - Schema DDL is applied once by the operator in the Supabase SQL editor (PostgREST cannot run DDL).
 *     Until then, writes return null with a PGRST205 warning and files remain the source of truth.
 *
 * API:
 *   const store = require('./store.js').open({ envPath?, quiet? })   // null when keys are absent
 *   await store.run(runId, client, country, configObj)                 // upsert a `runs` row
 *   await store.finishRun(runId)
 *   await store.upsertPlaces(leadRows, runId, country)                 // leads_clean.csv rows; first_seen_run preserved
 *   await store.upsertSiteText(records, source)                        // fetch-sites site_text.jsonl records
 *   await store.upsertVerdicts(rows)                                   // verify runner *_all.csv rows (Email, verify_verdict, verify_detail, mv_result?, bb_result?)
 *   await store.upsertRegistry(rows)                                   // registry_matches rows
 *   await store.upsertContacts(rows, runId)                            // contacts_final.jsonl rows
 *   await store.ledger(runId, service, credits, note)
 *   await store.pullSiteText(rootDomains, maxAgeDays=180)              // rows younger than maxAge
 *   await store.pullVerdicts(emails, maxAgeDays=90)
 *   await store.pullPlaces(country)                                    // place_id, root_domain, phone_number, first_seen_run
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

let sharedRootDomain = null;
try { sharedRootDomain = require('./shared-hosts.js').rootDomain; } catch { sharedRootDomain = null; }
function rootDomain(website) {
  if (!website) return '';
  if (sharedRootDomain) { try { const r = sharedRootDomain(website); if (r) return String(r).toLowerCase(); } catch { /* fall through */ } }
  let h = String(website).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  const parts = h.split('.');
  if (parts.length > 2 && /^(com|net|org|edu|gov|co|asn|id)\.[a-z]{2}$/.test(parts.slice(-2).join('.'))) return parts.slice(-3).join('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : h;
}

const CHUNK = 500;
const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = v => (v === null || v === undefined) ? null : String(v);
const bool = v => (v === '' || v === null || v === undefined) ? null : (v === true || v === 'true' || v === '1');

class Store {
  constructor(url, key, opts = {}) {
    this.url = url.replace(/\/+$/, '');
    this.key = key;
    this.quiet = !!opts.quiet;
    this.fetch = opts.fetchImpl || globalThis.fetch;
    this.warned = 0;
  }
  warn(msg) { this.warned++; if (!this.quiet) console.error('[store] WARN ' + msg); }

  async req(method, pathq, body, extraHeaders = {}) {
    const headers = { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders };
    let res, text;
    try {
      res = await this.fetch(this.url + '/rest/v1/' + pathq, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      text = await res.text();
    } catch (e) { this.warn(`${method} ${pathq.split('?')[0]}: network error ${e.message}`); return null; }
    if (!res.ok) { this.warn(`${method} ${pathq.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ')}`); return null; }
    if (!text) return [];
    try { return JSON.parse(text); } catch { return []; }
  }

  // Upsert rows in chunks. Every row in a chunk must carry the same keys (PostgREST bulk-insert rule),
  // so callers group rows by key set before calling. Returns the number of rows sent, or null on the
  // first failure (the remaining chunks are not attempted).
  async upsert(table, rows, onConflict) {
    if (!rows || !rows.length) return 0;
    let sent = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const r = await this.req('POST', `${table}?on_conflict=${encodeURIComponent(onConflict)}`, chunk, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (r === null) return null;
      sent += chunk.length;
    }
    return sent;
  }

  async select(table, query) { return this.req('GET', `${table}?${query}`); }

  // ---- runs / ledger ------------------------------------------------------------------------------
  async run(runId, client, country, config) {
    return this.upsert('runs', [{ run_id: runId, client, country: String(country || '').toLowerCase(), config: config || {} }], 'run_id');
  }
  async finishRun(runId) {
    return this.req('PATCH', `runs?run_id=eq.${encodeURIComponent(runId)}`, { finished_at: new Date().toISOString() }, { Prefer: 'return=minimal' });
  }
  async ledger(runId, service, credits, note) {
    const r = await this.req('POST', 'ledger', [{ run_id: runId, service, credits: Math.round(Number(credits) || 0), note: note || null }], { Prefer: 'return=minimal' });
    return r === null ? null : 1;
  }

  // ---- places ------------------------------------------------------------------------------------
  static placeRow(lead, runId, country) {
    const types = String(lead.google_types || '').split('|').map(s => s.trim()).filter(Boolean);
    const city = str(lead.city) || null;
    const m = (city || '').match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/) || (city || '').match(/,\s*([A-Z]{2})\b/);
    return {
      place_id: lead.place_id, business_id: str(lead.business_id) || null, name: lead.name || '',
      country: String(country || '').toLowerCase(), lat: num(lead.latitude), lng: num(lead.longitude),
      full_address: str(lead.full_address) || null, city, region: m ? m[1] : null,
      website: str(lead.website) || null, root_domain: rootDomain(lead.website) || null,
      google_types: types, review_count: num(lead.review_count), rating: num(lead.rating),
      last_seen_run: runId, raw: { icp_type: lead.icp_type || null, is_claimed: bool(lead.is_claimed), verified: bool(lead.verified), phone_number: str(lead.phone_number) || null, place_link: str(lead.place_link) || null },
    };
  }
  // first_seen_run is preserved: rows already in `places` are upserted WITHOUT that column, new rows with it.
  async upsertPlaces(leads, runId, country) {
    const rows = leads.filter(l => l && l.place_id).map(l => Store.placeRow(l, runId, country));
    if (!rows.length) return 0;
    const existing = new Set();
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map(r => r.place_id);
      const got = await this.select('places', `select=place_id&place_id=in.(${ids.map(id => '"' + id.replace(/"/g, '') + '"').join(',')})`);
      if (got === null) return null;
      for (const g of got) existing.add(g.place_id);
    }
    const fresh = rows.filter(r => !existing.has(r.place_id)).map(r => ({ ...r, first_seen_run: runId }));
    const seen = rows.filter(r => existing.has(r.place_id));
    const a = await this.upsert('places', fresh, 'place_id'); if (a === null) return null;
    const b = await this.upsert('places', seen, 'place_id'); if (b === null) return null;
    return { inserted: a, updated: b };
  }
  async pullPlaces(country) {
    const out = []; let from = 0; const page = 1000;
    for (;;) {
      const got = await this.req('GET', `places?select=place_id,root_domain,name,city,first_seen_run,last_seen_run,raw&country=eq.${encodeURIComponent(String(country).toLowerCase())}&order=place_id&limit=${page}&offset=${from}`);
      if (got === null) return null;
      out.push(...got);
      if (got.length < page) break;
      from += page;
    }
    return out.map(p => ({ place_id: p.place_id, root_domain: p.root_domain || '', name: p.name, city: p.city, phone_number: (p.raw && p.raw.phone_number) || '', first_seen_run: p.first_seen_run, last_seen_run: p.last_seen_run }));
  }

  // ---- site_text ---------------------------------------------------------------------------------
  static siteTextRow(rec, source) {
    const rd = rec.root_domain || rootDomain(rec.website);
    if (!rd) return null;
    return {
      root_domain: rd, fetched_at: rec.fetched_at || new Date().toISOString(), status: String(rec.status || 'unknown'),
      source: rec.source || source || 'plain', pages: Array.isArray(rec.pages) ? rec.pages : [], text: rec.text || null,
      emails: Array.isArray(rec.emails) ? rec.emails : [], emails_by_source: rec.emails_by_source && typeof rec.emails_by_source === 'object' ? rec.emails_by_source : {},
    };
  }
  async upsertSiteText(records, source) {
    const byDomain = new Map();
    for (const rec of records) { const row = Store.siteTextRow(rec, source); if (!row) continue; const prev = byDomain.get(row.root_domain); if (!prev || (prev.status !== 'ok' && row.status === 'ok')) byDomain.set(row.root_domain, row); }
    return this.upsert('site_text', [...byDomain.values()], 'root_domain');
  }
  async pullSiteText(rootDomains, maxAgeDays = 180) {
    const since = new Date(Date.now() - maxAgeDays * 86400e3).toISOString();
    const out = [];
    const doms = [...new Set(rootDomains.filter(Boolean).map(d => String(d).toLowerCase()))];
    for (let i = 0; i < doms.length; i += 100) {
      const got = await this.req('GET', `site_text?select=*&fetched_at=gte.${encodeURIComponent(since)}&root_domain=in.(${doms.slice(i, i + 100).map(d => '"' + d + '"').join(',')})`);
      if (got === null) return null;
      out.push(...got);
    }
    return out;
  }

  // ---- email_verdicts ----------------------------------------------------------------------------
  static verdictRow(r) {
    const email = String(r.Email || r.email || '').trim().toLowerCase();
    if (!email) return null;
    return { email, mv_result: str(r.mv_result) || null, bb_result: str(r.bb_result) || null, verdict: String(r.verify_verdict || r.verdict || 'unverified'), detail: str(r.verify_detail || r.detail) || null, verified_at: r.verified_at || new Date().toISOString() };
  }
  async upsertVerdicts(rows) {
    const m = new Map();
    for (const r of rows) { const row = Store.verdictRow(r); if (row && row.verdict !== 'unverified') m.set(row.email, row); }
    return this.upsert('email_verdicts', [...m.values()], 'email');
  }
  async pullVerdicts(emails, maxAgeDays = 90) {
    const since = new Date(Date.now() - maxAgeDays * 86400e3).toISOString();
    const out = [];
    const es = [...new Set(emails.filter(Boolean).map(e => String(e).trim().toLowerCase()))];
    for (let i = 0; i < es.length; i += 100) {
      const got = await this.req('GET', `email_verdicts?select=*&verified_at=gte.${encodeURIComponent(since)}&email=in.(${es.slice(i, i + 100).map(e => '"' + e + '"').join(',')})`);
      if (got === null) return null;
      out.push(...got);
    }
    return out;
  }

  // ---- registry_matches / contacts ---------------------------------------------------------------
  async upsertRegistry(rows) {
    const clean = rows.filter(r => r && r.place_id && r.registry && r.match_key).map(r => ({ place_id: r.place_id, registry: r.registry, match_key: String(r.match_key), basis: r.basis || null, confidence: r.confidence || null, officers: Array.isArray(r.officers) ? r.officers : [] }));
    return this.upsert('registry_matches', clean, 'place_id,registry,match_key');
  }
  async upsertContacts(rows, runId) {
    const clean = rows.filter(r => r && r.place_id && r.name).map(r => ({ place_id: r.place_id, name: r.name, first_name: r.first_name || null, title: r.title || null, role_bucket: r.role_bucket || 'other', source: r.source || 'model_read', evidence: r.evidence || null, confidence: r.confidence || null, run_id: runId }));
    return this.upsert('contacts', clean, 'place_id,name,run_id');
  }
}

function open(opts = {}) {
  const envPath = opts.envPath || path.join(__dirname, '.env');
  const env = { ...loadEnv(envPath), ...process.env };
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return new Store(url, key, opts);
}

module.exports = { open, Store, loadEnv, rootDomain };
