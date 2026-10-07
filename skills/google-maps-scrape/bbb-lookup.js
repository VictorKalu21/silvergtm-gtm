#!/usr/bin/env node
/*
 * bbb-lookup.js :: BBB (bbb.org) rung for owner-finding — match each lead to its BBB profile.
 *
 * What is free and keyless (probed 2026-10-07, output in IMPROVEMENTS.md):
 *   GET https://www.bbb.org/api/search?find_text=<name>&find_loc=<City, ST>&page=1  → JSON
 *   results[] = { businessName, address, city, state, postalcode, phone[], categories[{name}],
 *                 rating ("A+"), bbbMember (accredited), outOfBusinessStatus, reportUrl, businessId, bbbId }
 *   It contains NO people. (`find_text`/`find_loc` are the parameters; `input`/`location` return 0.)
 * What is NOT free: the profile page (reportUrl) — where "Business Management" / "Principal Contacts"
 *   list the owner by name and title — sits behind Cloudflare ("Just a moment…", 403 to a plain fetch
 *   with full browser headers). That is the Tier-3 case: --profiles sends the MATCHED rows' profile
 *   URLs to Firecrawl (FIRECRAWL_KEY in the skill .env, paid per page, opt-in) and parses the
 *   markdown for principals.
 *
 * Usage:
 *   node bbb-lookup.js --leads <leads.csv> --out <dir> [--concurrency 3] [--delay 400] [--limit N] [--resume]
 *                      [--profiles] [--firecrawl-rpm 10]
 * Reads: place_id, name, city ("Phoenix, AZ"), phone_number (optional, strongest match key), zip.
 * Writes: <dir>/bbb.jsonl — one record per lead:
 *   { place_id, name, status: matched|low_confidence|miss|blocked|error, match_basis, bbb:{...},
 *     principals:[{name,title,source}] (only with --profiles), profile_status }
 * Match rule (deterministic, no model): phone match (last 10 digits) = matched; else name-token
 * overlap ≥ 0.6 AND city match = matched; overlap ≥ 0.6 without city, or city + overlap ≥ 0.4
 * = low_confidence (a CANDIDATE for the owner read, exactly like a Companies House town-only
 * match); anything less = miss. Keep bulk calls ≤ 4 in parallel through the egress relay.
 */
const fs = require('fs');
const path = require('path');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function loadEnv(file) { const out = {}; if (!fs.existsSync(file)) return out; for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return out; }
function parseCsv(txt) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

// ---- matching -----------------------------------------------------------------------------------
const STOP = new Set(['llc', 'inc', 'co', 'corp', 'company', 'ltd', 'the', 'and', 'of', 'a', 'an', 'services', 'service', 'group', 'enterprises', 'solutions']);
const normName = s => String(s || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t));
const digits10 = s => String(s || '').replace(/\D/g, '').slice(-10);
const cityOf = s => String(s || '').split(',')[0].trim().toLowerCase();
function tokenOverlap(a, b) { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0; let n = 0; for (const t of A) if (B.has(t)) n++; return n / Math.min(A.size, B.size); }

// lead: {name, city, phone_number}; results: bbb search results[] → { status, match_basis, bbb } | null
function pickMatch(lead, results) {
  const lp = digits10(lead.phone_number), ln = normName(lead.name), lc = cityOf(lead.city);
  let best = null;
  for (const r of results || []) {
    const phones = (Array.isArray(r.phone) ? r.phone : [r.phone]).map(digits10).filter(p => p.length === 10);
    const ov = tokenOverlap(ln, normName(r.businessName));
    const cityOk = lc && String(r.city || '').toLowerCase() === lc;
    let status = null, basis = null;
    if (lp.length === 10 && phones.includes(lp)) { status = 'matched'; basis = 'phone'; }
    else if (ov >= 0.6 && cityOk) { status = 'matched'; basis = 'name+city'; }
    else if (ov >= 0.6) { status = 'low_confidence'; basis = 'name_only'; }
    else if (ov >= 0.4 && cityOk) { status = 'low_confidence'; basis = 'city+partial_name'; }
    if (!status) continue;
    const score = (basis === 'phone' ? 10 : 0) + ov + (cityOk ? 0.5 : 0);
    if (!best || score > best.score) best = { status, match_basis: basis, score, bbb: slim(r) };
  }
  if (!best) return null;
  delete best.score; return best;
}
function slim(r) {
  return {
    businessName: String(r.businessName || '').replace(/<[^>]+>/g, ''), address: r.address || '', city: r.city || '', state: r.state || '', postalcode: r.postalcode || '',
    phone: (Array.isArray(r.phone) ? r.phone : [r.phone]).filter(Boolean), categories: (r.categories || []).map(c => c.name || c).filter(Boolean),
    rating: r.rating || '', accredited: !!r.bbbMember, out_of_business: r.outOfBusinessStatus || null,
    profile_url: r.reportUrl ? 'https://www.bbb.org' + r.reportUrl : '', business_id: r.businessId || '', bbb_id: r.bbbId || '',
  };
}

// ---- principals from a Firecrawl markdown render of the profile page --------------------------
// Shape this parses (BBB profile "Business Management" / "Principal Contacts" / "Customer Contact"
// blocks render as one "Name, Title" per line, honorific optional). NOTE: the parser's fixture is
// synthetic until the first --profiles run pastes three real renders into IMPROVEMENTS.md — treat
// its output as a CANDIDATE for the owner read until then.
const HEAD_RE = /^(?:#+\s*)?(business management|principal contacts?|customer contacts?|additional contact information)\s*:?\s*$/i;
const PERSON_RE = /^(?:[-*•]\s*)?(?:(Mr|Mrs|Ms|Miss|Dr|Mx)\.?\s+)?([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}),\s*([A-Za-z][A-Za-z /&\-]{1,60})\s*$/;
function parsePrincipals(markdown) {
  const out = []; let section = null;
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(HEAD_RE); if (h) { section = h[1].toLowerCase(); continue; }
    if (!section) continue;
    if (/^#+\s/.test(line)) { section = null; continue; }
    const m = line.match(PERSON_RE);
    if (m) out.push({ name: m[2].replace(/\s+/g, ' '), title: m[3].trim(), source: section.startsWith('principal') ? 'principal_contacts' : section.startsWith('business') ? 'business_management' : 'customer_contact' });
  }
  const seen = new Set();
  return out.filter(p => { const k = p.name.toLowerCase() + '|' + p.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { pickMatch, normName, tokenOverlap, parsePrincipals, slim, digits10 };
if (require.main !== module) return;

const LEADS = arg('leads'), OUT = arg('out'), CONC = Math.min(4, parseInt(arg('concurrency', '3'), 10)), DELAY = parseInt(arg('delay', '400'), 10);
const LIMIT = parseInt(arg('limit', '0'), 10), RESUME = process.argv.includes('--resume'), PROFILES = process.argv.includes('--profiles');
const ENVPATH = arg('env', path.join(__dirname, '.env'));
if (!LEADS || !OUT) { console.error('ERROR: --leads and --out required'); process.exit(1); }
const ENV = loadEnv(ENVPATH);
const FIRECRAWL_KEY = process.env.FIRECRAWL_KEY || ENV.FIRECRAWL_KEY || '';
const FIRECRAWL_BASE = (ENV.FIRECRAWL_BASE || 'https://api.firecrawl.dev').replace(/\/+$/, '');
const FC_GAP_MS = Math.round(60000 / parseInt(arg('firecrawl-rpm', '10'), 10));
if (PROFILES && !FIRECRAWL_KEY) { console.error('ERROR: --profiles needs FIRECRAWL_KEY (skill .env) — the profile page is Cloudflare-walled'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const OUTFILE = path.join(OUT, 'bbb.jsonl');
const done = new Map();
if (RESUME && fs.existsSync(OUTFILE)) for (const l of fs.readFileSync(OUTFILE, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (o.place_id && o.status !== 'error' && o.status !== 'blocked') done.set(o.place_id, o); } catch { } }

async function getJson(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: ctrl.signal });
    const txt = await r.text();
    if (r.status !== 200) return { status: r.status, body: null };
    try { return { status: 200, body: JSON.parse(txt) }; } catch { return { status: 200, body: null, err: 'non-json' }; }
  } catch (e) { return { status: 0, err: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(t); }
}
async function bbbSearch(name, loc) {
  const u = `https://www.bbb.org/api/search?find_text=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(loc)}&page=1`;
  return getJson(u);
}
async function firecrawlMarkdown(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(FIRECRAWL_BASE + '/v1/scrape', { method: 'POST', signal: ctrl.signal, headers: { 'Authorization': 'Bearer ' + FIRECRAWL_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown'] }) });
    const body = await r.json().catch(() => ({}));
    const md = body && body.data && body.data.markdown ? body.data.markdown : (body.markdown || '');
    return { status: r.status, markdown: md, err: body && body.error };
  } catch (e) { return { status: 0, markdown: '', err: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(t); }
}

async function processLead(lead) {
  const rec = { place_id: lead.place_id, name: lead.name, city: lead.city, status: 'miss', match_basis: null, bbb: null, at: new Date().toISOString() };
  const loc = lead.city || [lead.zip].filter(Boolean).join(' ');
  const r = await bbbSearch(lead.name, loc);
  if (r.status === 403 || r.status === 429 || r.status === 503) { rec.status = 'blocked'; rec.http = r.status; return rec; }
  if (r.status !== 200 || !r.body) { rec.status = 'error'; rec.http = r.status; rec.err = r.err; return rec; }
  rec.total_results = r.body.totalResults;
  const m = pickMatch(lead, r.body.results);
  if (m) Object.assign(rec, m);
  return rec;
}

(async () => {
  const rows = parseCsv(fs.readFileSync(LEADS, 'utf8'));
  const H = rows.shift();
  let leads = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i]]))).filter(l => l.place_id && l.name);
  if (LIMIT > 0) leads = leads.slice(0, LIMIT);
  const todo = leads.filter(l => !done.has(l.place_id));
  const fd = fs.openSync(OUTFILE, RESUME ? 'a' : 'w');
  const stats = { leads: leads.length, skipped_done: leads.length - todo.length, matched: 0, low_confidence: 0, miss: 0, error: 0, blocked: 0, principals: 0, profiles_attempted: 0 };
  let i = 0, blocked = false, lastFc = 0;
  const recs = [];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < todo.length && !blocked) {
      const lead = todo[i++];
      const rec = await processLead(lead);
      if (rec.status === 'blocked') { blocked = true; process.stderr.write(`BLOCKED ${rec.http} at ${lead.name} — stopping; --resume later\n`); }
      if (PROFILES && rec.status === 'matched' && rec.bbb && rec.bbb.profile_url) {
        const wait = lastFc + FC_GAP_MS - Date.now(); if (wait > 0) await sleep(wait); lastFc = Date.now();
        stats.profiles_attempted++;
        const p = await firecrawlMarkdown(rec.bbb.profile_url);
        rec.profile_status = p.status === 200 && p.markdown ? 'ok' : (p.status || p.err);
        rec.principals = p.markdown ? parsePrincipals(p.markdown) : [];
        if (rec.principals.length) stats.principals++;
        if (p.markdown && !rec.principals.length) rec.profile_sample = p.markdown.slice(0, 1500);   // paste into IMPROVEMENTS when the parser misses: that is the real shape
      }
      stats[rec.status] = (stats[rec.status] || 0) + 1;
      recs.push(rec);
      fs.writeSync(fd, JSON.stringify(rec) + '\n');
      process.stderr.write(`. ${recs.length}/${todo.length} ${rec.status}${rec.match_basis ? ':' + rec.match_basis : ''} ${lead.name}\n`);
      await sleep(DELAY);
    }
  }));
  fs.closeSync(fd);
  stats.out = OUTFILE;
  console.log(JSON.stringify(stats));
  process.exit(blocked ? 3 : 0);
})();
