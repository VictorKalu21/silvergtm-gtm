#!/usr/bin/env node
/*
 * fetch-sites.js :: Step 1 of owner-finding
 * For each lead with a website, fetch the homepage + a handful of second-level
 * pages (About / Team / Meet / Contact / Our Story / Providers), strip to clean
 * text, and emit one JSONL record per lead — the feed for the AI owner-extraction
 * step. Plain Node fetch + HTML parse, no browser. Writes incrementally so a
 * timeout/kill never loses completed rows.
 *
 * Usage:
 *   node fetch-sites.js --in <leads_clean.csv> --out <dir> [--limit N] [--concurrency C]
 *                       [--retry-timeout <ms>] [--no-retry] [--firecrawl] [--firecrawl-rpm 10]
 *   node fetch-sites.js --firecrawl-residue <site_text.jsonl> [--firecrawl-rpm 10] [--limit N]
 *                       [--firecrawl-redo-failed]
 *
 * Escalation (see IMPROVEMENTS.md): after the main plain-fetch pass, a FREE longer-timeout
 * retry (default ON) re-fetches only the transient failures (AbortError/timeout/5xx/429/reset)
 * to recover slow-but-alive sites. With --firecrawl, residual failures (403/Cloudflare/thin-JS)
 * are sent to Firecrawl's scrape API (key FIRECRAWL_KEY in .env). No raw headless Chrome rung
 * (tested useless here). 404/connection-reset after retry = accepted as dead.
 *
 * The Firecrawl rung is plan-aware (IMPROVEMENTS.md MEDIUM, 2026-09-17): it reads maxConcurrency
 * from GET /v1/team/queue-status and never runs more workers than that (2 if the call fails),
 * spaces request starts at 60/--firecrawl-rpm seconds, and on a 429 sleeps for Retry-After
 * (else 60 s) and re-queues the row. --firecrawl-residue runs that rung ALONE over an existing
 * site_text.jsonl (status != ok rows only, 404/400/402/307 skipped as dead, 403 class last,
 * recovered rows written back in place, resumable) — the only way a paid rung is ever used twice.
 *
 * Output: <dir>/site_text.jsonl  (one JSON object per line)
 */
const fs = require('fs');
const path = require('path');

const { isSharedHost, rootDomain } = require('./shared-hosts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
// second-level pages worth following. about/team/meet are owner-finding shaped; the contact keywords
// are where a trade site actually puts its mailbox (IMPROVEMENTS.md HIGH: fetch-sites email coverage).
const L2_DEFAULT = ['about', 'team', 'meet', 'our-story', 'story', 'staff', 'provider', 'providers', 'doctor', 'doctors', 'dentist', 'owner', 'founder', 'leadership', 'who-we-are', 'about-us', 'our-team', 'meet-the', 'contact', 'contact-us', 'get-in-touch', 'enquir'];
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|css|js|ico|woff2?)($|\?)/i;
const SOCIAL = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|yelp|maps\.google|goo\.gl)\./i;
const PAGE_TIMEOUT = 8000;     // per-request abort (main pass)
const MAX_L2 = 6;              // how many second-level pages to follow
const HOME_CAP = 6000, L2_CAP = 2800, TOTAL_CAP = 18000; // char caps

function parseCsv(txt) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c === '\r') {} else cur += c; }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
function htmlToText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*/g, '\n').trim();
}
function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1].trim(); const anchor = htmlToText(m[2]).toLowerCase();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (SKIP_EXT.test(u.pathname) || SOCIAL.test(u.host)) continue;
    out.push({ url: u.href, host: u.host, path: (u.pathname + ' ' + anchor).toLowerCase() });
  }
  return out;
}

// ---- on-site email extraction (IMPROVEMENTS.md HIGH, 2026-09-17) --------------------------------
// A regex over htmlToText() output is blind by construction: the function deletes <script> blocks and
// every tag (so every attribute) BEFORE the regex sees the page. Four whole classes of address are
// therefore invisible — mailto: hrefs, JSON-LD "email", Cloudflare data-cfemail (XOR-encoded hex; the
// visible text is only the "[email protected]" placeholder), and tag-split / entity-obfuscated forms.
// Every rung below reads the RAW response body; the old text regex stays as the last rung, so nothing
// the engine used to find is lost. Ported from the job-side implementation proved on the Atlas Growth
// 2026-09-16 UK run (+137 addresses over 676 domains, every cfemail one of them new).
const ZERO_WIDTH = /[\u200b\u200c\u200d\u2060\ufeff\u00ad]/g;
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_SHAPE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const RE_MAILTO = /mailto\s*:\s*["']?([^"'<>\s)]+)/gi;
const RE_LDJSON = /<script[^>]+type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
const RE_CFEMAIL = /data-cfemail\s*=\s*["']([0-9a-fA-F]+)["']/g;
const RE_CFLINK = /\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g;
// info<span>@</span>example.co.uk / info&#64;example.co.uk / info [at] example.co.uk
const RE_TAGSPLIT = /([a-z0-9._%+-]{2,64})\s*(?:<[^<>]{1,160}>\s*){0,3}(?:@|&#0*64;|&#x0*40;|&commat;|\[\s*at\s*\]|\(\s*at\s*\))\s*(?:<[^<>]{1,160}>\s*){0,3}([a-z0-9-]+(?:\.[a-z0-9-]+)+\.?[a-z]{2,})/gi;
// junk: image files (either side of the @, e.g. a CDN "info@2x.png"), vendor/CDN/placeholder hosts,
// and Cloudflare's own placeholder text when no data-cfemail backs it.
const JUNK = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$|\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)@|(example|sentry|wixpress|godaddy|squarespace|schema\.org|w3\.org|jquery|cloudflare|wordpress|gravatar|shopify|placeholder|yourdomain|domain\.com|email\.com|test\.com|company\.com)\.|^email@protected$/i;
// not a public suffix: a Chromium/MHTML frame id (frame-<32hex>@mhtml.blink, 8 of them on the
// 2026-09-17 Firecrawl pass) and the RFC 2606 / special-use names. A host here is never a mailbox.
const BAD_TLD = /\.(blink|local|localhost|localdomain|internal|intranet|invalid|test|example|lan|home|corp|arpa|onion)$/i;
// template addresses left in a theme: the registrable label is the giveaway (email@company.co.uk,
// you@email.com, joe@email.com). The weak words only reject when the LOCAL part is a placeholder
// too, so forwardscaffolding@email.com (a real free-mail mailbox) and joe@realdomain survive.
const PLACEHOLDER_SLD_ALWAYS = new Set(['yourdomain', 'yourcompany', 'mycompany', 'mydomain', 'yoursite', 'yourwebsite', 'domainname', 'exampledomain', 'yourbusiness']);
const PLACEHOLDER_SLD_WEAK = new Set(['email', 'company', 'domain', 'test', 'website', 'sitename']);
const PLACEHOLDER_LOCAL = new Set(['you', 'yourname', 'name', 'firstname', 'lastname', 'email', 'username', 'user', 'someone', 'john', 'jane', 'joe']);
function isPlaceholderAddress(e) {
  const at = e.indexOf('@');
  const local = e.slice(0, at), host = e.slice(at + 1);
  const sld = ((rootDomain(host) || host).split('.')[0] || '');
  if (PLACEHOLDER_SLD_ALWAYS.has(sld)) return true;
  return PLACEHOLDER_LOCAL.has(local) && (PLACEHOLDER_SLD_WEAK.has(sld) || PLACEHOLDER_SLD_ALWAYS.has(sld));
}
// A booking / profile URL can carry a mailbox as a PATH SEGMENT — Microsoft Bookings writes
// https://outlook.office.com/book/MeetwiththeAtalTechnicalManager@ataluk.com/?... — and that is the
// address of a page, not a contact. Such an address is dropped unless the same page ALSO states it
// outside a URL. (mailto: is not an http URL, so a real mailto address is never touched.)
const RE_URL = /\bhttps?:\/\/[^\s"'<>()\[\]\\]+/gi;
function urlPathOnlyEmails(txt) {
  const s = String(txt == null ? '' : txt);
  const inUrl = new Set();
  for (const m of s.matchAll(RE_URL)) {
    const path = m[0].split(/[?#]/)[0];                 // a query value is NOT a path segment
    for (const seg of path.split('/').slice(3)) { const e = segIsAddress(seg); if (e) inUrl.add(e); }
  }
  if (!inUrl.size) return inUrl;
  for (const raw of (s.replace(RE_URL, ' ').match(RE_EMAIL) || [])) inUrl.delete(cleanEmail(raw));  // also stated in the open
  return inUrl;
}
// a path segment counts only when the WHOLE segment is the address (so ?to=info@x, and any segment
// that merely contains one, are left alone)
function segIsAddress(seg) {
  const e = cleanEmail(seg);
  if (!e) return null;
  let t = String(seg);
  try { t = decodeURIComponent(t); } catch (err) { /* stray % */ }
  t = t.replace(/\s+/g, '').toLowerCase().replace(/[.,;:!?]+$/, '');
  return t === e ? e : null;
}
const MAX_LOCAL_TAGSPLIT = 40;   // an anchor/label swallowed into a local part is never this long
// provenance priority: the first rung in this order that found an address owns its label
const SOURCE_RANK = { mailto: 0, jsonld: 1, cfemail: 2, tag_split: 3, text: 4 };

// Cloudflare email obfuscation: first byte is the XOR key, the rest is the address.
function cfDecode(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2 || hex.length < 8) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return s.includes('@') ? s : null;
}

// normalise one candidate string -> a bare lowercase address, or null
function cleanEmail(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  try { s = decodeURIComponent(s); } catch (e) { /* stray % in the href */ }
  s = decode(s).replace(ZERO_WIDTH, '');
  s = s.replace(/^\s*(?:mailto\s*:)+\s*/i, '');
  s = s.split('?')[0].split(',')[0].split(';')[0];      // mailto query strings / multi-recipient
  s = s.trim().replace(/^[<>"'()\[\]{}]+/, '').replace(/[<>"'()\[\]{}]+$/, '');
  s = s.replace(/[.,;:!?|\u2019'")\]}-]+$/, '');        // trailing punctuation
  s = s.replace(/\s+/g, '').toLowerCase();
  const m = s.match(RE_EMAIL);
  if (!m) return null;
  let e = m[0].replace(/\.+$/, '');
  const at = e.indexOf('@');
  // JSON-escape residue: a tag_split match over an inline JS blob can swallow the escape body of
  // \u003e / \u0026 (the backslash is not in the local-part class) and produce "u003eenquiries@host".
  // Strip the residue rather than the address.
  const local = e.slice(0, at).replace(/^(?:u00[0-9a-f]{2})+/, ''), dom = e.slice(at + 1);
  if (!local) return null;
  e = local + '@' + dom;
  return EMAIL_SHAPE.test(e) ? e : null;
}
const keepEmail = e => !!e && EMAIL_SHAPE.test(e) && !JUNK.test(e) && !BAD_TLD.test(e) && !isPlaceholderAddress(e);
// the text rung: the plain regex over stripped text. Every match goes through cleanEmail, so a
// URL-encoded leading space (%20info@host, what markdown from a rendered fetch carries) normalises
// to the bare address and dedupes against it instead of shipping twice.
const emailsIn = txt => {
  const s = String(txt == null ? '' : txt);
  const skip = urlPathOnlyEmails(s);
  return [...new Set((s.match(RE_EMAIL) || []).map(e => cleanEmail(e)))].filter(e => keepEmail(e) && !skip.has(e));
};

// JSON-LD "email" at ANY depth (contactPoint[], @graph[], nested Organization)
function walkJsonEmails(node, out) {
  if (Array.isArray(node)) { for (const v of node) walkJsonEmails(v, out); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (/^e-?mail(address)?$/i.test(k)) {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) out.push(...v.filter(x => typeof x === 'string'));
      else if (v && typeof v === 'object') walkJsonEmails(v, out);
    } else walkJsonEmails(v, out);
  }
}

// every rung, in provenance order, over the RAW body -> [{ email, source }] (first source wins).
// `text` is the page's htmlToText() output when the caller already has it (the run path does, and
// stripping a page twice is the most expensive thing in this file).
function extractEmails(rawHtml, text) {
  const out = [], best = new Map();
  let skip = new Set();                       // URL-path-segment addresses (filled in below)
  const add = (cand, src) => {
    const e = cleanEmail(cand);
    if (!keepEmail(e)) return;
    // a declared mailbox (mailto/jsonld/cfemail) is trusted; a scraped one is not a page address
    if (skip.has(e) && (src === 'tag_split' || src === 'text')) return;
    const prev = best.get(e);
    if (prev === undefined) { best.set(e, src); out.push({ email: e, source: src }); }
    else if (SOURCE_RANK[src] < SOURCE_RANK[prev]) { best.set(e, src); out.find(x => x.email === e).source = src; }
  };
  const h = String(rawHtml == null ? '' : rawHtml).replace(ZERO_WIDTH, '');
  skip = urlPathOnlyEmails(h);
  if (text !== undefined) for (const e of urlPathOnlyEmails(text)) skip.add(e);
  for (const m of h.matchAll(RE_MAILTO)) add(m[1], 'mailto');
  for (const m of h.matchAll(RE_LDJSON)) {
    const blob = m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
    let vals = [];
    try { walkJsonEmails(JSON.parse(blob), vals); }
    catch (e) { vals = [...blob.matchAll(/"e-?mail(?:address)?"\s*:\s*"([^"]{5,120})"/gi)].map(x => x[1]); } // malformed JSON-LD is common
    for (const v of vals) add(v, 'jsonld');
  }
  for (const m of h.matchAll(RE_CFEMAIL)) { const d = cfDecode(m[1]); if (d) add(d, 'cfemail'); }
  for (const m of h.matchAll(RE_CFLINK)) { const d = cfDecode(m[1]); if (d) add(d, 'cfemail'); }
  // the local part of a tag/entity-split match is the run of address characters immediately before
  // the separator (the class admits no whitespace, so a label with spaces can never be swallowed);
  // a run longer than a real local part means the page ran words together — drop it.
  for (const m of h.matchAll(RE_TAGSPLIT)) { if (m[1].length <= MAX_LOCAL_TAGSPLIT) add(m[1] + '@' + m[2], 'tag_split'); }
  for (const e of emailsIn(text === undefined ? htmlToText(h) : text)) add(e, 'text');
  return out;
}

// union several rung outputs (one per fetched page, plus the text rung over the combined text):
// discovery order is kept for the cap, the highest-priority source wins the label.
function mergeEmailSources(lists, cap = 8) {
  const order = [], best = new Map();
  for (const list of lists) for (const { email, source } of (list || [])) {
    const prev = best.get(email);
    if (prev === undefined) { best.set(email, source); order.push(email); }
    else if ((SOURCE_RANK[source] ?? 9) < (SOURCE_RANK[prev] ?? 9)) best.set(email, source);
  }
  const emails = order.slice(0, cap);
  return { emails, by_source: Object.fromEntries(emails.map(e => [e, best.get(e)])) };
}

module.exports = { L2_DEFAULT, htmlToText, emailsIn, extractEmails, mergeEmailSources, cfDecode, cleanEmail, keepEmail };
if (require.main !== module) return;   // required by a test: nothing below runs (argv parse + fetches)

// ---- run path ----------------------------------------------------------------------------------
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const IN = arg('in'), OUT = arg('out', '.');
const LIMIT = Number(arg('limit', 'Infinity')); // process ALL by default; old default 50 silently truncated runs
const CONC = parseInt(arg('concurrency', '10'), 10);
const CFG = arg('config', '');
// --- escalation rungs (see IMPROVEMENTS.md: rendered/anti-bot fallback) ---
const RETRY_ON = !process.argv.includes('--no-retry');        // free longer-timeout retry, default ON
const RETRY_TIMEOUT = parseInt(arg('retry-timeout', '20000'), 10); // slow-but-alive recovery
const FIRECRAWL_RESIDUE = arg('firecrawl-residue', '');       // run the paid rung ALONE over an existing site_text.jsonl
const FIRECRAWL = process.argv.includes('--firecrawl') || !!FIRECRAWL_RESIDUE; // opt-in paid rung, default OFF
// plan limits (probe 2026-09-17, Hobby key: {"maxConcurrency":2}; body of a 429: 'Consumed (req/min): 11').
// The request-start spacing is what keeps the queue alive — 4 unspaced workers burned 188 of 197 rows in <2 min.
const FIRECRAWL_RPM = Math.max(1, Number(arg('firecrawl-rpm', '10')) || 10);
const FIRECRAWL_DEFAULT_CONC = 2;    // when queue-status cannot be read
const FIRECRAWL_MAX_TRIES = 3;       // per row, counting 429 re-queues
const FIRECRAWL_REDO_FAILED = process.argv.includes('--firecrawl-redo-failed'); // residue mode: re-attempt rows already tried
const FIRECRAWL_TIMEOUT = 120000;    // client abort; the server-side page timeout below is 90 s
const FIRECRAWL_PAGE_TIMEOUT = 90000;
const ENVPATH = arg('env', path.join(__dirname, '.env'));
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const FIRECRAWL_ENV = loadEnv(ENVPATH);
const FIRECRAWL_KEY = FIRECRAWL_ENV.FIRECRAWL_KEY;
// overridable so the test can point the rung at a local fake endpoint (no network in tests)
const FIRECRAWL_BASE = String(arg('firecrawl-base', '') || FIRECRAWL_ENV.FIRECRAWL_BASE || 'https://api.firecrawl.dev').replace(/\/+$/, '');
if (!IN && !FIRECRAWL_RESIDUE) { console.error('ERROR: --in <csv> required (or --firecrawl-residue <site_text.jsonl>)'); process.exit(1); }
// --- owner-prompt gate (SKILL STEP 6a): owner-finding output is not written until the per-vertical
// prompt exists in the run folder. Checks OUT, its parent and grandparent (batch sub-dirs allowed).
if (!process.argv.includes('--no-prompt-ok')) {
  const gateDir = FIRECRAWL_RESIDUE ? path.dirname(path.resolve(FIRECRAWL_RESIDUE)) : path.resolve(OUT);
  const cands = [gateDir, path.dirname(gateDir), path.dirname(path.dirname(gateDir))].map(d => path.join(d, 'owner-prompt.md'));
  if (!cands.some(f => fs.existsSync(f))) {
    console.error('\nERROR: per-vertical owner-prompt.md required before fetching owner text (SKILL STEP 6a).');
    console.error('  looked for: ' + cands.join(' | '));
    console.error('  Build it from owner-prompt.template.md (or copy <client>/owner-prompts/<vertical>.md) at STEP 3 time,');
    console.error('  save it in the run folder, then re-run. (Deliberate prompt-less fetch: pass --no-prompt-ok.)\n');
    process.exit(1);
  }
}
let L2_EXTRA = [];
if (CFG) { try { L2_EXTRA = (JSON.parse(require('fs').readFileSync(CFG, 'utf8')).site_l2_keywords) || []; } catch (e) { console.error('WARN: could not read site_l2_keywords from ' + CFG); } }
const L2_KEYWORDS = [...new Set([...L2_DEFAULT, ...L2_EXTRA])];

async function getPage(url, timeout) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), timeout || PAGE_TIMEOUT);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !/text\/html/i.test(ct)) return { ok: false, status: r.status, finalUrl: r.url };
    const html = await r.text();
    return { ok: true, status: r.status, finalUrl: r.url, html };
  } catch (e) { return { ok: false, status: 0, err: e.name }; } finally { clearTimeout(to); }
}

// Is a home_failed status worth a cheap longer-timeout re-fetch? (slow-but-alive: AbortError/
// timeout/connection-reset/5xx/429). 403/Cloudflare/404 are NOT transient — those go to Firecrawl / die.
function isTransient(code) {
  const s = String(code);
  if (/AbortError|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|TypeError|reset/i.test(s)) return true;
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  if (n === 429) return true;
  if (n >= 500 && n <= 599) return true;
  return false;
}

// ---- Firecrawl rendered/anti-bot rung (opt-in, paid) --------------------------------------------
// Plan-aware after IMPROVEMENTS.md MEDIUM 2026-09-17: worker count comes from the account's own
// queue-status, request STARTS are spaced, and a 429 backs off and re-queues instead of burning the row.
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a recovered page that is a challenge interstitial (or near-empty) is NOT a recovery — the job-side
// runner had to add this check before the counts meant anything.
const FIRECRAWL_CHALLENGE = /just a moment|enable javascript and cookies|attention required|checking your browser|verifying you are human/i;
const FIRECRAWL_MIN_CHARS = 200;
const firecrawlUsable = md => !!md && md.trim().length > FIRECRAWL_MIN_CHARS && !FIRECRAWL_CHALLENGE.test(md.slice(0, 600));
// dead by definition — never worth a credit (IMPROVEMENTS.md)
const FIRECRAWL_SKIP_DEAD = /^home_failed:(404|400|402|307)$/;

// GET /v1/team/queue-status -> the plan's maxConcurrency (probe 2026-09-17: {"success":true,...,
// "maxConcurrency":2}; free, no credits). Any failure = the conservative default.
async function firecrawlMaxConcurrency() {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(FIRECRAWL_BASE + '/v1/team/queue-status', { signal: ctrl.signal, headers: { 'Authorization': 'Bearer ' + FIRECRAWL_KEY } });
    if (!r.ok) return FIRECRAWL_DEFAULT_CONC;
    const j = await r.json();
    const n = Number((j && j.maxConcurrency) ?? (j && j.data && j.data.maxConcurrency));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : FIRECRAWL_DEFAULT_CONC;
  } catch (e) { return FIRECRAWL_DEFAULT_CONC; } finally { clearTimeout(to); }
}

// one scrape call -> { http, ok, md, html, status, err, retryAfter }
async function firecrawlScrape(url) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), FIRECRAWL_TIMEOUT);
  try {
    const r = await fetch(FIRECRAWL_BASE + '/v1/scrape', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Authorization': 'Bearer ' + FIRECRAWL_KEY, 'Content-Type': 'application/json' },
      // html as well as markdown: the raw-HTML email rungs (mailto/JSON-LD/cfemail/tag-split) only see
      // a body. onlyMainContent is deliberately NOT set — the mailbox lives in the header/footer.
      body: JSON.stringify({ url, formats: ['markdown', 'html'], timeout: FIRECRAWL_PAGE_TIMEOUT, waitFor: 2000 }),
    });
    const ra = Number(r.headers.get('retry-after'));
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    return {
      http: r.status, ok: r.status === 200 && !!(j && j.success !== false && j.data),
      md: (j && j.data && j.data.markdown) || '', html: (j && j.data && j.data.html) || '',
      status: (j && j.data && j.data.metadata && j.data.metadata.statusCode) || 0,
      err: String((j && j.error) || '').slice(0, 160),
      retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 0,
    };
  } catch (e) { return { http: 0, ok: false, md: '', html: '', status: 0, err: String(e.message || e).slice(0, 160), retryAfter: 0 }; } finally { clearTimeout(to); }
}

// turn one scrape result into a site_text record, in place. Returns true when it is a real recovery.
function applyFirecrawl(rec, r) {
  rec.firecrawl = { http: r.http, status: r.status || 0, err: r.err || '', at: new Date().toISOString() };
  if (!(r.ok && firecrawlUsable(r.md))) return false;
  const text = r.md.slice(0, TOTAL_CAP);
  // (d) the RAW html gets every email rung, not just the markdown text regex
  const merged = mergeEmailSources([
    extractEmails(r.html || '', htmlToText(r.html || '')),
    emailsIn(text).map(e => ({ email: e, source: 'text' })),
  ]);
  rec.status = 'ok';
  rec.pages = [{ url: rec.website, label: 'home', text: text.slice(0, HOME_CAP) }];
  rec.emails = merged.emails;
  rec.emails_by_source = merged.by_source;
  rec.text = text;
  rec.pages_fetched = 1;
  rec.source = 'firecrawl';
  return true;
}

// the pass itself: <= plan maxConcurrency workers, starts spaced 60/RPM seconds apart, 429 -> sleep
// Retry-After (else 60 s) and re-queue the row (counted separately from a failure).
async function firecrawlPass(recs, label, onUpdate) {
  const stats = { rows: recs.length, calls: 0, recovered: 0, failed: 0, rate_limited: 0, workers: 0, max_concurrency: 0 };
  if (!recs.length) return stats;
  const maxConc = await firecrawlMaxConcurrency();
  const gap = Math.round(60000 / FIRECRAWL_RPM);
  const workers = Math.max(1, Math.min(maxConc, recs.length));
  stats.workers = workers; stats.max_concurrency = maxConc;
  process.stderr.write(`\nFIRECRAWL${label}: ${recs.length} row(s), ${workers} worker(s) (plan maxConcurrency ${maxConc}), ${FIRECRAWL_RPM} req/min = ${gap}ms between starts\n`);
  const q = recs.map(rec => ({ rec, tries: 0 }));
  let nextStart = 0, n = 0; const t0 = Date.now();
  async function fworker() {
    while (q.length) {
      const job = q.shift();
      const wait = Math.max(0, nextStart - Date.now());
      nextStart = Math.max(Date.now(), nextStart) + gap;
      if (wait) await sleep(wait);
      job.tries++; stats.calls++;
      const r = await firecrawlScrape(job.rec.website);
      if (r.http === 429) {
        stats.rate_limited++;
        const back = (r.retryAfter || 60) * 1000;
        if (job.tries < FIRECRAWL_MAX_TRIES) {
          process.stderr.write(`  429 ${job.rec.website} — sleeping ${Math.round(back / 1000)}s, row re-queued (try ${job.tries})\n`);
          nextStart = Math.max(nextStart, Date.now() + back);   // hold every worker, not just this one
          q.push(job);
          await sleep(back);
          continue;
        }
      }
      const ok = applyFirecrawl(job.rec, r);
      if (ok) stats.recovered++; else stats.failed++;
      n++;
      if (onUpdate) onUpdate(job.rec, ok);
      process.stderr.write(`  ${n}/${recs.length} ${ok ? 'ok emails=' + job.rec.emails.length : 'fail:' + (job.rec.firecrawl.status || job.rec.firecrawl.http || 'err')} ${job.rec.website} ${((Date.now() - t0) / 1000 / n).toFixed(1)}s/site\n`);
    }
  }
  await Promise.all(Array.from({ length: workers }, fworker));
  return stats;
}

// ---- --firecrawl-residue: the paid rung ALONE over an existing site_text.jsonl ------------------
// Selection: status != ok, minus the dead codes, minus rows already attempted (resumable, no double
// spend — --firecrawl-redo-failed re-attempts those). 403 class last: it is the least alive class.
async function residueMode() {
  const file = path.resolve(FIRECRAWL_RESIDUE);
  if (!fs.existsSync(file)) { console.error('ERROR: --firecrawl-residue file not found: ' + file); process.exit(1); }
  if (!FIRECRAWL_KEY) { console.error(`ERROR: --firecrawl-residue needs FIRECRAWL_KEY in ${ENVPATH}`); process.exit(1); }
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim())
    .map(raw => { try { return { raw, rec: JSON.parse(raw) }; } catch (e) { return { raw, rec: null }; } });
  const attemptable = entries.map(e => e.rec).filter(r => r && r.website && r.status !== 'ok'
    && !FIRECRAWL_SKIP_DEAD.test(String(r.status)) && (FIRECRAWL_REDO_FAILED || !r.firecrawl));
  const todo = attemptable
    .slice()
    .sort((a, b) => (/403/.test(String(a.status)) ? 1 : 0) - (/403/.test(String(b.status)) ? 1 : 0))  // 403 class last
    .slice(0, LIMIT);
  const skippedDead = entries.filter(e => e.rec && e.rec.status !== 'ok' && FIRECRAWL_SKIP_DEAD.test(String(e.rec.status))).length;
  const alreadyTried = entries.filter(e => e.rec && e.rec.status !== 'ok' && e.rec.firecrawl).length;
  process.stderr.write(`RESIDUE ${file}\n  ${entries.length} row(s); ok ${entries.filter(e => e.rec && e.rec.status === 'ok').length}; dead-code skipped ${skippedDead}; already attempted ${alreadyTried}; attempting ${todo.length}\n`);
  const flush = () => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, entries.map(e => (e.rec ? JSON.stringify(e.rec) : e.raw)).join('\n') + (entries.length ? '\n' : ''));
    fs.renameSync(tmp, file);            // written back IN PLACE, atomically, after every row
  };
  const t0 = Date.now();
  const stats = await firecrawlPass(todo, '-RESIDUE', () => flush());
  if (todo.length) flush();
  const withEmail = todo.filter(r => r.status === 'ok' && r.emails && r.emails.length).length;
  const rep = { residue_file: file, rows: entries.length, attempted: stats.recovered + stats.failed, recovered: stats.recovered, failed: stats.failed, rate_limited_429: stats.rate_limited, calls: stats.calls, with_email: withEmail, workers: stats.workers, plan_max_concurrency: stats.max_concurrency, rpm: FIRECRAWL_RPM, seconds: Math.round((Date.now() - t0) / 1000) };
  console.log(JSON.stringify(rep));
}

async function processLead(lead, timeout) {
  const rec = { place_id: lead.place_id, name: lead.name, website: lead.website, neighborhood: lead.neighborhood, city: lead.city, phone: lead.phone_number, full_address: lead.full_address, status: 'ok', pages: [], emails: [], emails_by_source: {} };
  const home = await getPage(lead.website, timeout);
  if (!home.ok) { rec.status = 'home_failed:' + (home.status || home.err); rec.text = ''; return rec; }
  const base = home.finalUrl || lead.website;
  const homeStripped = htmlToText(home.html);
  const raws = [{ html: home.html, text: homeStripped }];   // RAW bodies: the email rungs read these, not the stripped text
  const homeText = homeStripped.slice(0, HOME_CAP);
  rec.pages.push({ url: base, label: 'home', text: homeText });
  // pick L2 pages
  const seen = new Set([new URL(base).pathname]);
  const scored = links(home.html, base)
    .filter(l => { try { return new URL(l.url).host === new URL(base).host; } catch { return false; } })
    .map(l => ({ ...l, score: L2_KEYWORDS.reduce((s, k) => s + (l.path.includes(k) ? 1 : 0), 0) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score);
  const picks = [];
  for (const l of scored) { const p = new URL(l.url).pathname; if (seen.has(p)) continue; seen.add(p); picks.push(l); if (picks.length >= MAX_L2) break; }
  for (const l of picks) {
    const pg = await getPage(l.url, timeout);
    if (pg.ok) {
      const stripped = htmlToText(pg.html);
      raws.push({ html: pg.html, text: stripped });
      rec.pages.push({ url: l.url, label: l.path.replace(/[^a-z]/g, ' ').trim().split(' ')[0] || 'page', text: stripped.slice(0, L2_CAP) });
    }
  }
  const combined = rec.pages.map(p => `=== ${p.label} (${p.url}) ===\n${p.text}`).join('\n\n').slice(0, TOTAL_CAP);
  const merged = mergeEmailSources([...raws.map(r => extractEmails(r.html, r.text)), emailsIn(combined).map(e => ({ email: e, source: 'text' }))]);
  rec.emails = merged.emails;                 // flat array, unchanged shape — downstream scripts read it
  rec.emails_by_source = merged.by_source;    // { address: mailto|jsonld|cfemail|tag_split|text }
  rec.text = combined;
  rec.pages_fetched = rec.pages.length;
  return rec;
}

(async () => {
  if (FIRECRAWL_RESIDUE) { await residueMode(); return; }   // paid rung alone over an existing site_text.jsonl
  const rows = parseCsv(fs.readFileSync(IN, 'utf8')).filter(r => r.length > 1);
  const H = rows.shift(); const ix = n => H.indexOf(n);
  const all = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i]]))).filter(l => l.website && /^https?:\/\//i.test(l.website));
  // a shared host (facebook.com, sites.google.com, wixsite.com, ...) is not the business's own site: nothing to
  // read there, and the lead belongs on the no-website recovery track (collapse-domains.js routes it; this is the guard).
  const sharedSkipped = all.filter(l => isSharedHost(l.website)).length;
  const leads = all.filter(l => !isSharedHost(l.website)).slice(0, LIMIT);
  if (sharedSkipped) console.log(`skipping ${sharedSkipped} lead(s) whose website is a shared host (shared-hosts.js) — route them to the no-website track`);
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, 'site_text.jsonl');
  fs.writeFileSync(outFile, '');
  let done = 0;
  const records = new Array(leads.length);      // kept in memory so late passes can merge recoveries
  const queue = leads.map((lead, i) => ({ lead, i }));
  async function worker() {
    while (queue.length) {
      const { lead, i } = queue.shift();
      const rec = await processLead(lead);      // main pass = default PAGE_TIMEOUT
      records[i] = rec;
      fs.appendFileSync(outFile, JSON.stringify(rec) + '\n'); // incremental write = crash-safe main pass
      done++;
      process.stderr.write(`. ${done}/${leads.length} ${rec.status === 'ok' ? rec.pages_fetched + 'p' : rec.status} ${rec.name}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, leads.length) }, worker));

  // ---- PASS 2: cheap free retry (default ON) — slow-but-alive sites only ----
  let retryRecovered = 0;
  if (RETRY_ON) {
    const retryIdx = records
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status.startsWith('home_failed:') && isTransient(r.status.slice('home_failed:'.length)))
      .map(({ i }) => i);
    if (retryIdx.length) {
      process.stderr.write(`\nRETRY: re-fetching ${retryIdx.length} transient failures @ ${RETRY_TIMEOUT}ms\n`);
      const rq = retryIdx.slice();
      async function rworker() {
        while (rq.length) {
          const i = rq.shift();
          const rec2 = await processLead(leads[i], RETRY_TIMEOUT);
          if (rec2.status === 'ok') { records[i] = rec2; retryRecovered++; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONC, retryIdx.length) }, rworker));
    }
  }

  // ---- PASS 3: Firecrawl rendered/anti-bot rung (opt-in) — residual failures only ----
  let firecrawlTried = 0, firecrawlRecovered = 0, firecrawl429 = 0;
  if (FIRECRAWL) {
    if (!FIRECRAWL_KEY) {
      process.stderr.write(`WARN: --firecrawl passed but FIRECRAWL_KEY not in ${ENVPATH} — skipping Firecrawl rung\n`);
    } else {
      // the dead codes are skipped here too: a 404/400/402/307 homepage costs a credit and returns nothing
      const resid = records.filter(r => r.status.startsWith('home_failed:') && !FIRECRAWL_SKIP_DEAD.test(r.status));
      const st = await firecrawlPass(resid, '');
      firecrawlTried = st.recovered + st.failed; firecrawlRecovered = st.recovered; firecrawl429 = st.rate_limited;
    }
  }

  // rewrite the file so recovered rows (and the firecrawl stamps a later --firecrawl-residue reads
  // for resumability) are merged (same one-JSON-per-line format)
  if (retryRecovered || firecrawlRecovered || firecrawlTried) {
    fs.writeFileSync(outFile, records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  }

  const homeFail = records.filter(r => r.status !== 'ok').length;
  const ownersHintEmails = records.filter(r => r.emails.length).length;
  process.stderr.write(`\nRECOVERY: retry recovered ${retryRecovered}${RETRY_ON ? '' : ' (retry disabled)'}` +
    (FIRECRAWL ? `; firecrawl recovered ${firecrawlRecovered}/${firecrawlTried} (429s ${firecrawl429})` : '') + `\n`);
  console.log(`\nDONE: ${records.length} leads → ${outFile}`);
  console.log(`  home fetch failed: ${homeFail}`);
  console.log(`  leads with at least one email on-site: ${ownersHintEmails}`);
  console.log(`  retry recovered: ${retryRecovered}${RETRY_ON ? '' : ' (disabled)'}`);
  if (FIRECRAWL) console.log(`  firecrawl recovered: ${firecrawlRecovered}/${firecrawlTried} (rate-limited 429s: ${firecrawl429})`);
})();
