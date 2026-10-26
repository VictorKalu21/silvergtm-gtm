#!/usr/bin/env node
/*
 * assemble.js :: build the operator's deliverable from the engine's outputs (deterministic, $0).
 * UK home-extension contractors — modelled on 2026-10-11_us-pool-builders/assemble.js, with the UK differences:
 *   phone normalisation is +44, there is no state/zip (a UK postcode + the home nation of the nearest runsheet tile),
 *   the classify verdicts carry work_types[] + residential (not pool_types), and the verdict map is ICP-extensions-uk.md's.
 * Reads (all inside the run folder unless noted):
 *   leads_annotated.csv        collapse-domains.js output: EVERY qualified+geo-gated row + track, website_class, root_domain,
 *                              location_count, is_multi_location, brand_family, rep_place_id
 *   excluded_maps.csv          Maps-stage drops (qualify + recovery + geo) with drop_reason — built by pipeline.sh
 *   classify/all_out/*.json    STEP 5e verdicts (A+B batches, the tier-D sample, the classify2 remainder):
 *                              {place_id, business_type, confidence, why, work_types[], evidence, services, residential}
 *   owner/site_text.jsonl      fetch-sites.js: status, emails[], socials{facebook[],...}, pages[] (per representative domain)
 *   domain_siblings.json       sibling place_id -> representative place_id (site text is fanned to branches)
 *   owner/contacts_final.jsonl (optional) owner names — absent until STEP 6 runs
 *   ../atlas-growth-extensions-uk-runsheet.csv   tile anchors -> nearest tile = "town used to discover" + home nation
 * Writes deliverable/: extension_builders_all.csv, extension_builders_qualified.csv, extension_builders_review.csv,
 *   extension_builders_excluded.csv, summary.json, summary.md  (then build-xlsx.py makes the workbook)
 *
 * Verdict map (ICP-extensions-uk.md §verdicts): extension_builder -> Qualified; builder_unconfirmed | unclear -> Review;
 *   design_only | conservatory_glazing_only | trade_only | new_build_only | commercial_only | not_builder -> Exclude;
 *   Maps-stage drops -> Exclude (stage maps_qualify). A no-website row (website_class none) has no verdict and is Review
 *   with the reason 'no website' — the STEP 5d recovery track, held, never dropped.
 * Dedupe: operator WAIVED cross-run dedupe; the in-run secondary collapse (same normalised phone AND street, or same
 *   normalised name AND street -> most-reviewed row kept, duplicate_of recorded) is kept because it is in-list hygiene,
 *   not cross-run. Rows sharing only a domain are BRANCHES: kept, grouped by org_group = root_domain with location_count.
 * Usage: node assemble.js [--run <dir>] | node assemble.js --self-test
 */
const fs = require('fs'), path = require('path'), os = require('os');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const SELF_TEST = process.argv.includes('--self-test');
const RUN = path.resolve(arg('run', __dirname));

function pc(t) { const R = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch === '\r') { } else c += ch; } } if (c !== '' || r.length) { r.push(c); R.push(r); } return R; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function readCsv(f) { if (!fs.existsSync(f)) return []; const R = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = R.shift(); return R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]]))); }
function writeCsv(f, rows, cols) { fs.writeFileSync(f, [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n'); }
function readJsonl(f) { if (!fs.existsSync(f)) return []; return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }

// ---- normalisers (UK) ----
const digits = s => String(s || '').replace(/\D/g, '');
// UK: national numbers are 10 digits after the trunk 0 (11 with it); +44 / 0044 international prefixes are stripped.
function normPhone(p) { let d = digits(p); if (d.startsWith('0044')) d = d.slice(4); if (d.startsWith('44') && d.length >= 12) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1); if (d.length !== 10 && d.length !== 9) return { display: String(p || '').trim(), e164: '', key: d }; const nat = '0' + d; const display = d.startsWith('7') ? `${nat.slice(0, 5)} ${nat.slice(5)}` : d.startsWith('20') || d.startsWith('23') || d.startsWith('24') || d.startsWith('28') || d.startsWith('29') ? `${nat.slice(0, 3)} ${nat.slice(3, 7)} ${nat.slice(7)}` : d.startsWith('1') && d[2] === '1' ? `${nat.slice(0, 4)} ${nat.slice(4, 7)} ${nat.slice(7)}` : `${nat.slice(0, 5)} ${nat.slice(5)}`; return { display, e164: '+44' + d, key: d }; }
function normUrl(u) { u = String(u || '').trim(); if (!u) return { url: '', domain: '' }; if (!/^https?:\/\//i.test(u)) u = 'http://' + u; try { const x = new URL(u); x.hash = ''; const host = x.host.toLowerCase().replace(/^www\./, ''); const p = x.pathname.replace(/\/+$/, ''); return { url: x.protocol + '//' + host + p + (x.search || ''), domain: host }; } catch { return { url: u, domain: '' }; } }
const normName = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(ltd|limited|llp|plc|co|the|company|uk|services|service)\b/g, '').replace(/[^a-z0-9]/g, '').trim();
const STREET_ABBR = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct', close: 'cl', place: 'pl', crescent: 'cres', gardens: 'gdns', terrace: 'ter', north: 'n', south: 's', east: 'e', west: 'w' };
const normStreet = a => String(a || '').toLowerCase().split(',')[0].replace(/\b(suite|unit|flat|apt|floor|office|studio)\b.*$/, '').replace(/\b[a-z]+\b/g, w => STREET_ABBR[w] || w).replace(/[^a-z0-9]/g, '').trim();
// UK postcode: outward (A9, A99, AA9, AA99, A9A, AA9A) + inward (9AA); the full form only — a bare outward code is not a postcode.
const PC_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/i;
function postcodeOf(addr, zip) { for (const s of [zip, addr]) { const m = String(s || '').toUpperCase().match(PC_RE); if (m) return m[1] + ' ' + m[2]; } return ''; }
function townOf(city, addr) { const c = String(city || '').trim(); if (c) return c; const parts = String(addr || '').split(',').map(s => s.trim()).filter(Boolean); if (parts.length < 2) return ''; const last = parts[parts.length - 1]; return PC_RE.test(last) ? (parts[parts.length - 2] || '').replace(PC_RE, '').trim() : last.replace(PC_RE, '').trim(); }
function hav(a, b, c, d) { const R = 6371, t = x => x * Math.PI / 180; const dl = t(c - a), dn = t(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const NATION = { eng: 'England', sct: 'Scotland', wls: 'Wales', nir: 'Northern Ireland' };

const VERDICT = { extension_builder: 'Qualified', builder_unconfirmed: 'Review', unclear: 'Review', design_only: 'Exclude', conservatory_glazing_only: 'Exclude', trade_only: 'Exclude', new_build_only: 'Exclude', commercial_only: 'Exclude', not_builder: 'Exclude' };
const WORK_LABEL = { rear_side_extension: 'rear/side extension', double_storey: 'double storey', kitchen_extension: 'kitchen extension', loft_conversion: 'loft conversion', garage_conversion: 'garage conversion', basement_conversion: 'basement conversion', orangery_conservatory: 'orangery/conservatory', renovation_refurb: 'renovation/refurb', new_build: 'new build', design_and_build: 'design and build' };
function workTypesField(types) { const t = (types || []).map(x => WORK_LABEL[x] || x); if (!t.length) return ''; return [...new Set(t)].join(' | '); }
const COLS = ['verdict', 'verdict_reason', 'priority', 'company_name', 'website', 'website_domain', 'google_maps_url', 'phone', 'phone_e164', 'email', 'email_source', 'full_address', 'town', 'postcode', 'nation', 'google_rating', 'google_reviews', 'business_category', 'google_types', 'services_offered', 'work_types', 'residential', 'build_evidence', 'evidence_source', 'facebook_url', 'instagram_url', 'owner_name', 'owner_title', 'brand_family', 'org_group', 'location_count', 'is_multi_location', 'qualify_track', 'discovery_queries', 'discovered_near_tile', 'duplicate_of', 'website_fetch_status', 'classify_confidence', 'exclude_stage', 'place_id', 'latitude', 'longitude'];

function assemble(run) {
  const annotated = readCsv(path.join(run, 'leads_annotated.csv'));
  const mapsDrops = readCsv(path.join(run, 'excluded_maps.csv'));
  const verdicts = new Map();
  const cdir = path.join(run, 'classify', 'all_out');
  if (fs.existsSync(cdir)) for (const f of fs.readdirSync(cdir).filter(f => f.endsWith('.json')).sort()) { try { for (const o of JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8').replace(/^﻿/, ''))) if (o && o.place_id && VERDICT[o.business_type]) verdicts.set(o.place_id, o); } catch (e) { console.error('WARN bad classify json ' + f); } }
  const site = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'site_text.jsonl'))) if (o.place_id) site.set(o.place_id, o);
  let siblings = {}; const sf = path.join(run, 'domain_siblings.json'); if (fs.existsSync(sf)) { try { siblings = JSON.parse(fs.readFileSync(sf, 'utf8').replace(/^﻿/, '')); } catch { } }
  const owners = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'contacts_final.jsonl'))) if (o.place_id) owners.set(o.place_id, o);
  const tiles = readCsv(path.join(run, '..', 'atlas-growth-extensions-uk-runsheet.csv')).map(t => ({ id: t.cell_id, lat: +t.lat, lng: +t.lng })).filter(t => isFinite(t.lat));
  const tileSeen = new Set(); const tileCenters = []; for (const t of tiles) { const k = t.lat.toFixed(3) + ',' + t.lng.toFixed(3); if (tileSeen.has(k)) continue; tileSeen.add(k); const m = t.id.match(/^([a-z]{3})-(.+?)-x\d+$/); tileCenters.push({ lat: t.lat, lng: t.lng, label: m ? m[2].replace(/-/g, ' ') : t.id, nation: m ? (NATION[m[1]] || m[1].toUpperCase()) : '' }); }
  const nearestTile = (la, ln) => { if (!isFinite(la) || !la || !tileCenters.length) return null; let best = null, bd = Infinity; for (const t of tileCenters) { const d = hav(la, ln, t.lat, t.lng); if (d < bd) { bd = d; best = t; } } return best; };
  // a domain sibling's site text lives under its representative: leads_annotated.csv carries rep_place_id on every row,
  // and domain_siblings.json is the engine's own map of the same thing (either key shape is honoured).
  const siteFor = a => site.get(a.place_id) || site.get(a.rep_place_id) || site.get(siblings[a.place_id]) || null;
  // fetch-sites.js reports status 'ok' for a page that returned HTTP 200 with no body text (JS-rendered shell, cookie wall):
  // the text is then only the '=== home (url) ===' page headers. The tiering step called those tier F (no text) and never
  // read them, so they are Review 'no usable site text', not 'no classify verdict'. 200 chars of non-header text is the floor.
  const usableText = st => st && st.status === 'ok' && String(st.text || '').replace(/^=== .* ===$/gm, '').replace(/\s+/g, ' ').trim().length >= 200;

  const rows = [];
  for (const a of annotated) {
    const v = verdicts.get(a.place_id) || verdicts.get(a.rep_place_id) || null;
    const st = siteFor(a); const ow = owners.get(a.place_id);
    const ph = normPhone(a.phone_number); const w = normUrl(a.website); const tile = nearestTile(+a.latitude, +a.longitude);
    const noSite = a.website_class === 'none' || !w.domain;
    const bt = v ? v.business_type : (noSite ? 'no_website' : (usableText(st) ? 'unclassified' : 'unclear'));
    const verdict = VERDICT[bt] || 'Review';
    const emails = [...new Set((st && st.emails) || [])];
    const ownEmail = emails.find(e => w.domain && e.split('@')[1] === w.domain) || emails[0] || '';
    const socials = (st && st.socials) || {};
    const reviews = +a.review_count || 0, rating = +a.rating || 0;
    const priority = verdict !== 'Qualified' ? '' : (reviews >= 25 && rating >= 4.3 && w.domain ? 'A' : (reviews >= 5 ? 'B' : 'C'));
    const evidencePage = st && st.status === 'ok' && v && v.evidence ? ((st.pages || []).find(p => (p.text || '').includes(String(v.evidence).slice(0, 40))) || {}).url || (st.pages && st.pages[0] && st.pages[0].url) || w.url : '';
    const reason = v ? `${bt}${v.why ? ': ' + v.why : ''}` : (bt === 'no_website' ? 'no website (Maps listing only; STEP 5d recovery track)' : bt === 'unclear' ? (st && st.status === 'ok' ? 'no usable site text (page returned empty; render residue)' : 'no usable site text') : 'no classify verdict');
    rows.push({
      verdict, verdict_reason: reason, priority,
      company_name: a.name, website: w.url, website_domain: w.domain, google_maps_url: a.place_link || '', phone: ph.display, phone_e164: ph.e164,
      email: ownEmail, email_source: ownEmail ? 'website' : '', full_address: a.full_address, town: townOf(a.city, a.full_address), postcode: postcodeOf(a.full_address, a.zip), nation: tile ? tile.nation : '',
      google_rating: a.rating, google_reviews: a.review_count, business_category: String(a.google_types || '').split('|')[0], google_types: a.google_types,
      services_offered: v ? (v.services || '') : '', work_types: v ? workTypesField(v.work_types) : '', residential: v ? (v.residential === true ? 'yes' : v.residential === false ? 'no' : '') : '',
      build_evidence: v ? (v.evidence || '') : '', evidence_source: evidencePage,
      facebook_url: (socials.facebook || [])[0] || '', instagram_url: (socials.instagram || [])[0] || '',
      owner_name: ow ? (ow.primary_name || '') : '', owner_title: ow ? ((ow.contacts || []).find(c => c.name === ow.primary_name) || {}).title || '' : '',
      brand_family: a.brand_family || '', org_group: a.root_domain || '', location_count: a.location_count || '', is_multi_location: a.is_multi_location || '',
      qualify_track: a.track || '', discovery_queries: a.icp_type || '', discovered_near_tile: tile ? tile.label : '', duplicate_of: '',
      website_fetch_status: st ? st.status : (noSite ? 'no_website' : (a.website_class === 'shared_host' ? 'shared_host' : 'not_fetched')),
      classify_confidence: v ? (v.confidence || '') : '', exclude_stage: verdict === 'Exclude' ? 'site_text' : '', place_id: a.place_id, latitude: a.latitude, longitude: a.longitude,
      _nk: normName(a.name), _sk: normStreet(a.full_address), _pk: ph.key, _rv: reviews,
    });
  }
  // in-run secondary dedupe: same phone+street or same name+street -> keep the most-reviewed, mark the rest
  const byKey = new Map();
  const sorted = rows.slice().sort((x, y) => y._rv - x._rv);
  for (const r of sorted) {
    const keys = []; if (r._pk && r._sk) keys.push('p:' + r._pk + '|' + r._sk); if (r._nk && r._sk) keys.push('n:' + r._nk + '|' + r._sk);
    const hit = keys.map(k => byKey.get(k)).find(Boolean);
    if (hit && hit !== r.place_id) { r.duplicate_of = hit; } else for (const k of keys) if (!byKey.has(k)) byKey.set(k, r.place_id);
  }
  const dupes = rows.filter(r => r.duplicate_of); const unique = rows.filter(r => !r.duplicate_of);
  // Maps-stage drops -> excluded with stage
  const mapsRows = mapsDrops.map(a => { const ph = normPhone(a.phone_number); const w = normUrl(a.website); const tile = nearestTile(+a.latitude, +a.longitude); return { verdict: 'Exclude', verdict_reason: 'maps_qualify: ' + (a.drop_reason || a.reason || ''), priority: '', company_name: a.name, website: w.url, website_domain: w.domain, google_maps_url: a.place_link || '', phone: ph.display, phone_e164: ph.e164, email: '', email_source: '', full_address: a.full_address, town: townOf(a.city, a.full_address), postcode: postcodeOf(a.full_address, a.zip), nation: tile ? tile.nation : '', google_rating: a.rating, google_reviews: a.review_count, business_category: String(a.google_types || '').split('|')[0], google_types: a.google_types, services_offered: '', work_types: '', residential: '', build_evidence: '', evidence_source: '', facebook_url: '', instagram_url: '', owner_name: '', owner_title: '', brand_family: '', org_group: w.domain, location_count: '', is_multi_location: '', qualify_track: '', discovery_queries: a.icp_type || '', discovered_near_tile: tile ? tile.label : '', duplicate_of: '', website_fetch_status: 'not_fetched', classify_confidence: '', exclude_stage: 'maps_qualify', place_id: a.place_id, latitude: a.latitude, longitude: a.longitude }; });
  const all = [...unique, ...mapsRows];
  const out = path.join(run, 'deliverable'); fs.mkdirSync(out, { recursive: true });
  writeCsv(path.join(out, 'extension_builders_all.csv'), [...all, ...dupes], COLS);
  writeCsv(path.join(out, 'extension_builders_qualified.csv'), unique.filter(r => r.verdict === 'Qualified').sort((x, y) => (x.priority || 'Z').localeCompare(y.priority || 'Z') || y._rv - x._rv), COLS);
  writeCsv(path.join(out, 'extension_builders_review.csv'), unique.filter(r => r.verdict === 'Review'), COLS);
  writeCsv(path.join(out, 'extension_builders_excluded.csv'), all.filter(r => r.verdict === 'Exclude'), COLS);
  // summary
  const cnt = (list, f) => { const m = {}; for (const r of list) { const k = f(r) || '(blank)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
  const q = unique.filter(r => r.verdict === 'Qualified'), rv = unique.filter(r => r.verdict === 'Review'), ex = all.filter(r => r.verdict === 'Exclude');
  const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
  const fill = list => ({ website: pct(list.filter(r => r.website).length, list.length), phone: pct(list.filter(r => r.phone_e164).length, list.length), email: pct(list.filter(r => r.email).length, list.length), facebook: pct(list.filter(r => r.facebook_url).length, list.length), owner_name: pct(list.filter(r => r.owner_name).length, list.length), postcode: pct(list.filter(r => r.postcode).length, list.length) });
  const byNatQ = cnt(q, r => r.nation), byNatAll = cnt(unique, r => r.nation);
  const byNation = Object.fromEntries(Object.keys(byNatAll).map(s => [s, { site_text_rows: byNatAll[s], qualified: byNatQ[s] || 0, review: rv.filter(r => r.nation === s).length }]));
  const workTypeCount = {}; for (const r of q) for (const t of r.work_types ? r.work_types.split(' | ') : []) workTypeCount[t] = (workTypeCount[t] || 0) + 1;
  const summary = { generated: new Date().toISOString(), unique_businesses_after_maps_qualify: unique.length, duplicates_collapsed_phone_or_name_plus_street: dupes.length, maps_stage_excluded: mapsRows.length, total_unique_collected: unique.length + mapsRows.length, qualified: q.length, review: rv.length, review_by_reason: cnt(rv, r => r.verdict_reason.split(':')[0].split(' (')[0]), excluded_total: ex.length, excluded_site_text: ex.length - mapsRows.length, by_verdict_reason: cnt([...unique, ...mapsRows], r => r.verdict_reason.split(':')[0].split(' (')[0]), by_nation: byNation, work_types_qualified: Object.fromEntries(Object.entries(workTypeCount).sort((a, b) => b[1] - a[1])), qualified_priority: cnt(q, r => r.priority), qualified_by_track: cnt(q, r => r.qualify_track), brand_families_qualified: cnt(q.filter(r => r.brand_family), r => r.brand_family), fill_qualified_pct: fill(q), fill_all_site_rows_pct: fill(unique), website_fetch_status: cnt(unique, r => r.website_fetch_status) };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  const md = [`# UK home-extension builders — deliverable summary (${summary.generated.slice(0, 10)})`, '', `| metric | count |`, `|---|---|`, `| Unique businesses collected (after Maps dedupe + geo gate) | ${summary.total_unique_collected} |`, `| Excluded at the Maps stage (type/name denies, not in ICP, outside the UK) | ${summary.maps_stage_excluded} |`, `| Reached the site-text gate | ${summary.unique_businesses_after_maps_qualify} |`, `| **Qualified** (site states it builds extensions / loft, garage or basement conversions / design-and-build for homeowners) | **${summary.qualified}** |`, `| Review (general builder not confirmed · no usable site text · no website) | ${summary.review} |`, `| Excluded at the site-text gate (design-only, conservatory/glazing-only, single trade, new-build-only, commercial-only, not a builder) | ${summary.excluded_site_text} |`, `| In-run duplicates collapsed (same phone+street or name+street) | ${summary.duplicates_collapsed_phone_or_name_plus_street} |`, '', '## Review rows by reason', '', '| reason | rows |', '|---|---|', ...Object.entries(summary.review_by_reason).map(([k, v]) => `| ${k} | ${v} |`), '', '## By home nation (nearest runsheet tile)', '', '| nation | reached site gate | qualified | review |', '|---|---|---|---|', ...Object.entries(byNation).sort((a, b) => b[1].qualified - a[1].qualified).map(([s, v]) => `| ${s} | ${v.site_text_rows} | ${v.qualified} | ${v.review} |`), '', '## Work types named on Qualified sites (a site can name several)', '', '| work type | qualified sites |', '|---|---|', ...Object.entries(summary.work_types_qualified).map(([k, v]) => `| ${k} | ${v} |`), '', '## Qualified priority (A = 25+ reviews, 4.3+, website · B = 5+ reviews · C = rest)', '', '| priority | rows |', '|---|---|', ...Object.entries(summary.qualified_priority).map(([k, v]) => `| ${k} | ${v} |`), '', '## Field fill (Qualified rows)', '', '| field | % |', '|---|---|', ...Object.entries(summary.fill_qualified_pct).map(([k, v]) => `| ${k} | ${v}% |`), '', '## Verdict reasons (all rows)', '', '| reason | rows |', '|---|---|', ...Object.entries(summary.by_verdict_reason).map(([k, v]) => `| ${k} | ${v} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'summary.md'), md);
  return summary;
}

if (SELF_TEST) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-uk-')); const run = path.join(tmp, '2026-01-01_t'); fs.mkdirSync(path.join(run, 'classify', 'all_out'), { recursive: true }); fs.mkdirSync(path.join(run, 'owner'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'atlas-growth-extensions-uk-runsheet.csv'), 'cell_id,icp_type,query,lat,lng,zoom,priority\neng-london-centre-x0,extension,house extensions,51.5074,-0.1278,13,P1\nsct-glasgow-x7,extension,design and build,55.8642,-4.2518,13,P1\n');
  const AH = 'place_id,business_id,name,icp_type,google_types,full_address,city,zip,neighborhood,latitude,longitude,website,phone_number,rating,review_count,is_claimed,verified,hours,place_link,track,website_class,root_domain,location_count,is_multi_location,brand_family,rep_place_id';
  fs.writeFileSync(path.join(run, 'leads_annotated.csv'), [AH,
    'A1,b1,Acme Extensions Ltd,extension,Construction company|Contractor,"12 High Street, Croydon CR0 1AB",Croydon,CR0 1AB,,51.37,-0.10,https://www.acme-extensions.co.uk/,020 8123 4567,4.8,42,true,,,https://maps.google.com/?cid=1,main,site,acme-extensions.co.uk,1,false,,A1',
    'A2,b2,Acme Extensions,extension|kw:loft,Contractor,"12 High St, Croydon CR0 1AB",Croydon,,,51.37,-0.10,,+44 20 8123 4567,4.0,3,false,,,https://maps.google.com/?cid=2,baretype,none,,1,false,,A2',
    'A3,b3,Build Team London,extension,General contractor,"1 Loft Way, London SW11 1AA",London,,,51.46,-0.17,https://buildteam.com/london,07700 900123,4.5,210,true,,,https://maps.google.com/?cid=3,main,site,buildteam.com,2,true,Build Team,A3',
    'A4,b4,Build Team Surrey,extension,General contractor,"9 Lake Rd, Guildford GU1 1AA",Guildford,,,51.24,-0.57,https://buildteam.com/surrey,01483 123456,4.6,80,true,,,https://maps.google.com/?cid=4,main,site,buildteam.com,2,true,Build Team,A3',
    'A5,b5,Glasgow Roofing Co,extension,Roofing contractor,"3 Rig St, Glasgow G1 1AA",Glasgow,,,55.86,-4.25,https://glasgowroofing.example/,0141 555 0104,4.2,88,false,,,https://maps.google.com/?cid=5,generic,site,glasgowroofing.example,1,false,,A5',
    'A6,b6,J Smith Builders,extension,Contractor,"7 Dry Rd, Leeds LS1 1AA",Leeds,,,53.80,-1.55,https://jsmithbuilders.example/,0113 555 0106,5.0,2,false,,,https://maps.google.com/?cid=6,baretype,site,jsmithbuilders.example,1,false,,A6',
    'A7,b7,No Site Builders,extension,Contractor,"",,,,,,,07700 900999,,0,false,,,https://maps.google.com/?cid=7,baretype,none,,1,false,,A7',
    'A8,b8,Shell Site Builders,extension,Contractor,"2 Js Rd, Bristol BS1 1AA",Bristol,,,51.45,-2.59,https://shellsite.example/,0117 555 0108,4.9,12,false,,,https://maps.google.com/?cid=8,main,site,shellsite.example,1,false,,A8'].join('\n') + '\n');
  fs.writeFileSync(path.join(run, 'excluded_maps.csv'), 'place_id,business_id,name,icp_type,google_types,full_address,city,zip,neighborhood,latitude,longitude,website,phone_number,rating,review_count,is_claimed,verified,hours,place_link,drop_reason\nX1,bx,Hair Extensions by Jo,extension,Hairdresser,"5 Cut St, London W1A 1AA",London,,,51.51,-0.13,,020 7946 0000,4.4,150,,,,https://maps.google.com/?cid=9,hard_off_icp_type\n');
  fs.writeFileSync(path.join(run, 'classify', 'all_out', 'batch_000.json'), JSON.stringify([
    { place_id: 'A1', business_type: 'extension_builder', confidence: 'high', why: 'builds extensions', work_types: ['rear_side_extension', 'loft_conversion'], evidence: 'We build single and double storey extensions and loft conversions', services: 'extensions, lofts', residential: true },
    { place_id: 'A3', business_type: 'extension_builder', confidence: 'high', why: 'design and build', work_types: ['design_and_build'], evidence: 'design and build service', services: 'design and build', residential: true },
    { place_id: 'A5', business_type: 'trade_only', confidence: 'high', why: 'roofing only', work_types: [], evidence: 'flat roofs and slating', services: 'roofing', residential: null },
    { place_id: 'A6', business_type: 'builder_unconfirmed', confidence: 'medium', why: 'generic building', work_types: ['renovation_refurb'], evidence: 'all aspects of building work', services: 'building work', residential: true }]));
  fs.writeFileSync(path.join(run, 'classify', 'all_out', 'c2_batch_000.json'), JSON.stringify([{ place_id: 'A4', business_type: 'extension_builder', confidence: 'high', why: 'design and build', work_types: ['design_and_build'], evidence: 'design and build service', services: 'design and build', residential: true }]));
  fs.writeFileSync(path.join(run, 'domain_siblings.json'), JSON.stringify({ A4: 'A3' }));
  fs.writeFileSync(path.join(run, 'owner', 'site_text.jsonl'), [JSON.stringify({ place_id: 'A1', status: 'ok', emails: ['info@acme-extensions.co.uk'], socials: { facebook: ['https://facebook.com/acme'] }, pages: [{ url: 'https://acme-extensions.co.uk/', text: 'We build single and double storey extensions and loft conversions for homeowners' }] }), JSON.stringify({ place_id: 'A3', status: 'ok', emails: ['hello@buildteam.com'], socials: {}, pages: [{ url: 'https://buildteam.com/london', text: 'design and build service' }] }), JSON.stringify({ place_id: 'A5', status: 'ok', emails: [], socials: {}, pages: [] }), JSON.stringify({ place_id: 'A6', status: 'home_failed:403', emails: [], socials: {}, pages: [] }), JSON.stringify({ place_id: 'A8', status: 'ok', emails: [], socials: {}, pages: [], text: '=== home (https://shellsite.example/) ===\n' })].join('\n') + '\n');
  fs.writeFileSync(path.join(run, 'owner', 'contacts_final.jsonl'), JSON.stringify({ place_id: 'A1', primary_name: 'Jane Doe', contacts: [{ name: 'Jane Doe', title: 'Managing Director' }] }) + '\n');
  const s = assemble(run);
  let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
  const q = readCsv(path.join(run, 'deliverable', 'extension_builders_qualified.csv')), all = readCsv(path.join(run, 'deliverable', 'extension_builders_all.csv')), ex = readCsv(path.join(run, 'deliverable', 'extension_builders_excluded.csv')), rv = readCsv(path.join(run, 'deliverable', 'extension_builders_review.csv'));
  check('A2 collapsed into A1 (same +44 phone + street, St/Street) and reported', s.duplicates_collapsed_phone_or_name_plus_street === 1 && all.find(r => r.place_id === 'A2').duplicate_of === 'A1');
  check('branches on one domain both kept as Qualified (sibling verdict via c2_ file)', q.filter(r => r.org_group === 'buildteam.com').length === 2);
  check('qualified = 3, review = 3 (unconfirmed + no website + empty page), excluded = 2 (1 site-text + 1 maps)', s.qualified === 3 && s.review === 3 && s.excluded_total === 2 && s.maps_stage_excluded === 1 && ex.find(r => r.place_id === 'X1').exclude_stage === 'maps_qualify');
  const a1 = q.find(r => r.place_id === 'A1');
  check('A1: London phone normalised, e164, email, facebook, owner, work types, postcode, nation, tile, priority A', a1.phone === '020 8123 4567' && a1.phone_e164 === '+442081234567' && a1.email === 'info@acme-extensions.co.uk' && a1.facebook_url === 'https://facebook.com/acme' && a1.owner_name === 'Jane Doe' && a1.owner_title === 'Managing Director' && a1.work_types === 'rear/side extension | loft conversion' && a1.postcode === 'CR0 1AB' && a1.nation === 'England' && a1.discovered_near_tile === 'london centre' && a1.priority === 'A' && a1.residential === 'yes' && a1.qualify_track === 'main');
  const a4 = q.find(r => r.place_id === 'A4');
  check('A4 (sibling) gets the representative site status and the shared domain email', a4.website_fetch_status === 'ok' && a4.email === 'hello@buildteam.com' && a4.phone === '01483 123456' && a4.brand_family === 'Build Team');
  check('A5 Glasgow roofer excluded trade_only, nation Scotland, 0141 display', ex.find(r => r.place_id === 'A5').nation === 'Scotland' && ex.find(r => r.place_id === 'A5').phone === '0141 555 0104');
  check('A6 review with 403 fetch; A7 review no_website with mobile display', rv.find(r => r.place_id === 'A6').website_fetch_status === 'home_failed:403' && rv.find(r => r.place_id === 'A7').website_fetch_status === 'no_website' && rv.find(r => r.place_id === 'A7').phone === '07700 900999' && /no website/.test(rv.find(r => r.place_id === 'A7').verdict_reason));
  check('A8: status ok but header-only text is Review no usable site text (render residue), never no classify verdict', /render residue/.test(rv.find(r => r.place_id === 'A8').verdict_reason) && s.review_by_reason['no usable site text'] === 1);
  check('summary by nation + fill + review reasons', s.by_nation.England.qualified === 3 && s.by_nation.Scotland.site_text_rows === 1 && s.fill_qualified_pct.phone === 100 && s.review_by_reason['no website'] === 1 && fs.existsSync(path.join(run, 'deliverable', 'summary.md')));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
}
const s = assemble(RUN);
console.log(`assembled -> ${path.join(RUN, 'deliverable')}: unique ${s.total_unique_collected} | qualified ${s.qualified} | review ${s.review} | excluded ${s.excluded_total} (maps ${s.maps_stage_excluded}) | dupes ${s.duplicates_collapsed_phone_or_name_plus_street}`);
