// Steps 2-4: dedupe postings -> hiring-side companies, enrich firmographics from the
// richest board's raw JSON, apply size band + geo bucket.
//
// Usage: node build-posters.js <all_boards.csv> <gtme_raw.json> <sizeBandToGate> <out.csv>
//   e.g. node build-posters.js all_boards_jobs.csv gtme_raw.json 11-50 gtme_posters_gate.csv
//
// all_boards.csv columns expected: board,title,title_norm,company,company_type,industry,
//   demand_side,stage,location,remote,salary_usd,tools
const fs = require('fs');
const { parse, write, norm } = require('./csv');

const [, , boardsCsv, rawJson, gateBand = '11-50', out = 'posters_gate.csv'] = process.argv;

// 1) firmographics from the richest board (numeric employee count wins)
const fm = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(rawJson, 'utf8'));
  for (const j of raw) {
    const k = norm(j.organization); if (!k) continue;
    if (!fm.has(k) || j.orgEmployees) fm.set(k, { emp: j.orgEmployees || 0, size: j.orgSize || '', ind: j.orgIndustry || '', hq: j.orgHeadquarters || '' });
  }
} catch { /* raw JSON optional */ }

const bandFromEmp = n => !n ? '' : n <= 10 ? '1-10' : n <= 50 ? '11-50' : n <= 200 ? '51-200' : n <= 500 ? '201-500' : n <= 1000 ? '501-1k' : n <= 5000 ? '1k-5k' : '5k+';
const bandFromStage = s => { s = (s || '').toLowerCase(); return /1-10|pre-seed/.test(s) ? '1-10' : s.includes('11-50') ? '11-50' : s.includes('51-200') ? '51-200' : s.includes('201-500') ? '201-500' : s.includes('501-1k') ? '501-1k' : s.includes('1k-5k') ? '1k-5k' : s.includes('5k+') ? '5k+' : '?'; };
function geoBucket(g) {
  const G = (g || '').toLowerCase();
  if (/san francisco|palo alto|bay area|mountain view|menlo|sunnyvale|san fransico/.test(G)) return 'SF-overfished';
  if (/new york|nyc|brooklyn|manhattan/.test(G)) return 'NYC-overfished';
  if (/united kingdom|london|england/.test(G) || /\buk\b/.test(G)) return 'UK';
  if (/canada|toronto|vancouver|montreal|ontario/.test(G)) return 'Canada';
  if (/germany|france|netherlands|spain|sweden|belgium|austria|poland|italy|berlin|paris|amsterdam|europe/.test(G)) return 'Europe';
  if (/australia|sydney|melbourne|brisbane/.test(G)) return 'Australia';
  if (/united states|usa|,\s?[a-z]{2}$|\b(austin|denver|boston|chicago|seattle|atlanta|miami|los angeles|texas|california|tx|ca|ny|wa|ma|utah|remote)\b/.test(G)) return 'US-other';
  return g ? 'intl-other' : 'unknown';
}

const rows = parse(fs.readFileSync(boardsCsv, 'utf8'));
const h = rows[0], ix = n => h.indexOf(n);
const iC = ix('company'), iD = ix('demand_side'), iT = ix('company_type'), iInd = ix('industry'), iS = ix('stage'), iLoc = ix('location'), iB = ix('board');

const m = new Map();
for (const r of rows.slice(1)) {
  const co = (r[iC] || '').trim(); if (!co) continue;
  if (!(r[iD] || '').toLowerCase().includes('talent')) continue; // hiring-side only
  if (!m.has(co)) m.set(co, { company: co, boards: new Set(), type: r[iT] || '', industry: r[iInd] || '', stage: r[iS] || '', location: r[iLoc] || '', n: 0 });
  const e = m.get(co); e.n++; if (r[iB]) e.boards.add(r[iB].trim());
  if (!e.location && r[iLoc]) e.location = r[iLoc];
  if (!e.industry && r[iInd]) e.industry = r[iInd];
}

const arr = [...m.values()].map(e => {
  const f = fm.get(norm(e.company));
  const emp = f ? f.emp : 0;
  const band = emp ? bandFromEmp(emp) : bandFromStage(e.stage);
  const hq = (f && f.hq) ? f.hq : e.location;
  const gb = geoBucket(hq);
  return { company: e.company, emp: emp || '', size_band: band, hq, industry: e.industry || (f ? f.ind : ''), type: e.type, n: e.n, boards: [...e.boards].join('|'), geo_bucket: gb, under_fished: /overfished|unknown/.test(gb) ? 'no' : 'yes' };
});

const gate = arr.filter(e => e.size_band === gateBand);
const cols = ['company', 'emp', 'size_band', 'hq', 'industry', 'type', 'n', 'boards', 'geo_bucket', 'under_fished'];
const toRows = data => [cols].concat(data.map(e => cols.map(c => e[c])));
fs.writeFileSync(out, write(toRows(gate)));
fs.writeFileSync(out.replace(/\.csv$/, '_all.csv'), write(toRows(arr)));
console.log(`talent companies: ${arr.length} | gate ${gateBand}: ${gate.length} | wrote ${out} (+ _all.csv)`);
