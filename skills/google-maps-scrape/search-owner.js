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
 *                  --mode live (default): one POST per query, answer in seconds.
 *                  --mode standard: the BATCH API — up to --batch-size (100) queries per task_post, charged at post
 *                  time, then tasks_ready polling + task_get per id (minutes, not seconds; the pricing page lists it
 *                  at a third of Live). Broad fallbacks go in a second round. Posted ids are kept in
 *                  <out>/standard_state.json so an interrupted poll resumes without re-posting (--resume).
 *
 * Usage: node search-owner.js --leads <leads.csv> --config <config.json> --out <dir>
 *          [--backend dataforseo] [--mode live|standard] [--batch-size 100] [--max-cost <usd>] [--resume] [--concurrency 6] [--limit N]
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
// Rung-2e precision (measured 2026-10-11, 100-lead probe): the vendor does not strictly honour `site:`, so the raw
// snippet harvest carried spam addresses repeated across leads. An address is attributed to the lead ONLY when it
// sits on a result from the lead's own site or its own social page, or its domain IS the lead's root domain.
function emailsFromResults(results, leadHost, socialUrls) {
  const own = new Set([leadHost].filter(Boolean).map(h => h.replace(/^www\./, '').toLowerCase()));
  const socialPaths = (socialUrls || []).map(u => { try { const x = new URL(u); return (x.host.replace(/^(www|m)\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch { return ''; } }).filter(Boolean);
  const strict = new Set(), loose = new Set();
  for (const r of results || []) {
    let rh = '', rp = ''; try { const x = new URL(r.url); rh = x.host.replace(/^(www|m)\./, '').toLowerCase(); rp = (rh + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch { }
    const onOwnPage = (rh && own.has(rh)) || socialPaths.some(sp => rp.startsWith(sp));
    for (const e of emailsFromText(`${r.title || ''} ${r.description || ''} ${r.url || ''}`)) {
      loose.add(e);
      const ed = e.split('@')[1] || '';
      if (onOwnPage || own.has(ed) || [...own].some(h => ed.endsWith('.' + h))) strict.add(e);
    }
  }
  return { strict: [...strict], loose: [...loose] };
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
// DataForSEO returns its own upstream failures as task-level statuses that are worth ONE retry (measured 2026-10-11:
// 'Internal SE Server Error.' on 3 of 6 live owner queries, billed anyway); 'No Search Results.' is a real empty page, not retried.
function isTransientFailure(status) { return /timeout|error|parse|internal se server|retry|temporar|overload|too many/i.test(String(status || '')) && !/no search results/i.test(String(status || '')); }
function bundle(query, r) { const rs = Array.isArray(r.results) ? r.results.slice(0, RESULT_CAP) : []; return (`Search query: "${query}"\n\n` + rs.map((x, i) => `${i + 1}. ${x.title || ''}\n   ${(x.description || '').trim()}\n   ${x.url || ''}`).join('\n')).slice(0, TEXT_CAP); }
function n(r) { return Array.isArray(r.results) ? r.results.length : 0; }
function failed(r) { return r.status !== 'ok'; }

module.exports = { locationCode, parseDataforseo, emailsFromText, emailsFromResults, buildEmailQueries, overBudget, isTransientFailure, bundle, hostOf, DFS_LOCATIONS, MAILBOX_TERMS };
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
const BATCH_SIZE = Math.min(100, Math.max(1, parseInt(arg('batch-size', '100'), 10)));
const POLL_MS = parseInt(arg('poll-ms', '15000'), 10), POLL_MAX_MS = parseInt(arg('poll-max-ms', String(90 * 60 * 1000)), 10);
if (!LEADS) { console.error('ERROR: --leads required'); process.exit(1); }

const ENV = loadEnv(ENVPATH);
const env = k => ENV[k] || process.env[k] || '';
const cfg = CFG && fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8').replace(/^﻿/, '')) : {};
const GEO = cfg.geo || {};
const OQ = cfg.owner_query || {};
const BACKEND = (arg('backend', OQ.serp_backend || 'scraper_tech') || '').toLowerCase();
const MODE = (arg('mode', OQ.serp_mode || 'live') || 'live').toLowerCase();
const BIAS_TERMS = OQ.bias_terms || ['owner', 'general manager'];
const USE_LI = OQ.use_linkedin !== false;
const SERP_COUNTRY = (OQ.country || GEO.country || 'US').toUpperCase();
const REGION_RE = GEO.region_from_city ? new RegExp(GEO.region_from_city) : null;
const REGION_DEFAULT = GEO.region_default || OQ.state || '';
const biasGroup = '(' + BIAS_TERMS.map(t => '"' + t + '"').join(' OR ') + ')';
const MAX_COST = arg('max-cost') != null ? Number(arg('max-cost')) : (OQ.serp_max_cost_usd != null ? Number(OQ.serp_max_cost_usd) : Infinity);
const STUB = process.env.SEARCH_OWNER_STUB ? JSON.parse(fs.readFileSync(process.env.SEARCH_OWNER_STUB, 'utf8')) : null;

let KEY = '', DFS_AUTH = '', DFS_LOCATION = 2840, DFS_LANG = 'en', DFS_DEPTH = LIMIT, DFS_PATH = '/v3/serp/google/organic/live/advanced';
const DFS_POST = '/v3/serp/google/organic/task_post', DFS_READY = '/v3/serp/google/organic/tasks_ready', DFS_GET = '/v3/serp/google/organic/task_get/advanced/';
if (BACKEND === 'dataforseo') {
  const login = env('DATAFORSEO_LOGIN'), pw = env('DATAFORSEO_PASSWORD');
  if (!STUB && (!login || !pw)) { console.error('ERROR: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD not in ' + ENVPATH + ' (or the process env)'); process.exit(1); }
  if (!Number.isFinite(MAX_COST)) { console.error('ERROR: --max-cost <usd> (or owner_query.serp_max_cost_usd) is REQUIRED on the dataforseo backend — state the credit scope before anything is bought.'); process.exit(1); }
  if (MODE !== 'live' && MODE !== 'standard') { console.error('ERROR: --mode must be live | standard'); process.exit(1); }
  DFS_AUTH = Buffer.from(`${login}:${pw}`).toString('base64');
  DFS_LOCATION = locationCode(SERP_COUNTRY, OQ.serp_location_code);
  DFS_LANG = OQ.serp_language_code || 'en';
  DFS_DEPTH = Number(OQ.serp_depth || LIMIT);
  if (OQ.serp_endpoint) DFS_PATH = OQ.serp_endpoint;
} else if (BACKEND === 'scraper_tech') {
  KEY = env('SCRAPER_TECH_SEARCH_KEY');
  if (!STUB && !KEY) { console.error('ERROR: SCRAPER_TECH_SEARCH_KEY not in ' + ENVPATH + ' (NOTE: this backend was discontinued by the vendor; use --backend dataforseo)'); process.exit(1); }
} else { console.error('ERROR: unknown backend "' + BACKEND + '" (scraper_tech | dataforseo)'); process.exit(1); }

let spent = 0, calls = 0, batchesPosted = 0, reposted = 0;
function dfsRequest(method, p, bodyObj) {
  const body = bodyObj == null ? '' : JSON.stringify(bodyObj);
  const opts = { host: 'api.dataforseo.com', path: p, method, headers: { 'Authorization': 'Basic ' + DFS_AUTH, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: CALL_TIMEOUT };
  return new Promise(res => { const req = https.request(opts, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch { res({ status_code: 0, status_message: 'parse_error' }); } }); }); req.on('error', e => res({ status_code: 0, status_message: 'error:' + e.message })); req.on('timeout', () => { req.destroy(); res({ status_code: 0, status_message: 'timeout' }); }); if (body) req.write(body); req.end(); });
}
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
const taskBody = q => ({ keyword: q, location_code: DFS_LOCATION, language_code: DFS_LANG, depth: DFS_DEPTH, device: 'desktop', os: 'windows' });
async function dfsLive(query) { const j = await dfsRequest('POST', DFS_PATH, [taskBody(query)]); return parseDataforseo(j); }
async function searchLive(query) {
  const r = STUB ? stubSearch(query) : (BACKEND === 'dataforseo' ? await dfsLive(query) : await stSearch(query));
  calls++; spent += Number(r.cost || 0);
  return r;
}
// one retry only on a clear network transient (NOT on quota/api fail — retrying that just burns quota)
async function searchRetry(q) { let r = await searchLive(q); if (r.status !== 'ok' && isTransientFailure(r.status)) { await sleep(DELAY * 4); r = await searchLive(q); } return r; }

// ---- executors: run a list of queries, return Map(query -> normalised response) ----
async function runLive(queries, stopFn) {
  const out = new Map(); const q = queries.slice();
  async function w() { while (q.length) { if (stopFn()) return; const x = q.shift(); await sleep(DELAY); out.set(x, await searchRetry(x)); } }
  await Promise.all(Array.from({ length: Math.min(CONC, q.length) }, w));
  return out;
}
// standard (batch) mode: task_post in chunks (charged here), then poll tasks_ready / task_get until every id is back.
async function runStandard(queries, stopFn, stateFile) {
  const out = new Map();
  const state = (RESUME && fs.existsSync(stateFile)) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { posted: {} }; // query -> {id, cost, got}
  const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  const toPost = queries.filter(x => !state.posted[x]);
  for (let i = 0; i < toPost.length; i += BATCH_SIZE) {
    if (stopFn()) break;
    const chunk = toPost.slice(i, i + BATCH_SIZE);
    if (STUB) { for (const x of chunk) { const r = stubSearch(x); state.posted[x] = { id: 'stub-' + Math.random().toString(36).slice(2), cost: r.cost || 0, stub: true }; calls++; spent += Number(r.cost || 0); } batchesPosted++; saveState(); continue; }
    const j = await dfsRequest('POST', DFS_POST, chunk.map((x, k) => ({ ...taskBody(x), tag: String(k) })));
    batchesPosted++; calls += chunk.length;
    const tasks = Array.isArray(j.tasks) ? j.tasks : [];
    chunk.forEach((x, k) => { const t = tasks.find(t => t.data && String(t.data.tag) === String(k)) || tasks[k]; if (t && t.id && (t.status_code === 20100 || t.status_code === 20000)) { state.posted[x] = { id: t.id, cost: Number(t.cost || 0) }; spent += Number(t.cost || 0); } else { out.set(x, { status: 'failed:' + ((t && t.status_message) || j.status_message || 'post'), results: [], cost: 0 }); } });
    saveState();
  }
  // collect
  const pending = new Map(); for (const [x, p] of Object.entries(state.posted)) if (!p.got) pending.set(p.id, x); else out.set(x, p.got);
  if (STUB) { for (const [id, x] of pending) { const r = stubSearch(x); out.set(x, r); state.posted[x].got = r; } saveState(); return out; }
  const t0 = Date.now(); let lastReadyCheck = 0;
  while (pending.size && Date.now() - t0 < POLL_MAX_MS) {
    await sleep(POLL_MS);
    const ready = await dfsRequest('GET', DFS_READY);
    const ids = new Set(); for (const t of (ready.tasks || [])) for (const r of (t.result || [])) if (r && r.id) ids.add(r.id);
    // tasks_ready only lists recent completions; after a few polls also try task_get on what is still pending
    const tryIds = [...pending.keys()].filter(id => ids.has(id) || (Date.now() - lastReadyCheck > 60000));
    for (const id of tryIds) {
      const j = await dfsRequest('GET', DFS_GET + id);
      const task = Array.isArray(j.tasks) ? j.tasks[0] : null;
      if (!task) continue;
      if (task.status_code === 20000) { const r = parseDataforseo({ status_code: 20000, cost: 0, tasks: [task] }); const x = pending.get(id); out.set(x, r); state.posted[x].got = r; pending.delete(id); }
      else if (task.status_code && task.status_code !== 40601 && task.status_code !== 40602 && task.status_code >= 40000 && task.status_code < 60000) { // 40601/40602 = task in queue / handed
        const x = pending.get(id); const msg = task.status_message || String(task.status_code); pending.delete(id);
        if (isTransientFailure(msg) && !state.posted[x].retried && !stopFn()) { // re-post ONCE (vendor-side upstream failure, billed anyway)
          const j2 = await dfsRequest('POST', DFS_POST, [taskBody(x)]); calls++; const t2 = Array.isArray(j2.tasks) ? j2.tasks[0] : null;
          if (t2 && t2.id && (t2.status_code === 20100 || t2.status_code === 20000)) { spent += Number(t2.cost || 0); state.posted[x] = { id: t2.id, cost: Number(t2.cost || 0), retried: true }; pending.set(t2.id, x); reposted++; continue; }
        }
        const r = { status: 'failed:' + msg, results: [], cost: 0 }; out.set(x, r); state.posted[x].got = r;
      }
    }
    if (Date.now() - lastReadyCheck > 60000) lastReadyCheck = Date.now();
    saveState();
    process.stderr.write(`. standard: ${pending.size} task(s) still pending ($${spent.toFixed(3)} charged)\n`);
  }
  for (const [id, x] of pending) out.set(x, { status: 'timeout:poll', results: [], cost: 0 });
  return out;
}

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
  const stateFile = path.join(OUT, 'standard_state.json');
  let doneIds = new Set();
  if (RESUME && fs.existsSync(outFile)) {
    const prev = fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const keep = prev.filter(p => p.status === 'ok' || p.status === 'no_results');
    doneIds = new Set(keep.map(p => p.place_id));
    fs.writeFileSync(outFile, keep.map(p => JSON.stringify(p)).join('\n') + (keep.length ? '\n' : ''));
  } else { fs.writeFileSync(outFile, ''); if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); }
  if (RESUME && fs.existsSync(costFile)) { try { spent = Number(JSON.parse(fs.readFileSync(costFile, 'utf8')).spent_usd_total_before_this_run_included || 0); } catch { } }
  const spentBefore = spent;
  const targets = leads.filter(l => !doneIds.has(l.place_id)).slice(0, LEAD_LIMIT);
  let done = 0, hadName = 0, hadEmail = 0, budgetHit = false;
  const stopFn = () => { if (overBudget(spent, MAX_COST)) { budgetHit = true; return true; } return false; };
  const writeCost = () => { if (BACKEND !== 'dataforseo') return; fs.writeFileSync(costFile, JSON.stringify({ backend: BACKEND, mode: MODE, calls_this_run: calls, batches_posted: batchesPosted, reposted_after_vendor_error: reposted, spent_usd_this_run: +(spent - spentBefore).toFixed(4), spent_usd_total_before_this_run_included: +spent.toFixed(4), max_cost_usd: MAX_COST, budget_hit: budgetHit, leads_done_this_run: done, leads_targeted: targets.length, location_code: DFS_LOCATION, depth: DFS_DEPTH, updated: new Date().toISOString() }, null, 2)); };

  // query plan per lead
  const plan = targets.map(l => {
    let st = '';
    if (REGION_RE) { const m = (l.city || '').match(REGION_RE); st = (m && (m[1] || m[0])) || ''; }
    if (!st) st = REGION_DEFAULT;
    let hood = (l.neighborhood || l.city || '').replace(/\s*\(.*?\)/, '');
    if (REGION_RE) hood = hood.replace(new RegExp(REGION_RE.source, 'i'), '');
    hood = hood.replace(/,\s*$/, '').trim();
    const base = `${l.name} ${hood} ${st}`.replace(/\s+/g, ' ').trim();
    const biased = `${base} ${biasGroup}`, li = `site:linkedin.com ${base}`.replace(/\s+/g, ' ').trim();
    const emailQ = EMAIL_SEARCH ? buildEmailQueries(l, socialsById.get(l.place_id), sharedHost) : [];
    return { l, base, biased, li, emailQ };
  });
  const run = (qs) => MODE === 'standard' ? runStandard(qs, stopFn, stateFile) : runLive(qs, stopFn);
  // round 1: biased + linkedin + email queries (live mode keeps per-lead ordering via the worker pool; standard batches them)
  const r1q = []; for (const p of plan) { if (!EMAIL_ONLY) { r1q.push(p.biased); if (USE_LI) r1q.push(p.li); } for (const e of p.emailQ) r1q.push(e.query); }
  const res1 = await run([...new Set(r1q)]);
  // round 2: broad only where biased AND linkedin came back empty
  const r2q = EMAIL_ONLY ? [] : plan.filter(p => res1.has(p.biased) && n(res1.get(p.biased)) === 0 && (!USE_LI || (res1.has(p.li) && n(res1.get(p.li)) === 0))).map(p => p.base);
  const res2 = r2q.length && !stopFn() ? await run([...new Set(r2q)]) : new Map();
  const get = (m, q) => m.get(q) || { status: 'skipped', results: [] };
  for (const p of plan) {
    if (!EMAIL_ONLY && !res1.has(p.biased)) continue; // never reached (budget stop) -> stays pending for --resume
    if (EMAIL_ONLY && p.emailQ.length && !res1.has(p.emailQ[0].query)) continue;
    const rb = EMAIL_ONLY ? { status: 'skipped', results: [] } : get(res1, p.biased);
    const rl = (USE_LI && !EMAIL_ONLY) ? get(res1, p.li) : { status: 'skipped', results: [] };
    const rbr = res2.has(p.base) ? res2.get(p.base) : { status: 'not_needed', results: [] };
    const emailRuns = p.emailQ.map(e => ({ ...e, r: get(res1, e.query) }));
    const emailText = emailRuns.map(e => bundle(e.query, e.r)).join('\n\n').slice(0, TEXT_CAP);
    const soc = socialsById.get(p.l.place_id) || {}; const socialUrls = [...(soc.facebook || []), ...(soc.instagram || [])];
    const em = emailsFromResults(emailRuns.flatMap(e => e.r.results || []), hostOf(p.l.website || ''), socialUrls);
    const emailsFound = em.strict;
    const anyOk = n(rb) > 0 || n(rl) > 0 || n(rbr) > 0 || emailRuns.some(e => n(e.r) > 0);
    const attempted = [rb, rl, rbr, ...emailRuns.map(e => e.r)].filter(r => !/^(skipped|not_needed)$/.test(r.status));
    const allFailed = attempted.length > 0 && attempted.every(failed);
    const status = allFailed ? ('search_failed:' + (attempted[0].status || 'unknown')) : (anyOk ? 'ok' : 'no_results');
    const l = p.l;
    fs.appendFileSync(outFile, JSON.stringify({
      place_id: l.place_id, business_name: l.name, icp_type: l.icp_type || '',
      full_address: l.full_address || '', zip: l.zip || '', neighborhood: l.neighborhood || '', city: l.city || '',
      phone: l.phone_number || '', website: l.website || '',
      biased_query: EMAIL_ONLY ? '' : p.biased, biased_text: EMAIL_ONLY ? '' : bundle(p.biased, rb),
      linkedin_text: (USE_LI && !EMAIL_ONLY) ? bundle(p.li, rl) : '',
      broad_text: n(rbr) > 0 ? bundle(p.base, rbr) : '',
      email_queries: p.emailQ.map(e => e.query), email_text: emailText, emails_from_serp: emailsFound, emails_from_serp_loose: em.loose,
      rung_status: { biased: rb.status, linkedin: rl.status, broad: rbr.status, email: emailRuns.map(e => e.r.status) },
      results_count: n(rb) + n(rl) + n(rbr) + emailRuns.reduce((a, e) => a + n(e.r), 0), status, backend: BACKEND, mode: MODE
    }) + '\n');
    done++; if (anyOk) hadName++; if (emailsFound.length) hadEmail++;
  }
  writeCost();
  const why = budgetHit ? `STOPPED: --max-cost $${MAX_COST} reached ($${spent.toFixed(4)} spent) — re-run with --resume and a new cap` : 'DONE';
  console.log(`\n${why}: ${done} leads this run -> ${outFile}`);
  console.log(`  with results: ${hadName} | empty: ${done - hadName}${EMAIL_SEARCH ? ` | with an email candidate: ${hadEmail}` : ''}`);
  if (BACKEND === 'dataforseo') console.log(`  mode: ${MODE} | calls: ${calls}${MODE === 'standard' ? ' | batches posted: ' + batchesPosted : ''} | spent this run: $${(spent - spentBefore).toFixed(4)} | cap: $${MAX_COST} | ${costFile}`);
  if (budgetHit) process.exit(3);
})();
