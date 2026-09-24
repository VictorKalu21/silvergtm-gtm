#!/usr/bin/env node
// Cummins home-standby (RLC) dealer locator -> rows, via Wayback Machine raw captures (Tier 0.7).
// Origin (locatoradmin.cummins.com) sits behind an interactive Cloudflare Turnstile, so we read the
// archived server-rendered pages instead. The locator iframe paginates the WHOLE global list at 200
// cards/page via ?page=N when no filter params are passed, so a crawl of ?page=0..N is a full dump.
//
// Usage: node cummins.js [--locator home-generators-rlc-2023] [--out ../raw/cummins.json]
// Fetches go through curl (honours HTTPS_PROXY + system CA); cached under $CUMMINS_CACHE (default: OS tmpdir).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LOCATOR = arg('--locator', 'home-generators-rlc-2023');
const RUN = path.resolve(__dirname, '..');
const OUT = path.resolve(arg('--out', path.join(RUN, 'raw', 'cummins.json')));
// Cache holds raw dealer HTML (business PII) -> keep it OUT of the repo tree (not covered by .gitignore).
const CACHE = process.env.CUMMINS_CACHE || path.join(require('os').tmpdir(), 'cummins-wayback-cache');
fs.mkdirSync(CACHE, { recursive: true });
const PREFIX = `https://locatoradmin.cummins.com/locator-interface/${LOCATOR}`;

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function curl(url, tries = 10) {
  for (let t = 1; t <= tries; t++) {
    try {
      return execFileSync('curl', ['-sS', '--fail', '-m', '180', '-A', 'silvergtm-research/1.0', url],
        { maxBuffer: 64 << 20, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      // web.archive.org through the agent proxy resets ~50% of tunnels; back off and retry.
      if (t === tries) throw e;
      sleep(4000 * t);
    }
  }
}

const US_STATES = new Set(['ALABAMA','ALASKA','ARIZONA','ARKANSAS','CALIFORNIA','COLORADO','CONNECTICUT','DELAWARE',
  'DISTRICT OF COLUMBIA','FLORIDA','GEORGIA','HAWAII','IDAHO','ILLINOIS','INDIANA','IOWA','KANSAS','KENTUCKY','LOUISIANA',
  'MAINE','MARYLAND','MASSACHUSETTS','MICHIGAN','MINNESOTA','MISSISSIPPI','MISSOURI','MONTANA','NEBRASKA','NEVADA',
  'NEW HAMPSHIRE','NEW JERSEY','NEW MEXICO','NEW YORK','NORTH CAROLINA','NORTH DAKOTA','OHIO','OKLAHOMA','OREGON',
  'PENNSYLVANIA','RHODE ISLAND','SOUTH CAROLINA','SOUTH DAKOTA','TENNESSEE','TEXAS','UTAH','VERMONT','VIRGINIA',
  'WASHINGTON','WEST VIRGINIA','WISCONSIN','WYOMING','PUERTO RICO','GUAM','US VIRGIN ISLANDS']);

const decode = s => s.replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parsePage(html) {
  const s = html.replace(/<svg[\s\S]*?<\/svg>/g, '');
  let map = [];
  const m = s.match(/"mapData":"((?:[^"\\]|\\.)*)"/);
  if (m) { try { map = JSON.parse(JSON.parse(`"${m[1]}"`)); } catch (_) {} }
  const byMarker = {}; map.forEach((r, i) => { byMarker[i] = r; });
  const cards = s.split(/class="dealer-listing-col com_locator_entry"/).slice(1);
  return cards.map(c => {
    const g = re => { const x = c.match(re); return x ? decode(x[1]) : ''; };
    const marker = g(/data-markerid="(\d+)"/);
    const addrHtml = (c.match(/<div class="address-info">([\s\S]*?)<\/div>/) || [, ''])[1];
    const lines = addrHtml.split(/<br\s*\/?>/).map(decode).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const cm = last.match(/^(.*?),\s*([A-Z .'-]+?)\s+([A-Z0-9 -]{3,10})?$/i);
    const web = (c.match(/href="(https?:\/\/(?!maps\.google)[^"]+)"/) || [, ''])[1];
    const email = (c.match(/mailto:([^"?]+)/) || [, ''])[1];
    const mp = byMarker[marker] || {};
    return {
      cummins_id: mp.id || '',
      name: g(/class="marker-link"[^>]*>([^<]*)</),
      dealer_type: g(/<span class="location">([^<]*)</),
      phone: g(/href="tel:([^"]*)"/),
      street: lines.slice(0, -1).join(', '),
      city: cm ? cm[1].trim() : '',
      state: cm ? cm[2].trim() : '',
      postal_code: cm && cm[3] ? cm[3].trim() : '',
      address_raw: lines.join(' | '),
      website: web, email,
      lat: mp.latitude || '', lng: mp.longitude || '',
    };
  });
}

// 1. enumerate captures
const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(PREFIX)}&matchType=prefix` +
  `&output=json&fl=original,timestamp,statuscode,length&filter=statuscode:200&limit=10000`;
const cdx = JSON.parse(curl(cdxUrl)).slice(1)
  .filter(([u, , , len]) => !/ajax_form/.test(u) && +len > 5000)
  .map(([u, ts]) => ({ u, ts, page: +((u.match(/[?&]page=(\d+)/) || [, '0'])[1]) }));
console.error(`captures: ${cdx.length}`);

// 2. fetch (cached) + parse; newest capture wins per id
const rows = new Map(); const log = [];
for (const c of cdx.sort((a, b) => a.ts.localeCompare(b.ts))) {
  const f = path.join(CACHE, `${LOCATOR}_${c.ts}_p${c.page}.html`);
  let html;
  if (fs.existsSync(f)) html = fs.readFileSync(f, 'utf8');
  else { html = curl(`https://web.archive.org/web/${c.ts}id_/${c.u}`); fs.writeFileSync(f, html); sleep(1500); }
  const parsed = parsePage(html);
  log.push({ ts: c.ts, page: c.page, url: c.u, cards: parsed.length });
  for (const r of parsed) {
    const key = r.cummins_id || `${r.name}|${r.address_raw}`.toLowerCase();
    rows.set(key, { ...r, country: US_STATES.has(r.state.toUpperCase()) ? 'US' : '',
      source: 'wayback', capture_ts: c.ts, capture_url: `https://web.archive.org/web/${c.ts}/${c.u}` });
  }
}
const all = [...rows.values()];
const us = all.filter(r => r.country === 'US');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ locator: LOCATOR, pulled_at: new Date().toISOString(),
  method: 'Wayback id_ raw captures of ?page=N (200 cards/page)', captures: log,
  counts: { all: all.length, us: us.length }, rows_us: us, rows_non_us: all.filter(r => r.country !== 'US') }, null, 1));
console.error(`rows: ${all.length} total, ${us.length} US -> ${OUT}`);
