#!/usr/bin/env node
/*
 * yp-search.js :: Yellow Pages listing scrape (universe cross-check for the Maps list).
 *
 * yellowpages.com search pages are server-rendered (probed 2026-10-07: HTTP 200, 320 KB, 30 cards per
 * page, "Showing 1-30 of 1108", `?page=N` pagination) — Tier 1 of web-scrape-triage, no key. A card
 * carries: ypid, name, categories, website (direct, no redirect), phone, street address, locality
 * ("Phoenix, AZ 85040"), claimed status. It does NOT carry the owner (the detail page has no
 * principal either, probed the same day) — YP is a UNIVERSE source, not a people source: it finds
 * businesses Maps missed or mis-categorised, and gives a phone + site for the no-website track.
 *
 * Usage:
 *   node yp-search.js --terms "plumber,electrician" --locations "Phoenix, AZ|Tempe, AZ" --out <dir>
 *                     [--max-pages 20] [--delay 1200] [--resume]
 * Output: <dir>/yp_listings.csv (deduped on ypid; which term×location found it in `found_by`),
 *         <dir>/yp_state.json (pages done, for --resume), summary JSON on stdout.
 *
 * Sequential with a politeness delay by design; a 403/429/503 stops the run (it is a block, not a
 * flake) and the summary says so. Join to the Maps list downstream on phone (last 10 digits) first,
 * then website root domain, then name+zip — place_id does not exist here.
 */
const fs = require('fs');
const path = require('path');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const PAGE_SIZE = 30;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const csvCell = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const text = html => unesc(String(html || '').replace(/<[^>]+>/g, ' '));

function searchUrl(term, loc, page) {
  return `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(term)}&geo_location_terms=${encodeURIComponent(loc)}` + (page > 1 ? `&page=${page}` : '');
}

// "Showing 1-30 of 1108" -> 1108 ; null when the page has no count (0 results or a different template)
function parseTotal(html) {
  const m = String(html).match(/Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// One object per <div class="result" ...> card. Fields are empty strings when absent.
function parseCards(html) {
  const out = [];
  const re = /<div class="result"\s+id="lid-(\d+)"([^>]*)>([\s\S]*?)(?=<div class="result"\s+id="lid-|<div class="pagination|<\/main>|$)/g;
  let m;
  while ((m = re.exec(String(html)))) {
    const ypid = m[1], attrs = m[2], body = m[3];
    const g = (rx) => { const x = body.match(rx); return x ? x[1] : ''; };
    const loc = text(g(/class="locality">([^<]*)</));
    const lm = loc.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/);
    const cats = [...body.matchAll(/class="categories">([\s\S]*?)<\/div>/g)].flatMap(x => [...x[1].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map(y => unesc(y[1]))).filter(Boolean);
    const claimed = /mip_claimed_status&quot;:&quot;mip_claimed&quot;|"mip_claimed_status":"mip_claimed"/.test(attrs + body);
    out.push({
      ypid,
      name: text(g(/class="business-name"[^>]*>([\s\S]*?)<\/a>/)),
      yp_url: (() => { const p = g(/class="business-name"[^>]*href="([^"]*)"/); return p ? 'https://www.yellowpages.com' + unesc(p).split('?')[0] : ''; })(),
      phone: text(g(/class="phones phone primary">([^<]*)</)),
      website: unesc(g(/class="track-visit-website"[^>]*href="([^"]*)"/)),
      street_address: text(g(/class="street-address">([^<]*)</)),
      locality: loc, city: lm ? lm[1] : loc.replace(/,\s*[A-Z]{2}.*$/, ''), state: lm ? lm[2] : '', zip: lm ? lm[3] : '',
      categories: cats.join('|'),
      claimed: claimed ? 'yes' : '',
      snippet: text(g(/class="snippet">[\s\S]*?<span>([\s\S]*?)<\/span>/)).replace(/^From Business:\s*/i, '').slice(0, 300),
    });
  }
  return out;
}

const COLS = ['ypid', 'name', 'phone', 'website', 'street_address', 'locality', 'city', 'state', 'zip', 'categories', 'claimed', 'yp_url', 'found_by', 'snippet'];
function writeCsv(file, rows) {
  fs.writeFileSync(file, [COLS.join(',')].concat(rows.map(r => COLS.map(c => csvCell(r[c])).join(','))).join('\n') + '\n');
}

module.exports = { parseCards, parseTotal, searchUrl, COLS };
if (require.main !== module) return;

const TERMS = String(arg('terms', '')).split(',').map(s => s.trim()).filter(Boolean);
const LOCS = String(arg('locations', '')).split('|').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), MAX_PAGES = parseInt(arg('max-pages', '20'), 10), DELAY = parseInt(arg('delay', '1200'), 10);
const RESUME = process.argv.includes('--resume');
if (!TERMS.length || !LOCS.length || !OUT) { console.error('ERROR: --terms "a,b" --locations "City, ST|City2, ST" --out <dir> required'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const CSV = path.join(OUT, 'yp_listings.csv'), STATE = path.join(OUT, 'yp_state.json');
const state = RESUME && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { done: {}, listings: {} };

async function fetchHtml(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, signal: ctrl.signal, redirect: 'follow' });
    return { status: r.status, html: await r.text() };
  } catch (e) { return { status: 0, err: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(t); }
}

(async () => {
  const summary = { combos: TERMS.length * LOCS.length, pages_fetched: 0, cards: 0, unique: 0, blocked: null, errors: [] };
  outer: for (const term of TERMS) for (const loc of LOCS) {
    let total = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const key = `${term}|${loc}|${page}`;
      if (state.done[key]) { if (state.done[key].total != null) total = state.done[key].total; if (total != null && page * PAGE_SIZE >= total) break; continue; }
      const url = searchUrl(term, loc, page);
      const r = await fetchHtml(url);
      if (r.status === 403 || r.status === 429 || r.status === 503) { summary.blocked = { status: r.status, at: key }; process.stderr.write(`BLOCKED ${r.status} at ${key} — stopping; wait and --resume later\n`); break outer; }
      if (r.status !== 200) { summary.errors.push({ key, status: r.status, err: r.err }); process.stderr.write(`WARN ${r.status || r.err} ${key}\n`); await sleep(DELAY * 2); continue; }
      summary.pages_fetched++;
      const cards = parseCards(r.html); total = parseTotal(r.html);
      for (const c of cards) {
        const prev = state.listings[c.ypid];
        const fb = `${term} @ ${loc}`;
        if (prev) { if (!prev.found_by.split(';').includes(fb)) prev.found_by += ';' + fb; }
        else state.listings[c.ypid] = { ...c, found_by: fb };
      }
      summary.cards += cards.length;
      state.done[key] = { total, cards: cards.length, at: new Date().toISOString() };
      fs.writeFileSync(STATE, JSON.stringify(state));
      process.stderr.write(`. ${key} cards=${cards.length} total=${total ?? '?'} unique=${Object.keys(state.listings).length}\n`);
      if (!cards.length || (total != null && page * PAGE_SIZE >= total)) break;
      await sleep(DELAY);
    }
  }
  const rows = Object.values(state.listings);
  writeCsv(CSV, rows);
  summary.unique = rows.length; summary.out = CSV;
  console.log(JSON.stringify(summary));
  process.exit(summary.blocked ? 3 : 0);
})();
