#!/usr/bin/env node
// Keyless ATS job-board puller.
//
//   node scripts/ats-pull.mjs --registry <registry.csv> --out <postings.csv> \
//        --since 2026-08-08 [--ats greenhouse,lever,...] [--limit N] [--concurrency 4]
//
// Reads a registry of {ats,token,region,...}, pulls each board from its public
// (keyless) JSON endpoint, keeps only postings whose title matches the GTM/RevOps
// title matcher and whose publish date is >= --since, and writes:
//   <out>             one row per matched posting
//   <out>.boards.csv  one row per board (status/jobs_total/jobs_matched)
//
// Resumable: boards already recorded ok|dead in <out>.boards.csv are skipped.
// workday rows are skipped entirely (second pass, different mechanism).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const csv = require('./csv.js'); // RFC-4180 parse/write — board feeds have commas in fields

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const a = { concurrency: 4, limit: 0, ats: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--registry') a.registry = v();
    else if (k === '--out') a.out = v();
    else if (k === '--since') a.since = v();
    else if (k === '--ats') a.ats = v().split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (k === '--limit') a.limit = parseInt(v(), 10) || 0;
    else if (k === '--concurrency') a.concurrency = parseInt(v(), 10) || 4;
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown arg: ${k}`);
  }
  return a;
}

const USAGE = `usage: node scripts/ats-pull.mjs --registry <registry.csv> --out <postings.csv> --since YYYY-MM-DD
            [--ats greenhouse,lever,ashby,smartrecruiters,recruitee] [--limit N] [--concurrency 4]`;

// ---------------------------------------------------------------- title matcher

const ABBREV = [
  [/\bsr\b/g, 'senior'],
  [/\bsnr\b/g, 'senior'],
  [/\bmgr\b/g, 'manager'],
  [/\bdir\b/g, 'director'],
  [/\bgo to market\b/g, 'go to market'], // no-op, kept for clarity: "ops" deliberately NOT expanded
];

export function normalizeTitle(raw) {
  let t = String(raw == null ? '' : raw).toLowerCase();
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
  t = t.replace(/[^a-z0-9]+/g, ' ');           // punctuation -> space
  t = t.replace(/\s+/g, ' ').trim();
  for (const [re, to] of ABBREV) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

// Core phrases: function + ops must be adjacent (or one word apart, e.g. "demand gen ops").
// Explicit list, deliberately NOT loose word presence — "sales" + "customer operations"
// elsewhere in a title must not match.
const CORE_PHRASES = [
  ['revenue operations', 'revops'],
  ['revenue ops', 'revops'],
  ['rev ops', 'revops'],
  ['revops', 'revops'],
  ['revenue systems', 'revops'],
  ['gtm operations', 'revops'],
  ['gtm ops', 'revops'],
  ['go to market operations', 'revops'],
  ['go to market ops', 'revops'],
  ['marketing operations', 'mktops'],
  ['marketing ops', 'mktops'],
  ['marketing automation', 'mktops'],
  ['demand generation operations', 'mktops'],
  ['demand generation ops', 'mktops'],
  ['demand gen operations', 'mktops'],
  ['demand gen ops', 'mktops'],
  ['sales operations', 'salesops'],
  ['sales ops', 'salesops'],
];
// longest first so "revenue operations" wins over "revenue ops" fragments
const CORE_SORTED = [...CORE_PHRASES].sort((a, b) => b[0].length - a[0].length);
const CORE_RE = new RegExp('\\b(' + CORE_SORTED.map(p => p[0].replace(/ /g, '\\s')).join('|') + ')\\b');

const LEVEL_RE = /\b(senior manager|director|manager|lead|head)\b/;

const EXCLUDE_RE = new RegExp('\\b(' + [
  'analyst', 'coordinator', 'specialist', 'associate', 'intern',
  'vp', 'vice president', 'svp', 'evp', 'chief',
  'engineer', 'engineering', 'developer', 'architect',
  'consultant', 'executive assistant',
  'customer success', 'support', 'product',
  'account', 'finance', 'hr', 'people', 'talent',
  'recruit', 'recruiter', 'recruiting', 'recruitment',
].join('|') + ')\\b');

export function matchTitle(raw) {
  const t = normalizeTitle(raw);
  const core = CORE_RE.exec(t);
  if (!core) return null;
  if (EXCLUDE_RE.test(t)) return null;
  const hasLevel = LEVEL_RE.test(t);

  const phrase = core[1].replace(/\s+/g, ' ');
  const bucket = (CORE_SORTED.find(p => p[0] === phrase) || [null, 'revops'])[1];

  let seniority;
  if (!hasLevel) seniority = 'unspecified'; // core phrase, no level word (e.g. bare "Revenue Operations"); kept as an edge case
  else if (/\bdirector\b/.test(t)) seniority = 'director';
  else if (/\bsenior\b.*\bmanager\b/.test(t)) seniority = 'senior_manager';
  else if (/\b(lead|head)\b/.test(t)) seniority = 'lead';
  else seniority = 'manager';

  return { title_bucket: bucket, seniority, normalized: t, phrase };
}

// ---------------------------------------------------------------- country

const TIER1 = new Set(['US', 'CA', 'GB', 'IE', 'AU', 'NZ']);
const TIER2 = new Set(['DE', 'FR', 'NL', 'SE', 'DK', 'NO', 'FI', 'CH', 'AT', 'BE', 'ES', 'IT', 'PT']);

const COUNTRY_NAMES = {
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US', 'u s a': 'US', america: 'US',
  canada: 'CA', 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', britain: 'GB',
  england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  ireland: 'IE', eire: 'IE', australia: 'AU', 'new zealand': 'NZ',
  germany: 'DE', deutschland: 'DE', france: 'FR', netherlands: 'NL', holland: 'NL', nederland: 'NL',
  sweden: 'SE', sverige: 'SE', denmark: 'DK', danmark: 'DK', norway: 'NO', norge: 'NO',
  finland: 'FI', switzerland: 'CH', schweiz: 'CH', austria: 'AT', osterreich: 'AT',
  belgium: 'BE', spain: 'ES', espana: 'ES', italy: 'IT', italia: 'IT', portugal: 'PT',
  poland: 'PL', polska: 'PL', czechia: 'CZ', 'czech republic': 'CZ', romania: 'RO', hungary: 'HU',
  greece: 'GR', ukraine: 'UA', bulgaria: 'BG', croatia: 'HR', serbia: 'RS', slovakia: 'SK',
  slovenia: 'SI', estonia: 'EE', latvia: 'LV', lithuania: 'LT', iceland: 'IS', luxembourg: 'LU',
  india: 'IN', singapore: 'SG', japan: 'JP', china: 'CN', 'hong kong': 'HK', taiwan: 'TW',
  'south korea': 'KR', korea: 'KR', malaysia: 'MY', indonesia: 'ID', vietnam: 'VN', thailand: 'TH',
  philippines: 'PH', israel: 'IL', turkey: 'TR', turkiye: 'TR', 'united arab emirates': 'AE', uae: 'AE',
  'saudi arabia': 'SA', egypt: 'EG', 'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', morocco: 'MA',
  brazil: 'BR', brasil: 'BR', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
  'costa rica': 'CR', uruguay: 'UY', russia: 'RU',
};

const CITY_COUNTRY = {
  london: 'GB', manchester: 'GB', edinburgh: 'GB', bristol: 'GB', cambridge: 'GB', leeds: 'GB', glasgow: 'GB',
  dublin: 'IE', cork: 'IE',
  toronto: 'CA', vancouver: 'CA', montreal: 'CA', ottawa: 'CA', calgary: 'CA', waterloo: 'CA',
  sydney: 'AU', melbourne: 'AU', brisbane: 'AU', perth: 'AU', canberra: 'AU',
  auckland: 'NZ', wellington: 'NZ',
  berlin: 'DE', munich: 'DE', munchen: 'DE', hamburg: 'DE', frankfurt: 'DE', cologne: 'DE',
  koln: 'DE', dusseldorf: 'DE', stuttgart: 'DE', leipzig: 'DE',
  paris: 'FR', lyon: 'FR', marseille: 'FR', toulouse: 'FR', bordeaux: 'FR', lille: 'FR', nantes: 'FR',
  montpellier: 'FR', annecy: 'FR',
  amsterdam: 'NL', utrecht: 'NL', rotterdam: 'NL', eindhoven: 'NL', 'the hague': 'NL', groningen: 'NL',
  stockholm: 'SE', gothenburg: 'SE', malmo: 'SE',
  copenhagen: 'DK', kobenhavn: 'DK', aarhus: 'DK',
  oslo: 'NO', helsinki: 'FI', tampere: 'FI',
  zurich: 'CH', geneva: 'CH', lausanne: 'CH', basel: 'CH', zug: 'CH',
  vienna: 'AT', wien: 'AT', graz: 'AT',
  brussels: 'BE', antwerp: 'BE', ghent: 'BE',
  madrid: 'ES', barcelona: 'ES', valencia: 'ES', malaga: 'ES', seville: 'ES',
  milan: 'IT', milano: 'IT', rome: 'IT', roma: 'IT', turin: 'IT', bologna: 'IT',
  lisbon: 'PT', lisboa: 'PT', porto: 'PT',
  warsaw: 'PL', warszawa: 'PL', krakow: 'PL', wroclaw: 'PL', gdansk: 'PL',
  prague: 'CZ', praha: 'CZ', brno: 'CZ', budapest: 'HU', bucharest: 'RO', cluj: 'RO',
  athens: 'GR', sofia: 'BG', zagreb: 'HR', belgrade: 'RS', bratislava: 'SK', ljubljana: 'SI',
  tallinn: 'EE', riga: 'LV', vilnius: 'LT', reykjavik: 'IS',
  kyiv: 'UA', kiev: 'UA', lviv: 'UA',
  bangalore: 'IN', bengaluru: 'IN', mumbai: 'IN', 'new delhi': 'IN', gurgaon: 'IN', gurugram: 'IN',
  hyderabad: 'IN', pune: 'IN', chennai: 'IN', noida: 'IN',
  tokyo: 'JP', osaka: 'JP', seoul: 'KR', taipei: 'TW', shanghai: 'CN', beijing: 'CN', shenzhen: 'CN',
  'kuala lumpur': 'MY', jakarta: 'ID', manila: 'PH', 'ho chi minh city': 'VN', hanoi: 'VN', bangkok: 'TH',
  'tel aviv': 'IL', jerusalem: 'IL', haifa: 'IL',
  dubai: 'AE', 'abu dhabi': 'AE', riyadh: 'SA', istanbul: 'TR', ankara: 'TR', cairo: 'EG',
  'cape town': 'ZA', johannesburg: 'ZA', lagos: 'NG', nairobi: 'KE', casablanca: 'MA',
  'sao paulo': 'BR', 'rio de janeiro': 'BR', 'mexico city': 'MX', guadalajara: 'MX',
  'buenos aires': 'AR', santiago: 'CL', bogota: 'CO', lima: 'PE', 'san jose costa rica': 'CR',
};

const US_STATES = {
  alabama: 1, alaska: 1, arizona: 1, arkansas: 1, california: 1, colorado: 1, connecticut: 1,
  delaware: 1, florida: 1, georgia: 0, hawaii: 1, idaho: 1, illinois: 1, indiana: 1, iowa: 1,
  kansas: 1, kentucky: 1, louisiana: 1, maine: 1, maryland: 1, massachusetts: 1, michigan: 1,
  minnesota: 1, mississippi: 1, missouri: 1, montana: 1, nebraska: 1, nevada: 1,
  'new hampshire': 1, 'new jersey': 1, 'new mexico': 1, 'new york': 1, 'north carolina': 1,
  'north dakota': 1, ohio: 1, oklahoma: 1, oregon: 1, pennsylvania: 1, 'rhode island': 1,
  'south carolina': 1, 'south dakota': 1, tennessee: 1, texas: 1, utah: 1, vermont: 1,
  virginia: 1, washington: 1, 'west virginia': 1, wisconsin: 1, wyoming: 1,
  'district of columbia': 1, 'washington dc': 1,
};
// "georgia" is ambiguous (US state vs country) — only counted via ", GA" abbrev or a US city.

const US_STATE_ABBR = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS ' +
  'MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));

const US_CITIES = ('san francisco,new york,new york city,nyc,brooklyn,seattle,austin,boston,chicago,denver,' +
  'atlanta,los angeles,san diego,dallas,houston,miami,phoenix,portland,san jose,salt lake city,' +
  'minneapolis,philadelphia,detroit,nashville,charlotte,raleigh,durham,columbus,pittsburgh,san mateo,' +
  'palo alto,mountain view,sunnyvale,redwood city,santa monica,bellevue,boulder,irvine,arlington,' +
  'bay area,silicon valley,cambridge ma,sacramento,las vegas,orlando,tampa,st louis,kansas city,' +
  'indianapolis,cincinnati,milwaukee,baltimore,richmond,plano,scottsdale,chandler,tempe,mclean,reston')
  .split(',');

const ISO2_RE = /^[A-Za-z]{2}$/;

function normLoc(s) {
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const hasPhrase = (hay, needle) => new RegExp('\\b' + needle.replace(/ /g, '\\s') + '\\b').test(hay);

/** Best-effort ISO-2. explicit = an API-supplied country field (code or name). */
export function guessCountry(locationRaw, explicit) {
  if (explicit) {
    const e = String(explicit).trim();
    if (ISO2_RE.test(e)) return e.toUpperCase();
    const n = normLoc(e);
    if (COUNTRY_NAMES[n]) return COUNTRY_NAMES[n];
    for (const [name, iso] of Object.entries(COUNTRY_NAMES)) if (hasPhrase(n, name)) return iso;
  }
  const raw = String(locationRaw == null ? '' : locationRaw);
  const n = normLoc(raw);
  if (!n) return '';

  // Multi-location strings ("San Francisco, New York, Toronto, Remote in the US") are
  // common and ambiguous. Collect every geographic signal with its position and let the
  // LEFTMOST one win (boards list the primary location first); longer phrase breaks ties.
  const hits = [];
  const add = (needle, iso) => {
    const m = new RegExp('\\b' + needle.replace(/ /g, '\\s') + '\\b').exec(n);
    if (m) hits.push({ at: m.index, len: needle.length, iso });
  };
  for (const [name, iso] of Object.entries(COUNTRY_NAMES)) add(name, iso);
  for (const st of Object.keys(US_STATES)) if (US_STATES[st]) add(st, 'US');
  for (const c of US_CITIES) add(c, 'US');
  for (const [c, iso] of Object.entries(CITY_COUNTRY)) add(c, iso);

  // ", CA" style state abbreviations (checked on the raw string, uppercase only)
  const ab = /,\s*([A-Z]{2})\b/g;
  for (let m; (m = ab.exec(raw));) {
    if (US_STATE_ABBR.has(m[1])) hits.push({ at: normLoc(raw.slice(0, m.index)).length, len: 2, iso: 'US' });
  }

  if (!hits.length) return '';
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  return hits[0].iso;
}

export function countryTier(iso2) {
  if (!iso2) return 'unknown';
  if (TIER1.has(iso2)) return '1';
  if (TIER2.has(iso2)) return '2';
  return '3';
}

// ---------------------------------------------------------------- http

const TIMEOUT_MS = 20000;
const HOST_SPACING_MS = 250;
const RETRY_BACKOFF_MS = 2000;
const RATE_LIMIT_BACKOFF_MS = 30000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const hostChain = new Map(); // host -> promise tail, enforces >=250ms between requests per host
function pace(host) {
  const prev = hostChain.get(host) || Promise.resolve();
  let release;
  const next = new Promise(r => { release = r; });
  hostChain.set(host, prev.then(() => next));
  return prev.then(() => () => { setTimeout(release, HOST_SPACING_MS); });
}

class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status} ${url}`); this.status = status; }
}

/** Returns parsed JSON. Throws HttpError (with .status) or Error('network:...'). */
async function fetchJson(url, { attempt = 0, rateLimited = false } = {}) {
  const host = new URL(url).host;
  const done = await pace(host);
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json', 'user-agent': 'silvergtm-ats-pull/1.0' },
    });
  } catch (err) {
    done();
    if (attempt < 1) { await sleep(RETRY_BACKOFF_MS); return fetchJson(url, { attempt: attempt + 1, rateLimited }); }
    throw new Error(`network: ${err.message}`);
  }

  if (res.status === 429) {
    done();
    if (!rateLimited) { await sleep(RATE_LIMIT_BACKOFF_MS); return fetchJson(url, { attempt, rateLimited: true }); }
    throw new HttpError(429, url);
  }
  if (res.status >= 500) {
    done();
    if (attempt < 1) { await sleep(RETRY_BACKOFF_MS); return fetchJson(url, { attempt: attempt + 1, rateLimited }); }
    throw new HttpError(res.status, url);
  }
  if (!res.ok) { done(); throw new HttpError(res.status, url); }

  try {
    const text = await res.text();
    done();
    return JSON.parse(text);
  } catch (err) {
    done();
    throw new Error(`parse: ${err.message}`);
  }
}

// ---------------------------------------------------------------- dates

/** -> ISO string, or '' if unparseable. Accepts epoch ms, ISO, "YYYY-MM-DD HH:MM:SS UTC". */
function toIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') { const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); }
  let s = String(v).trim();
  if (/^\d{10,}$/.test(s)) { const d = new Date(Number(s)); return isNaN(d) ? '' : d.toISOString(); }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(s)) s = s.replace(' ', 'T').replace(' UTC', 'Z');
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString();
}

// ---------------------------------------------------------------- ATS adapters
// Each adapter: async (token, region) -> { company_name, name_source, jobs: [normalized] }
// Normalized job: { job_id,title_raw,published_at,location_raw,country_hint,remote,
//                   department,salary_min,salary_max,salary_currency,apply_url }

const REMOTE_RE = /\bremote\b/i;
const remoteFlag = (flag, locationRaw) => {
  if (flag === true) return 'yes';
  if (flag === false) return REMOTE_RE.test(locationRaw || '') ? 'yes' : 'no';
  return REMOTE_RE.test(locationRaw || '') ? 'yes' : 'unknown';
};

const adapters = {
  async greenhouse(token) {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`);
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    let company = jobs.find(j => j.company_name)?.company_name || '';
    let nameSource = company ? 'board' : 'token';
    if (!company) {
      try {
        const board = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`);
        if (board && board.name) { company = board.name; nameSource = 'board'; }
      } catch { /* board-meta failure must not kill the board */ }
    }
    if (!company) company = token;

    return {
      company_name: company,
      name_source: nameSource,
      jobs: jobs.map(j => {
        const loc = j.location?.name || '';
        return {
          job_id: String(j.id ?? ''),
          title_raw: j.title || '',
          published_at: toIso(j.first_published || j.updated_at),
          location_raw: loc,
          country_hint: '',
          remote: remoteFlag(undefined, loc),
          // content=false omits departments/offices; filled per matched job below
          department: (j.departments || []).map(d => d.name).filter(Boolean).join(' / '),
          salary_min: '', salary_max: '', salary_currency: '',
          apply_url: j.absolute_url || '',
          _gh_detail: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${j.id}`,
        };
      }),
    };
  },

  async lever(token, region) {
    const base = String(region || '').toLowerCase() === 'eu' ? 'https://api.eu.lever.co' : 'https://api.lever.co';
    const payload = await fetchJson(`${base}/v0/postings/${encodeURIComponent(token)}?mode=json`);
    const jobs = Array.isArray(payload) ? payload : [];
    return {
      company_name: token,
      name_source: 'token', // lever's public payload carries no company name
      jobs: jobs.map(j => {
        const c = j.categories || {};
        const locs = [c.location, ...(c.allLocations || [])].filter(Boolean);
        const loc = [...new Set(locs)].join('; ');
        const sr = j.salaryRange || {};
        return {
          job_id: String(j.id ?? ''),
          title_raw: j.text || '',
          published_at: toIso(j.createdAt),
          location_raw: loc,
          country_hint: j.country || '',
          remote: remoteFlag(
            j.workplaceType ? /remote/i.test(j.workplaceType) : undefined, loc),
          department: [c.department, c.team].filter(Boolean).join(' / '),
          salary_min: sr.min ?? '', salary_max: sr.max ?? '', salary_currency: sr.currency || '',
          apply_url: j.hostedUrl || j.applyUrl || '',
        };
      }),
    };
  },

  async ashby(token) {
    const payload = await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`);
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const company = payload.name || payload.organizationName || token;
    return {
      company_name: company,
      name_source: (payload.name || payload.organizationName) ? 'board' : 'token',
      jobs: jobs.map(j => {
        const secondary = (j.secondaryLocations || []).map(s => s.location).filter(Boolean);
        const loc = [j.location, ...secondary].filter(Boolean).join('; ');
        const salary = pickAshbySalary(j.compensation);
        return {
          job_id: String(j.id ?? ''),
          title_raw: (j.title || '').trim(),
          published_at: toIso(j.publishedAt),
          location_raw: loc,
          country_hint: j.address?.postalAddress?.addressCountry
            || (j.secondaryLocations || [])[0]?.address?.postalAddress?.addressCountry || '',
          remote: remoteFlag(typeof j.isRemote === 'boolean' ? j.isRemote : undefined, loc),
          department: [j.department, j.team].filter(Boolean).join(' / '),
          ...salary,
          apply_url: j.jobUrl || j.applyUrl || '',
        };
      }),
    };
  },

  async smartrecruiters(token) {
    const limit = 100;
    let offset = 0, all = [], company = '';
    for (;;) {
      const payload = await fetchJson(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=${limit}&offset=${offset}`);
      const content = Array.isArray(payload.content) ? payload.content : [];
      all = all.concat(content);
      if (!company) company = content.find(p => p.company?.name)?.company?.name || '';
      if (content.length < limit) break;
      offset += limit;
      if (offset > 10000) break; // hard stop
    }
    return {
      company_name: company || token,
      name_source: company ? 'board' : 'token',
      jobs: all.map(p => {
        const l = p.location || {};
        const loc = l.fullLocation || [l.city, l.region, l.country].filter(Boolean).join(', ');
        return {
          job_id: String(p.id ?? p.ref ?? ''),
          title_raw: p.name || '',
          published_at: toIso(p.releasedDate),
          location_raw: loc,
          country_hint: l.country || '',
          remote: remoteFlag(typeof l.remote === 'boolean' ? l.remote : undefined, loc),
          department: p.department?.label || '',
          salary_min: '', salary_max: '', salary_currency: '',
          apply_url: `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}/${p.id}`,
        };
      }),
    };
  },

  async recruitee(token) {
    const payload = await fetchJson(`https://${encodeURIComponent(token)}.recruitee.com/api/offers/`);
    const offers = Array.isArray(payload.offers) ? payload.offers : [];
    const company = offers.find(o => o.company_name)?.company_name || '';
    return {
      company_name: company || token,
      name_source: company ? 'board' : 'token',
      jobs: offers.map(o => {
        const loc = o.location || [o.city, o.country].filter(Boolean).join(', ');
        const s = o.salary || {};
        return {
          job_id: String(o.id ?? ''),
          title_raw: o.title || '',
          published_at: toIso(o.published_at),
          location_raw: loc,
          country_hint: o.country_code || o.country || '',
          remote: remoteFlag(typeof o.remote === 'boolean' ? o.remote : undefined, loc),
          department: o.department || '',
          salary_min: s.min ?? '', salary_max: s.max ?? '', salary_currency: s.currency || '',
          apply_url: o.careers_url || o.careers_apply_url || '',
        };
      }),
    };
  },
};

function pickAshbySalary(comp) {
  const empty = { salary_min: '', salary_max: '', salary_currency: '' };
  if (!comp) return empty;
  const tiers = comp.compensationTiers || [];
  for (const t of tiers) {
    for (const c of (t.components || [])) {
      if (c.compensationType === 'Salary' && (c.minValue != null || c.maxValue != null)) {
        return { salary_min: c.minValue ?? '', salary_max: c.maxValue ?? '', salary_currency: c.currencyCode || '' };
      }
    }
  }
  return empty;
}

// ---------------------------------------------------------------- output

const POSTING_HEADER = ['ats', 'token', 'company_name', 'name_source', 'job_id', 'title_raw',
  'title_bucket', 'seniority', 'published_at', 'location_raw', 'country', 'country_tier',
  'remote', 'department', 'salary_min', 'salary_max', 'salary_currency', 'apply_url'];
const BOARD_HEADER = ['ats', 'token', 'status', 'jobs_total', 'jobs_matched', 'company_name', 'fetched_at'];

class Appender {
  constructor(file, header) {
    this.file = file;
    const fresh = !fs.existsSync(file) || fs.statSync(file).size === 0;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.fd = fs.openSync(file, 'a');
    if (fresh) fs.writeSync(this.fd, csv.write([header]) + '\n');
  }
  rows(rows) { if (rows.length) fs.writeSync(this.fd, csv.write(rows) + '\n'); }
  close() { fs.closeSync(this.fd); }
}

function readDoneBoards(file) {
  const done = new Set();
  if (!fs.existsSync(file)) return done;
  const rows = csv.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return done;
  const head = rows[0].map(h => h.trim());
  const ia = head.indexOf('ats'), it = head.indexOf('token'), is = head.indexOf('status');
  if (ia < 0 || it < 0 || is < 0) return done;
  for (const r of rows.slice(1)) {
    const st = (r[is] || '').trim();
    if (st === 'ok' || st === 'dead') done.add(`${(r[ia] || '').trim()}|${(r[it] || '').trim()}`);
  }
  return done;
}

// ---------------------------------------------------------------- registry

function readRegistry(file, atsFilter) {
  const rows = csv.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const idx = name => head.indexOf(name);
  const ia = idx('ats'), it = idx('token'), ir = idx('region');
  if (ia < 0 || it < 0) throw new Error('registry.csv must have ats and token columns');
  const out = [];
  const seen = new Set();
  for (const r of rows.slice(1)) {
    const ats = (r[ia] || '').trim().toLowerCase();
    const token = (r[it] || '').trim();
    const region = ir >= 0 ? (r[ir] || '').trim() : '';
    if (!ats || !token) continue;
    if (ats === 'workday') continue;               // second pass
    if (!adapters[ats]) continue;                   // unknown ATS
    if (atsFilter && !atsFilter.includes(ats)) continue;
    const key = `${ats}|${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ats, token, region });
  }
  return out;
}

// ---------------------------------------------------------------- main

async function pool(items, size, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    for (;;) {
      const k = i++;
      if (k >= items.length) return;
      await worker(items[k], k);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }
  if (!args.registry || !args.out || !args.since) { console.error(USAGE); process.exitCode = 2; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.since)) throw new Error('--since must be YYYY-MM-DD');
  const sinceMs = Date.parse(args.since + 'T00:00:00Z');

  const boardsFile = `${args.out}.boards.csv`;
  const done = readDoneBoards(boardsFile);

  let boards = readRegistry(args.registry, args.ats);
  const totalInRegistry = boards.length;
  boards = boards.filter(b => !done.has(`${b.ats}|${b.token}`));
  const skipped = totalInRegistry - boards.length;
  if (args.limit > 0) boards = boards.slice(0, args.limit);

  const postingsOut = new Appender(args.out, POSTING_HEADER);
  const boardsOut = new Appender(boardsFile, BOARD_HEADER);

  const stats = { ok: 0, dead: 0, rate_limited: 0, error: 0, jobs_total: 0, jobs_matched: 0 };
  const byAts = {};
  let processed = 0;

  await pool(boards, args.concurrency, async (b) => {
    const fetchedAt = new Date().toISOString();
    let status = 'ok', jobsTotal = 0, jobsMatched = 0, company = b.token;
    try {
      const res = await adapters[b.ats](b.token, b.region);
      company = res.company_name || b.token;
      jobsTotal = res.jobs.length;

      const matched = [];
      for (const j of res.jobs) {
        const m = matchTitle(j.title_raw);
        if (!m) continue;
        if (!j.published_at) continue;
        const ts = Date.parse(j.published_at);
        if (!Number.isFinite(ts) || ts < sinceMs) continue;
        matched.push({ j, m });
      }

      // greenhouse: content=false omits departments — backfill for matched jobs only
      if (b.ats === 'greenhouse') {
        for (const { j } of matched) {
          if (j.department || !j._gh_detail) continue;
          try {
            const d = await fetchJson(j._gh_detail);
            j.department = (d.departments || []).map(x => x.name).filter(Boolean).join(' / ');
            if (!j.location_raw) j.location_raw = d.location?.name || '';
          } catch { /* optional enrichment */ }
        }
      }

      const rows = matched.map(({ j, m }) => {
        const country = guessCountry(j.location_raw, j.country_hint);
        return [b.ats, b.token, company, res.name_source, j.job_id, j.title_raw,
          m.title_bucket, m.seniority, j.published_at, j.location_raw, country, countryTier(country),
          j.remote, j.department, j.salary_min, j.salary_max, j.salary_currency, j.apply_url];
      });
      jobsMatched = rows.length;
      postingsOut.rows(rows);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 404 || err.status === 410)) status = 'dead';
      else if (err instanceof HttpError && err.status === 429) status = 'rate_limited';
      else { status = 'error'; console.error(`  ! ${b.ats}/${b.token}: ${err.message}`); }
    }

    boardsOut.rows([[b.ats, b.token, status, jobsTotal, jobsMatched, company, fetchedAt]]);
    stats[status]++;
    stats.jobs_total += jobsTotal;
    stats.jobs_matched += jobsMatched;
    const a = byAts[b.ats] || (byAts[b.ats] = { boards: 0, ok: 0, jobs: 0, matched: 0 });
    a.boards++; if (status === 'ok') a.ok++; a.jobs += jobsTotal; a.matched += jobsMatched;

    processed++;
    if (processed % 100 === 0) {
      console.error(`[ats-pull] ${processed}/${boards.length} boards | ${stats.jobs_total} jobs | ${stats.jobs_matched} matched`);
    }
  });

  postingsOut.close();
  boardsOut.close();

  console.error('');
  console.error(`[ats-pull] done: ${processed} boards processed (${skipped} skipped as already ok/dead)`);
  console.error(`[ats-pull] status: ok=${stats.ok} dead=${stats.dead} rate_limited=${stats.rate_limited} error=${stats.error}`);
  console.error(`[ats-pull] jobs seen=${stats.jobs_total} matched=${stats.jobs_matched}`);
  for (const [ats, a] of Object.entries(byAts)) {
    console.error(`[ats-pull]   ${ats}: boards=${a.boards} ok=${a.ok} jobs=${a.jobs} matched=${a.matched}`);
  }
  console.error(`[ats-pull] postings -> ${args.out}`);
  console.error(`[ats-pull] boards   -> ${boardsFile}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
