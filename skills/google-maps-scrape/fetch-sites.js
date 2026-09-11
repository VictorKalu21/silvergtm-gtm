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
 *                       [--retry-timeout <ms>] [--no-retry] [--firecrawl]
 *
 * Escalation (see IMPROVEMENTS.md): after the main plain-fetch pass, a FREE longer-timeout
 * retry (default ON) re-fetches only the transient failures (AbortError/timeout/5xx/429/reset)
 * to recover slow-but-alive sites. With --firecrawl, residual failures (403/Cloudflare/thin-JS)
 * are sent to Firecrawl's scrape API (key FIRECRAWL_KEY in .env). No raw headless Chrome rung
 * (tested useless here). 404/connection-reset after retry = accepted as dead.
 *
 * Output: <dir>/site_text.jsonl  (one JSON object per line)
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const IN = arg('in'), OUT = arg('out', '.');
const LIMIT = Number(arg('limit', 'Infinity')); // process ALL by default; old default 50 silently truncated runs
const CONC = parseInt(arg('concurrency', '10'), 10);
const CFG = arg('config', '');
const { isSharedHost } = require('./shared-hosts');
const PAGE_TIMEOUT = 8000;     // per-request abort (main pass)
const MAX_L2 = 6;              // how many second-level pages to follow
const HOME_CAP = 6000, L2_CAP = 2800, TOTAL_CAP = 18000; // char caps
// --- escalation rungs (see IMPROVEMENTS.md: rendered/anti-bot fallback) ---
const RETRY_ON = !process.argv.includes('--no-retry');        // free longer-timeout retry, default ON
const RETRY_TIMEOUT = parseInt(arg('retry-timeout', '20000'), 10); // slow-but-alive recovery
const FIRECRAWL = process.argv.includes('--firecrawl');       // opt-in paid rung, default OFF
const FIRECRAWL_TIMEOUT = 60000;
const ENVPATH = arg('env', path.join(__dirname, '.env'));
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const FIRECRAWL_KEY = loadEnv(ENVPATH).FIRECRAWL_KEY;
if (!IN) { console.error('ERROR: --in <csv> required'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const L2_DEFAULT = ['about', 'team', 'meet', 'our-story', 'story', 'staff', 'provider', 'providers', 'doctor', 'doctors', 'dentist', 'owner', 'founder', 'leadership', 'who-we-are', 'about-us', 'our-team', 'meet-the'];
let L2_EXTRA = [];
if (CFG) { try { L2_EXTRA = (JSON.parse(require('fs').readFileSync(CFG, 'utf8')).site_l2_keywords) || []; } catch (e) { console.error('WARN: could not read site_l2_keywords from ' + CFG); } }
const L2_KEYWORDS = [...new Set([...L2_DEFAULT, ...L2_EXTRA])];
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|css|js|ico|woff2?)($|\?)/i;
const SOCIAL = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|yelp|maps\.google|goo\.gl)\./i;

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
const emailsIn = txt => [...new Set((txt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(e => e.toLowerCase()).filter(e => !/\.(png|jpg|gif|webp)$/.test(e) && !/(example|sentry|wixpress|godaddy|squarespace)\./.test(e)))];

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

// Firecrawl rendered/anti-bot rung (opt-in). Returns markdown string or null.
async function firecrawlScrape(url) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), FIRECRAWL_TIMEOUT);
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Authorization': 'Bearer ' + FIRECRAWL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.data && j.data.markdown) || null;
  } catch (e) { return null; } finally { clearTimeout(to); }
}

async function processLead(lead, timeout) {
  const rec = { place_id: lead.place_id, name: lead.name, website: lead.website, neighborhood: lead.neighborhood, city: lead.city, phone: lead.phone_number, full_address: lead.full_address, status: 'ok', pages: [], emails: [] };
  const home = await getPage(lead.website, timeout);
  if (!home.ok) { rec.status = 'home_failed:' + (home.status || home.err); rec.text = ''; return rec; }
  const base = home.finalUrl || lead.website;
  const homeText = htmlToText(home.html).slice(0, HOME_CAP);
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
    if (pg.ok) rec.pages.push({ url: l.url, label: l.path.replace(/[^a-z]/g, ' ').trim().split(' ')[0] || 'page', text: htmlToText(pg.html).slice(0, L2_CAP) });
  }
  const combined = rec.pages.map(p => `=== ${p.label} (${p.url}) ===\n${p.text}`).join('\n\n').slice(0, TOTAL_CAP);
  rec.emails = emailsIn(combined).slice(0, 8);
  rec.text = combined;
  rec.pages_fetched = rec.pages.length;
  return rec;
}

(async () => {
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
  let firecrawlTried = 0, firecrawlRecovered = 0;
  if (FIRECRAWL) {
    if (!FIRECRAWL_KEY) {
      process.stderr.write(`WARN: --firecrawl passed but FIRECRAWL_KEY not in ${ENVPATH} — skipping Firecrawl rung\n`);
    } else {
      const residIdx = records.map((r, i) => ({ r, i })).filter(({ r }) => r.status.startsWith('home_failed:')).map(({ i }) => i);
      if (residIdx.length) {
        process.stderr.write(`\nFIRECRAWL: attempting ${residIdx.length} residual failures\n`);
        const fq = residIdx.slice();
        async function fworker() {
          while (fq.length) {
            const i = fq.shift();
            firecrawlTried++;
            const rec = records[i];
            const md = await firecrawlScrape(rec.website);
            if (md && md.trim()) {
              const text = md.slice(0, TOTAL_CAP);
              rec.status = 'ok';
              rec.pages = [{ url: rec.website, label: 'home', text: text.slice(0, HOME_CAP) }];
              rec.emails = emailsIn(text).slice(0, 8);
              rec.text = text;
              rec.pages_fetched = rec.pages.length;
              rec.source = 'firecrawl';
              firecrawlRecovered++;
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, residIdx.length) }, fworker)); // gentler concurrency on paid API
      }
    }
  }

  // rewrite the file so recovered rows are merged (same one-JSON-per-line format)
  if (retryRecovered || firecrawlRecovered) {
    fs.writeFileSync(outFile, records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  }

  const homeFail = records.filter(r => r.status !== 'ok').length;
  const ownersHintEmails = records.filter(r => r.emails.length).length;
  process.stderr.write(`\nRECOVERY: retry recovered ${retryRecovered}${RETRY_ON ? '' : ' (retry disabled)'}` +
    (FIRECRAWL ? `; firecrawl recovered ${firecrawlRecovered}/${firecrawlTried}` : '') + `\n`);
  console.log(`\nDONE: ${records.length} leads → ${outFile}`);
  console.log(`  home fetch failed: ${homeFail}`);
  console.log(`  leads with at least one email on-site: ${ownersHintEmails}`);
  console.log(`  retry recovered: ${retryRecovered}${RETRY_ON ? '' : ' (disabled)'}`);
  if (FIRECRAWL) console.log(`  firecrawl recovered: ${firecrawlRecovered}/${firecrawlTried}`);
})();
