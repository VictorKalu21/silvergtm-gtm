#!/usr/bin/env node
/*
 * search-owner.js :: owner-finding SERP cascade (deterministic step, no AI).
 * For each lead runs, per the ICP's owner_query config:
 *   1. BIASED  : "<name> <area> <ST> (\"owner\" OR \"general manager\" OR ...)" -> surfaces BBB / staff-dirs / reviews / LinkedIn when it ranks
 *   2. LINKEDIN: "site:linkedin.com <name> <area> <ST>"                         -> personal profiles naming owner/GM/manager (strongest source)
 *   3. BROAD   : "<name> <area> <ST>"  (only if 1 & 2 both empty)               -> generic email/phone fallback
 *   4. EMAIL   : (opt-in, --email-search) boolean mailbox searches over the lead's own site and its
 *                captured socials (SKILL STEP 6 rung 2e): `site:<host> ("info@" OR "@gmail.com" ...)`,
 *                `site:facebook.com/<page> ("@gmail.com" OR "email" ...)`. Addresses in the snippets are
 *                extracted into `emails_from_serp` — CANDIDATES for the reader + verification, never shipped raw.
 *   <ST> = region token; pulled per-lead from `city` via geo.region_from_city (e.g. US "City, ST"),
 *          with geo.region_default as fallback; empty for regionless geos (e.g. UK).
 * Emits ONE record per lead bundling all result texts PLUS the full lead identity (name, full_address,
 * zip, neighborhood, phone, website) so the downstream AI extraction can ENTITY-MATCH the person to THIS
 * business and reject same-name namesakes from other cities. Query stays lean (name+area) for recall.
 *
 * BACKENDS (owner_query.serp_backend in the config, or --backend; default scraper_tech for old runs):
 *   scraper_tech — google-search.scraper.tech (DISCONTINUED by the vendor 2026-07; kept so old run
 *                  folders still read; returns {"status":"fail"} for every query). Key SCRAPER_TECH_SEARCH_KEY.
 *   dataforseo   — POST api.dataforseo.com/v3/serp/google/organic/live/advanced, Basic auth from
 *                  DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD (skill .env or process env). One task per query,
 *                  `depth` results (default 10), localized by owner_query.serp_location_code (default from
 *                  geo.country: US 2840, GB 2826, AU 2036, CA 2124, IE 2372, NZ 2554, ZA 2710, NG 2566).
 *                  Every response carries `cost` (USD); the run sums it, writes <out>/serp_cost.json, and
 *                  STOPS (exit 3) when --max-cost is reached — the flag is REQUIRED on this backend so a
 *                  credit scope is always stated before anything is bought. Re-run with --resume + a new cap.
 *
 * Usage: node search-owner.js --leads <leads.csv> --config <config.json> --out <dir>
 *          [--backend dataforseo] [--max-cost <usd>] [--resume] [--concurrency 6] [--limit N]
 *          [--email-search] [--email-search-only] [--site <owner/site_text.jsonl>]
 * Output: <dir>/serp_text.jsonl (+ <dir>/serp_cost.json on the dataforseo backend)
 * Test hook: SEARCH_OWNER_STUB=<json file> maps query -> raw backend response (no network). Tests only.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }

const LIMIT = 10, RESULT_CAP = 10, TEXT_CAP = 5500, CALL_TIMEOUT = 25000, DELAY = 250;
const DFS_LOCATIONS = { US: 2840, GB: 2826, UK: 2826, AU: 2036, CA: 2124, IE: 2372, NZ: 2554, ZA: 2710, NG: 2566, DE: 2276, FR: 2250, ES: 2724, IT: 2380, NL: 2528 };
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_JUNK = /\.(png|jpe?g|gif|webp|svg)$|(example|sentry|wixpress|godaddy|squarespace|domain|email|yourdomain|company)\.com$|^(user|name|email|you|someone|info@example)/i;
const MAILBOX_TERMS = ['"info@"', '"contact@"', '"@gmail.com"', '"@yahoo.com"', '"@hotmail.com"', '"@outlook.com"', '"@aol.com"'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
function loadEnv(f) { const o = {}; if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
function parseCsv(t) { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else { if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c === '\r') { } else cur += c; } } if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows; }

// ---------------- pure helpers (exported, tested) ----------------
function locationCode(country, override) {
  if (override != null && override !== '') return Number(override);
  return DFS_LOCATIONS[String(country || 'US').toUpperCase()] || 2840;
}
// Normalise a DataForSEO live response to the {status, results:[{title,description,url}], cost} shape
// the cascade already consumes. Only `organic` items count as results; PAA/ads/maps packs are ignored.
function parseDataforseo(json) {
  if (!json || typeof json !== 'object') return { status: 'parse_error', results: [], cost: 0 };
  const cost = Number(json.cost || 0);
  if (json.status_code !== 20000) return { status: 'failed:' + (json.status_message || json.status_code || 'http'), results: [], cost };
  const task = Array.isArray(json.tasks) ? json.tasks[0] : null;
  if (!task) return { status: 'failed:no_task', results: [], cost };
  if (task.status_code !== 20000) return { status: 'failed:' + (task.status_message || task.status_code), results: [], cost };
  const res = Array.isArray(task.result) ? task.result[0] : null;
  const items = res && Array.isArray(res.items) ? res.items : [];
  const results = items.filter(it => it && it.type === 'organic').map(it => ({ title: it.title || '', description: it.description || it.snippet || '', url: it.url || '' }));
  return { status: 'ok', results, cost };
}
function emailsFromText(txt) {
  return [...new Set((String(txt || '').match(EMAIL_RE) || []).map(e => e.toLowerCase()))].filter(e => !EMAIL_JUNK.test(e) && !EMAIL_JUNK.test(e.split('@')[1] || ''));
}
function hostOf(u) { try { return new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u).host.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
// Boolean mailbox queries for one lead: its own site (unless it is a shared host) + each captured social page.
function buildEmailQueries(lead, socials, sharedHostTest) {
  const out = [];
  const host = hostOf(lead.website || '');
  if (host && !(sharedHostTest && sharedHostTest(host))) out.push({ surface: 'site', query: `site:${host} (${MAILBOX_TERMS.join(' OR ')})` });
  for (const net of ['facebook', 'instagram']) {
    for (const u of ((socials && socials[net]) || []).slice(0, 1)) {
      const h = hostOf(u); let p = ''; try { p = new URL(u).pathname.replace(/\/+$/, ''); } catch { }
      if (h && p && p !== '/') out.push({ surface: net, query: `site:${h}${p} (${MAILBOX_TERMS.slice(2).join(' OR ')} OR "email")` });
    }
  }
  return out;
}
function overBudget(spent, max) { return Number.isFinite(max) && spent >= max; }
function bundle(query, r) { const rs = Array.isArray(r.results) ? r.results.slice(0, RESULT_CAP) : []; return (`Search query: "${query}"\n\n` + rs.map((x, i) => `${i + 1}. ${x.title || ''}\n   ${(x.description || '').trim()}\n   ${x.url || ''}`).join('\n')).slice(0, TEXT_CAP); }
function n(r) { return Array.isArray(r.results) ? r.results.length : 0; }
function failed(r) { return r.status !== 'ok'; }

module.exports = { locationCode, parseDataforseo, emailsFromText, buildEmailQueries, overBudget, bundle, hostOf, DFS_LOCATIONS, MAILBOX_TERMS };
if (require.main !== module) return;

// ---------------- main ----------------
const LEADS = arg('leads'), CFG = arg('config'), OUT = arg('out', '.');
const ENVPATH = arg('env', path.join(__dirname, '.env'));
const CONC = parseInt(arg('concurrency', '6'), 10);
const RESUME = process.argv.includes('--resume');
const EMAIL_SEARCH = process.argv.includes('--email-search') || process.argv.includes('--email-search-only');
const EMAIL_ONLY = process.argv.includes('--email-search-only');
const SITE_FILE = arg('site', '');
const LEAD_LIMIT = Number(arg('limit', 'Infinity'));
if (!LEADS) { console.error('ERROR: --leads required'); process.exit(1); }

const ENV = loadEnv(ENVPATH);
const env = k => ENV[k] || process.env[k] || '';
const cfg = CFG && fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8').replace(/^﻿/, '')) : {};
const GEO = cfg.geo || {};
const OQ = cfg.owner_query || {};
const BACKEND = (arg('backend', OQ.serp_backend || 'scraper_tech') || '').toLowerCase();
const BIAS_TERMS = OQ.bias_terms || ['owner', 'general manager'];
const USE_LI = OQ.use_linkedin !== false;
const SERP_COUNTRY = (OQ.country || GEO.country || 'US').toUpperCase();
const REGION_RE = GEO.region_from_city ? new RegExp(GEO.region_from_city) : null;
const REGION_DEFAULT = GEO.region_default || OQ.state || '';
const biasGroup = '(' + BIAS_TERMS.map(t => '"' + t + '"').join(' OR ') + ')';
const MAX_COST = arg('max-cost') != null ? Number(arg('max-cost')) : (OQ.serp_max_cost_usd != null ? Number(OQ.serp_max_cost_usd) : Infinity);
const STUB = process.env.SEARCH_OWNER_STUB ? JSON.parse(fs.readFileSync(process.env.SEARCH_OWNER_STUB, 'utf8')) : null;

let KEY = '', DFS_AUTH = '', DFS_LOCATION = 2840, DFS_LANG = 'en', DFS_DEPTH = LIMIT, DFS_PATH = '/v3/serp/google/organic/live/advanced';
if (BACKEND === 'dataforseo') {
  const login = env('DATAFORSEO_LOGIN'), pw = env('DATAFORSEO_PASSWORD');
  if (!STUB && (!login || !pw)) { console.error('ERROR: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD not in ' + ENVPATH + ' (or the process env)'); process.exit(1); }
  if (!Number.isFinite(MAX_COST)) { console.error('ERROR: --max-cost <usd> (or owner_query.serp_max_cost_usd) is REQUIRED on the dataforseo backend — state the credit scope before anything is bought.'); process.exit(1); }
  DFS_AUTH = Buffer.from(`${login}:${pw}`).toString('base64');
  DFS_LOCATION = locationCode(SERP_COUNTRY, OQ.serp_location_code);
  DFS_LANG = OQ.serp_language_code || 'en';
  DFS_DEPTH = Number(OQ.serp_depth || LIMIT);
  if (OQ.serp_endpoint) DFS_PATH = OQ.serp_endpoint;
} else if (BACKEND === 'scraper_tech') {
  KEY = env('SCRAPER_TECH_SEARCH_KEY');
  if (!STUB && !KEY) { console.error('ERROR: SCRAPER_TECH_SEARCH_KEY not in ' + ENVPATH + ' (NOTE: this backend was discontinued by the vendor; use --backend dataforseo)'); process.exit(1); }
} else { console.error('ERROR: unknown backend "' + BACKEND + '" (scraper_tech | dataforseo)'); process.exit(1); }

let spent = 0, calls = 0;
function stubSearch(query) {
  const raw = STUB[query] || STUB['*'];
  if (raw === undefined) return { status: 'stub_miss', results: [], cost: 0 };
  return BACKEND === 'dataforseo' ? parseDataforseo(raw) : { status: raw.status, results: raw.results || [], cost: 0 };
}
function stSearch(query) {
  const qs = new URLSearchParams({ query, country: SERP_COUNTRY, limit: LIMIT, page: 0, start: 0, hl: 'en' }).toString();
  const opts = { host: 'google-search.scraper.tech', path: '/google-search?' + qs, headers: { 'scraper-key': KEY }, timeout: CALL_TIMEOUT };
  return new Promise(res => { const req = https.get(opts, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const j = JSON.parse(b); res({ status: j.status, results: j.results || [], cost: 0 }); } catch { res({ status: 'parse_error', results: [], cost: 0 }); } }); }); req.on('error', e => res({ status: 'error', results: [], err: e.message, cost: 0 })); req.on('timeout', () => { req.destroy(); res({ status: 'timeout', results: [], cost: 0 }); }); });
}
function dfsSearch(query) {
  const body = JSON.stringify([{ keyword: query, location_code: DFS_LOCATION, language_code: DFS_LANG, depth: DFS_DEPTH, device: 'desktop', os: 'windows' }]);
  const opts = { host: 'api.dataforseo.com', path: DFS_PATH, method: 'POST', headers: { 'Authorization': 'Basic ' + DFS_AUTH, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: CALL_TIMEOUT };
  return new Promise(res => { const req = https.request(opts, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(parseDataforseo(JSON.parse(b))); } catch { res({ status: 'parse_error', results: [], cost: 0 }); } }); }); req.on('error', e => res({ status: 'error', results: [], err: e.message, cost: 0 })); req.on('timeout', () => { req.destroy(); res({ status: 'timeout', results: [], cost: 0 }); }); req.write(body); req.end(); });
}
async function search(query) {
  const r = STUB ? stubSearch(query) : (BACKEND === 'dataforseo' ? await dfsSearch(query) : await stSearch(query));
  calls++; spent += Number(r.cost || 0);
  return r;
}
// one retry only on a clear network transient (NOT on quota/api fail — retrying that just burns quota)
async function searchRetry(q) { let r = await search(q); if (r.status !== 'ok' && /timeout|error|parse/i.test(r.status || '')) { await sleep(DELAY * 4); r = await search(q); } return r; }

let sharedHost = null;
try { sharedHost = require('./shared-hosts').isSharedHost; } catch { sharedHost = null; }

(async () => {
  const rows = parseCsv(fs.readFileSync(LEADS, 'utf8').replace(/^﻿/, '')).filter(r => r.length > 1);
  const H = rows.shift(); const leads = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i]])));
  const socialsById = new Map();
  if (EMAIL_SEARCH && SITE_FILE && fs.existsSync(SITE_FILE)) for (const ln of fs.readFileSync(SITE_FILE, 'utf8').split(/\r?\n/).filter(Boolean)) { try { const o = JSON.parse(ln); if (o.place_id && o.socials) socialsById.set(o.place_id, o.socials); } catch { } }
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, 'serp_text.jsonl');
  const costFile = path.join(OUT, 'serp_cost.json');
  let doneIds = new Set();
  if (RESUME && fs.existsSync(outFile)) {
    const prev = fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const keep = prev.filter(p => p.status === 'ok' || p.status === 'no_results');
    doneIds = new Set(keep.map(p => p.place_id));
    fs.writeFileSync(outFile, keep.map(p => JSON.stringify(p)).join('\n') + (keep.length ? '\n' : ''));
  } else fs.writeFileSync(outFile, '');
  if (RESUME && fs.existsSync(costFile)) { try { spent = Number(JSON.parse(fs.readFileSync(costFile, 'utf8')).spent_usd_total_before_this_run_included || 0); } catch { } }
  const spentBefore = spent;
  const targets = leads.filter(l => !doneIds.has(l.place_id)).slice(0, LEAD_LIMIT);
  let done = 0, hadName = 0, hadEmail = 0, recentFails = 0, abort = false, budgetHit = false;
  const queue = targets.slice();
  const writeCost = () => { if (BACKEND !== 'dataforseo') return; fs.writeFileSync(costFile, JSON.stringify({ backend: BACKEND, calls_this_run: calls, spent_usd_this_run: +(spent - spentBefore).toFixed(4), spent_usd_total_before_this_run_included: +spent.toFixed(4), max_cost_usd: MAX_COST, budget_hit: budgetHit, leads_done_this_run: done, leads_pending: queue.length, location_code: DFS_LOCATION, depth: DFS_DEPTH, updated: new Date().toISOString() }, null, 2)); };
  async function worker() {
    while (queue.length && !abort) {
      if (overBudget(spent, MAX_COST)) { budgetHit = true; abort = true; break; }
      const l = queue.shift();
      let st = '';
      if (REGION_RE) { const m = (l.city || '').match(REGION_RE); st = (m && (m[1] || m[0])) || ''; }
      if (!st) st = REGION_DEFAULT;
      let hood = (l.neighborhood || l.city || '').replace(/\s*\(.*?\)/, '');
      if (REGION_RE) hood = hood.replace(new RegExp(REGION_RE.source, 'i'), '');
      hood = hood.replace(/,\s*$/, '').trim();
      const base = `${l.name} ${hood} ${st}`.replace(/\s+/g, ' ').trim();
      let rb = { status: 'skipped', results: [] }, rl = { status: 'skipped', results: [] }, rbr = { status: 'not_needed', results: [] };
      if (!EMAIL_ONLY) {
        await sleep(DELAY);
        rb = await searchRetry(`${base} ${biasGroup}`);
        if (USE_LI) { await sleep(DELAY); rl = await searchRetry(`site:linkedin.com ${base}`.replace(/\s+/g, ' ').trim()); }
        if (n(rb) === 0 && n(rl) === 0) { await sleep(DELAY); rbr = await searchRetry(base); } // broad only as last resort
      }
      const emailQ = EMAIL_SEARCH ? buildEmailQueries(l, socialsById.get(l.place_id), sharedHost) : [];
      const emailRuns = [];
      for (const eq of emailQ) { await sleep(DELAY); const r = await searchRetry(eq.query); emailRuns.push({ ...eq, r }); }
      const emailText = emailRuns.map(e => bundle(e.query, e.r)).join('\n\n').slice(0, TEXT_CAP);
      const emailsFound = emailsFromText(emailRuns.map(e => (e.r.results || []).map(x => `${x.title} ${x.description} ${x.url}`).join(' ')).join(' '));
      const anyOk = n(rb) > 0 || n(rl) > 0 || n(rbr) > 0 || emailRuns.some(e => n(e.r) > 0);
      const attempted = [rb, rl, rbr, ...emailRuns.map(e => e.r)].filter(r => !/^(skipped|not_needed)$/.test(r.status));
      const allFailed = attempted.length > 0 && attempted.every(failed);
      const status = allFailed ? ('search_failed:' + (attempted[0].status || 'unknown')) : (anyOk ? 'ok' : 'no_results');
      fs.appendFileSync(outFile, JSON.stringify({
        place_id: l.place_id, business_name: l.name, icp_type: l.icp_type || '',
        full_address: l.full_address || '', zip: l.zip || '', neighborhood: l.neighborhood || '', city: l.city || '',
        phone: l.phone_number || '', website: l.website || '',
        biased_query: EMAIL_ONLY ? '' : `${base} ${biasGroup}`, biased_text: EMAIL_ONLY ? '' : bundle(`${base} ${biasGroup}`, rb),
        linkedin_text: (USE_LI && !EMAIL_ONLY) ? bundle(`site:linkedin.com ${base}`, rl) : '',
        broad_text: n(rbr) > 0 ? bundle(base, rbr) : '',
        email_queries: emailQ.map(e => e.query), email_text: emailText, emails_from_serp: emailsFound,
        results_count: n(rb) + n(rl) + n(rbr) + emailRuns.reduce((a, e) => a + n(e.r), 0), status, backend: BACKEND
      }) + '\n');
      done++; if (anyOk) hadName++; if (emailsFound.length) hadEmail++;
      if (status.startsWith('search_failed')) { if (++recentFails >= 30) abort = true; } else recentFails = 0;
      if (done % 50 === 0) { process.stderr.write(`. ${done}/${targets.length} (${hadName} with results${EMAIL_SEARCH ? ', ' + hadEmail + ' with an email' : ''}${BACKEND === 'dataforseo' ? ', $' + spent.toFixed(3) + ' of $' + MAX_COST : ''})\n`); writeCost(); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker));
  writeCost();
  const why = budgetHit ? `STOPPED: --max-cost $${MAX_COST} reached ($${spent.toFixed(4)} spent) — re-run with --resume and a new cap` : abort ? 'STOPPED early (quota/API failing — re-run with --resume)' : 'DONE';
  console.log(`\n${why}: ${done} leads this run -> ${outFile}`);
  console.log(`  with results: ${hadName} | empty: ${done - hadName}${EMAIL_SEARCH ? ` | with an email candidate: ${hadEmail}` : ''}`);
  if (BACKEND === 'dataforseo') console.log(`  calls: ${calls} | spent this run: $${(spent - spentBefore).toFixed(4)} | cap: $${MAX_COST} | ${costFile}`);
  if (budgetHit) process.exit(3);
})();
