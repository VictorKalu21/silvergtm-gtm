#!/usr/bin/env node
/*
 * assemble.js :: build the operator's deliverable from the engine's outputs (deterministic, $0).
 * Reads (all inside the run folder unless noted):
 *   leads_annotated.csv        collapse-domains.js output: EVERY qualified+geo-gated row + website_class, root_domain,
 *                              location_count, is_multi_location, brand_family, rep_place_id
 *   excluded_maps.csv          Maps-stage drops (qualify + recovery + geo) with drop_reason — built by the pipeline (concat)
 *   classify/out/*.json        STEP 5e verdicts: {place_id, business_type, confidence, why, pool_types[], evidence, services}
 *   owner/site_text.jsonl      fetch-sites.js: status, emails[], socials{facebook[],...}, pages[] (per representative domain)
 *   domain_siblings.json       sibling place_id -> representative place_id (site text is fanned to branches)
 *   owner/serp_text.jsonl      (optional) search-owner.js: emails_from_serp[]
 *   owner/contacts_final.jsonl (optional) owner names
 *   ../atlas-growth-pools-runsheet.csv   tile anchors -> nearest tile = "city/state used to discover"
 * Writes deliverable/: pool_builders_all.csv, pool_builders_qualified.csv, pool_builders_review.csv,
 *   pool_builders_excluded.csv, summary.json, summary.md  (then build-xlsx.py makes the workbook)
 *
 * Verdict map (ICP-pools.md): inground_builder -> Qualified; builder_unconfirmed | unclear -> Review;
 *   service_only | retail_only | commercial_only | not_pool -> Exclude; Maps-stage drops -> Exclude (stage maps_qualify).
 * Dedupe (brief §6): place_id is the key; then rows sharing a normalised phone AND street, or a normalised name AND
 *   street, collapse to the most-reviewed row (duplicate_of recorded). Rows sharing only a domain are BRANCHES: kept,
 *   grouped by org_group = root_domain with location_count.
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

// ---- normalisers (brief §6) ----
const digits = s => String(s || '').replace(/\D/g, '');
function normPhone(p) { let d = digits(p); if (d.length === 11 && d[0] === '1') d = d.slice(1); if (d.length !== 10) return { display: String(p || '').trim(), e164: '', key: d }; return { display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, e164: '+1' + d, key: d }; }
function normUrl(u) { u = String(u || '').trim(); if (!u) return { url: '', domain: '' }; if (!/^https?:\/\//i.test(u)) u = 'http://' + u; try { const x = new URL(u); x.hash = ''; const host = x.host.toLowerCase().replace(/^www\./, ''); let p = x.pathname.replace(/\/+$/, ''); return { url: (x.protocol + '//' + host + p + (x.search || '')).toLowerCase() === (x.protocol + '//' + host + p + (x.search || '')).toLowerCase() ? x.protocol + '//' + host + p + (x.search || '') : u, domain: host }; } catch { return { url: u, domain: '' }; } }
const normName = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(inc|llc|ltd|corp|co|the|company|l\.l\.c|incorporated)\b/g, '').replace(/[^a-z0-9]/g, '').trim();
const STREET_ABBR = { street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', circle: 'cir', place: 'pl', parkway: 'pkwy', highway: 'hwy', terrace: 'ter', trail: 'trl', north: 'n', south: 's', east: 'e', west: 'w' };
const normStreet = a => String(a || '').toLowerCase().split(',')[0].replace(/\b(suite|ste|unit|#|apt|bldg)\b.*$/, '').replace(/\b[a-z]+\b/g, w => STREET_ABBR[w] || w).replace(/[^a-z0-9]/g, '').trim();
const ST_RE = /\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/;
function stateZip(addr, city) { const m = String(addr || '').match(ST_RE); if (m) return { state: m[1], zip: m[2] }; const c = String(city || '').match(/,\s*([A-Z]{2})\b/); return { state: c ? c[1] : '', zip: (String(addr || '').match(/\b(\d{5})\b/) || [])[1] || '' }; }
function cityOf(city, addr) { let c = String(city || '').replace(/,\s*[A-Z]{2}\b.*$/, '').trim(); if (c) return c; const parts = String(addr || '').split(',').map(s => s.trim()); return parts.length >= 3 ? parts[parts.length - 3] : ''; }
function hav(a, b, c, d) { const R = 6371, t = x => x * Math.PI / 180; const dl = t(c - a), dn = t(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

const VERDICT = { inground_builder: 'Qualified', builder_unconfirmed: 'Review', unclear: 'Review', service_only: 'Exclude', retail_only: 'Exclude', commercial_only: 'Exclude', not_pool: 'Exclude' };
const POOL_LABEL = { fiberglass: 'fiberglass', gunite_concrete: 'concrete/gunite', vinyl_liner: 'other (vinyl liner)', other: 'other' };
function poolTypeField(types) { const t = (types || []).map(x => POOL_LABEL[x] || x); if (!t.length) return 'unknown'; return [...new Set(t)].join(' | '); }
const COLS = ['verdict', 'verdict_reason', 'priority', 'company_name', 'website', 'website_domain', 'google_maps_url', 'phone', 'phone_e164', 'email', 'email_source', 'full_address', 'city', 'state', 'zip', 'location_source', 'google_rating', 'google_reviews', 'business_category', 'google_types', 'services_offered', 'build_evidence', 'evidence_source', 'pool_type', 'facebook_url', 'instagram_url', 'owner_name', 'owner_title', 'brand_family', 'org_group', 'location_count', 'is_multi_location', 'discovery_queries', 'discovered_near_tile', 'duplicate_of', 'website_fetch_status', 'classify_confidence', 'exclude_stage', 'place_id', 'latitude', 'longitude'];

function assemble(run) {
  const annotated = readCsv(path.join(run, 'leads_annotated.csv'));
  const mapsDrops = readCsv(path.join(run, 'excluded_maps.csv'));
  const verdicts = new Map();
  const cdir = path.join(run, 'classify', 'out');
  if (fs.existsSync(cdir)) for (const f of fs.readdirSync(cdir).filter(f => f.endsWith('.json'))) { try { for (const o of JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8').replace(/^﻿/, ''))) if (o && o.place_id) verdicts.set(o.place_id, o); } catch (e) { console.error('WARN bad classify json ' + f); } }
  const site = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'site_text.jsonl'))) if (o.place_id) site.set(o.place_id, o);
  let siblings = {}; const sf = path.join(run, 'domain_siblings.json'); if (fs.existsSync(sf)) { try { siblings = JSON.parse(fs.readFileSync(sf, 'utf8').replace(/^﻿/, '')); } catch { } }
  const serp = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'serp_text.jsonl'))) if (o.place_id) serp.set(o.place_id, o);
  const owners = new Map(); for (const o of readJsonl(path.join(run, 'owner', 'contacts_final.jsonl'))) if (o.place_id) owners.set(o.place_id, o);
  const tiles = readCsv(path.join(run, '..', 'atlas-growth-pools-runsheet.csv')).map(t => ({ id: t.cell_id, lat: +t.lat, lng: +t.lng })).filter(t => isFinite(t.lat));
  const tileSeen = new Set(); const tileCenters = []; for (const t of tiles) { const k = t.lat.toFixed(3) + ',' + t.lng.toFixed(3); if (tileSeen.has(k)) continue; tileSeen.add(k); const m = t.id.match(/^([a-z]{2})-(.+)-q\d+$/); tileCenters.push({ lat: t.lat, lng: t.lng, label: m ? `${m[2].replace(/-/g, ' ')}, ${m[1].toUpperCase()}` : t.id }); }
  const nearestTileObj = (la, ln) => { if (!isFinite(la) || !tileCenters.length) return null; let best = null, bd = Infinity; for (const t of tileCenters) { const d = hav(la, ln, t.lat, t.lng); if (d < bd) { bd = d; best = t; } } return best; };
  const nearestTile = (la, ln) => { const t = nearestTileObj(la, ln); return t ? t.label : ''; };
  // service-area listings carry no address (10,741 of 34,848 on this run) but do carry lat/lng: fall back to the nearest tile's city/state
  const locate = (addr, city, la, ln) => { const sz = stateZip(addr, city); let c = cityOf(city, addr); let src = 'address'; if (!sz.state) { const t = nearestTileObj(+la, +ln); if (t) { const m = t.label.match(/^(.*), ([A-Z]{2})$/); if (m) { sz.state = m[2]; if (!c) c = m[1].replace(/\b\w/g, ch => ch.toUpperCase()); src = 'nearest_tile'; } } else src = 'unknown'; } return { ...sz, city: c, source: src }; };
  const siteFor = pid => site.get(pid) || site.get(siblings[pid]) || null;

  const rows = [];
  for (const a of annotated) {
    const v = verdicts.get(a.place_id) || null;
    const st = siteFor(a.place_id); const sp = serp.get(a.place_id); const ow = owners.get(a.place_id);
    const loc = locate(a.full_address, a.city, a.latitude, a.longitude); const { state, zip } = loc; const ph = normPhone(a.phone_number); const w = normUrl(a.website);
    const bt = v ? v.business_type : (st && st.status === 'ok' ? 'unclassified' : 'unclear');
    const verdict = VERDICT[bt] || (bt === 'unclassified' ? 'Review' : 'Review');
    const emails = [...new Set([...(st && st.emails || []), ...(sp && sp.emails_from_serp || [])])];
    const ownEmail = emails.find(e => w.domain && e.split('@')[1] === w.domain) || emails[0] || '';
    const emailSrc = ownEmail ? ((st && (st.emails || []).includes(ownEmail)) ? 'website' : 'serp') : '';
    const socials = (st && st.socials) || {};
    const reviews = +a.review_count || 0, rating = +a.rating || 0;
    const priority = verdict !== 'Qualified' ? '' : (reviews >= 25 && rating >= 4.3 && w.domain ? 'A' : (reviews >= 5 ? 'B' : 'C'));
    const evidencePage = st && st.status === 'ok' && v && v.evidence ? ((st.pages || []).find(p => (p.text || '').includes(String(v.evidence).slice(0, 40))) || {}).url || (st.pages && st.pages[0] && st.pages[0].url) || w.url : '';
    rows.push({
      verdict, verdict_reason: v ? `${bt}${v.why ? ': ' + v.why : ''}` : (bt === 'unclear' ? 'no usable site text' : 'no classify verdict'), priority,
      company_name: a.name, website: w.url, website_domain: w.domain, google_maps_url: a.place_link || '', phone: ph.display, phone_e164: ph.e164,
      email: ownEmail, email_source: emailSrc, full_address: a.full_address, city: loc.city, state, zip, location_source: loc.source,
      google_rating: a.rating, google_reviews: a.review_count, business_category: String(a.google_types || '').split('|')[0], google_types: a.google_types,
      services_offered: v ? (v.services || '') : '', build_evidence: v ? (v.evidence || '') : '', evidence_source: evidencePage,
      pool_type: v ? poolTypeField(v.pool_types) : 'unknown', facebook_url: (socials.facebook || [])[0] || '', instagram_url: (socials.instagram || [])[0] || '',
      owner_name: ow ? (ow.primary_name || '') : '', owner_title: ow ? ((ow.contacts || []).find(c => c.name === ow.primary_name) || {}).title || '' : '',
      brand_family: a.brand_family || '', org_group: a.root_domain || '', location_count: a.location_count || '', is_multi_location: a.is_multi_location || '',
      discovery_queries: a.icp_type || '', discovered_near_tile: nearestTile(+a.latitude, +a.longitude), duplicate_of: '',
      website_fetch_status: st ? st.status : (a.website_class === 'none' ? 'no_website' : (a.website_class === 'shared_host' ? 'shared_host' : 'not_fetched')),
      classify_confidence: v ? (v.confidence || '') : '', exclude_stage: verdict === 'Exclude' ? 'site_text' : '', place_id: a.place_id, latitude: a.latitude, longitude: a.longitude,
      _nk: normName(a.name), _sk: normStreet(a.full_address), _pk: ph.key, _rv: reviews,
    });
  }
  // secondary dedupe: same phone+street or same name+street -> keep the most-reviewed, mark the rest
  const byKey = new Map();
  const sorted = rows.slice().sort((x, y) => y._rv - x._rv);
  for (const r of sorted) {
    const keys = []; if (r._pk && r._sk) keys.push('p:' + r._pk + '|' + r._sk); if (r._nk && r._sk) keys.push('n:' + r._nk + '|' + r._sk);
    const hit = keys.map(k => byKey.get(k)).find(Boolean);
    if (hit && hit !== r.place_id) { r.duplicate_of = hit; } else for (const k of keys) if (!byKey.has(k)) byKey.set(k, r.place_id);
  }
  const dupes = rows.filter(r => r.duplicate_of); const unique = rows.filter(r => !r.duplicate_of);
  // Maps-stage drops -> excluded with stage
  const mapsRows = mapsDrops.map(a => { const loc = locate(a.full_address, a.city, a.latitude, a.longitude); const { state, zip } = loc; const ph = normPhone(a.phone_number); const w = normUrl(a.website); return { verdict: 'Exclude', verdict_reason: 'maps_qualify: ' + (a.drop_reason || a.reason || ''), priority: '', company_name: a.name, website: w.url, website_domain: w.domain, google_maps_url: a.place_link || '', phone: ph.display, phone_e164: ph.e164, email: '', email_source: '', full_address: a.full_address, city: loc.city, state, zip, location_source: loc.source, google_rating: a.rating, google_reviews: a.review_count, business_category: String(a.google_types || '').split('|')[0], google_types: a.google_types, services_offered: '', build_evidence: '', evidence_source: '', pool_type: 'unknown', facebook_url: '', instagram_url: '', owner_name: '', owner_title: '', brand_family: '', org_group: w.domain, location_count: '', is_multi_location: '', discovery_queries: a.icp_type || '', discovered_near_tile: nearestTile(+a.latitude, +a.longitude), duplicate_of: '', website_fetch_status: 'not_fetched', classify_confidence: '', exclude_stage: 'maps_qualify', place_id: a.place_id, latitude: a.latitude, longitude: a.longitude }; });
  const all = [...unique, ...mapsRows];
  const out = path.join(run, 'deliverable'); fs.mkdirSync(out, { recursive: true });
  writeCsv(path.join(out, 'pool_builders_all.csv'), [...all, ...dupes], COLS);
  writeCsv(path.join(out, 'pool_builders_qualified.csv'), unique.filter(r => r.verdict === 'Qualified').sort((x, y) => (x.priority || 'Z').localeCompare(y.priority || 'Z') || y._rv - x._rv), COLS);
  writeCsv(path.join(out, 'pool_builders_review.csv'), unique.filter(r => r.verdict === 'Review'), COLS);
  writeCsv(path.join(out, 'pool_builders_excluded.csv'), all.filter(r => r.verdict === 'Exclude'), COLS);
  // summary
  const cnt = (list, f) => { const m = {}; for (const r of list) { const k = f(r) || '(blank)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
  const q = unique.filter(r => r.verdict === 'Qualified'), rv = unique.filter(r => r.verdict === 'Review'), ex = all.filter(r => r.verdict === 'Exclude');
  const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
  const fill = list => ({ website: pct(list.filter(r => r.website).length, list.length), phone: pct(list.filter(r => r.phone_e164).length, list.length), email: pct(list.filter(r => r.email).length, list.length), facebook: pct(list.filter(r => r.facebook_url).length, list.length), owner_name: pct(list.filter(r => r.owner_name).length, list.length) });
  const byStateQ = cnt(q, r => r.state), byStateAll = cnt(unique, r => r.state);
  const byState = Object.fromEntries(Object.keys(byStateAll).map(s => [s, { site_text_rows: byStateAll[s], qualified: byStateQ[s] || 0, review: rv.filter(r => r.state === s).length }]));
  const summary = { generated: new Date().toISOString(), unique_businesses_after_maps_qualify: unique.length, duplicates_collapsed_phone_or_name_plus_street: dupes.length, maps_stage_excluded: mapsRows.length, total_unique_collected: unique.length + mapsRows.length, qualified: q.length, review: rv.length, excluded_total: ex.length, excluded_site_text: ex.length - mapsRows.length, by_verdict_reason: cnt([...unique, ...mapsRows], r => r.verdict_reason.split(':')[0]), by_state: byState, by_pool_type_qualified: cnt(q, r => r.pool_type), qualified_priority: cnt(q, r => r.priority), brand_families_qualified: cnt(q.filter(r => r.brand_family), r => r.brand_family), fill_qualified_pct: fill(q), fill_all_site_rows_pct: fill(unique), website_fetch_status: cnt(unique, r => r.website_fetch_status) };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  const md = [`# Pool builders — deliverable summary (${summary.generated.slice(0, 10)})`, '', `| metric | count |`, `|---|---|`, `| Unique businesses collected (after Maps dedupe + geo gate) | ${summary.total_unique_collected} |`, `| Excluded at the Maps stage (type/name denies, not in ICP) | ${summary.maps_stage_excluded} |`, `| Reached the site-text gate | ${summary.unique_businesses_after_maps_qualify} |`, `| **Qualified** (new in-ground residential construction stated on the site) | **${summary.qualified}** |`, `| Review (pool company, construction not confirmed / no usable site text) | ${summary.review} |`, `| Excluded at the site-text gate (service-only, retail-only, commercial-only, not pool) | ${summary.excluded_site_text} |`, `| Duplicates collapsed (same phone+street or name+street) | ${summary.duplicates_collapsed_phone_or_name_plus_street} |`, '', '## Qualified by state', '', '| state | reached site gate | qualified | review |', '|---|---|---|---|', ...Object.entries(byState).sort((a, b) => b[1].qualified - a[1].qualified).map(([s, v]) => `| ${s} | ${v.site_text_rows} | ${v.qualified} | ${v.review} |`), '', '## Qualified by pool construction type', '', '| pool type | qualified |', '|---|---|', ...Object.entries(summary.by_pool_type_qualified).map(([k, v]) => `| ${k} | ${v} |`), '', '## Field fill (Qualified rows)', '', '| field | % |', '|---|---|', ...Object.entries(summary.fill_qualified_pct).map(([k, v]) => `| ${k} | ${v}% |`), '', '## Verdict reasons (all rows)', '', '| reason | rows |', '|---|---|', ...Object.entries(summary.by_verdict_reason).map(([k, v]) => `| ${k} | ${v} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'summary.md'), md);
  return summary;
}

if (SELF_TEST) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-')); const run = path.join(tmp, '2026-01-01_t'); fs.mkdirSync(path.join(run, 'classify', 'out'), { recursive: true }); fs.mkdirSync(path.join(run, 'owner'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'atlas-growth-pools-runsheet.csv'), 'cell_id,icp_type,query,lat,lng,zoom,priority\nfl-tampa-q0,pool,Swimming pool contractor,27.95,-82.46,13,P1\ntx-austin-q0,pool,Swimming pool contractor,30.27,-97.74,13,P1\n');
  const AH = 'place_id,name,icp_type,google_types,full_address,city,zip,latitude,longitude,website,phone_number,rating,review_count,place_link,website_class,root_domain,location_count,is_multi_location,brand_family,rep_place_id';
  fs.writeFileSync(path.join(run, 'leads_annotated.csv'), [AH,
    'A1,Blue Sky Pools,pool,Swimming pool contractor,"123 Main St, Tampa, FL 33602","Tampa, FL",33602,27.95,-82.46,http://blueskypools.com/,813-555-0101,4.8,42,https://maps.google.com/?cid=1,site,blueskypools.com,1,false,,A1',
    'A2,Blue Sky Pools Inc,pool|kw:pool,Swimming pool contractor,"123 Main Street, Tampa, FL 33602","Tampa, FL",33602,27.95,-82.46,,(813) 555-0101,4.0,3,https://maps.google.com/?cid=2,none,,1,false,,A2',
    'A3,Premier Pools of Austin,pool,Swimming pool contractor,"1 Pool Way, Austin, TX 78701","Austin, TX",78701,30.27,-97.74,https://premierpoolsandspas.com/austin,512-555-0102,4.5,210,https://maps.google.com/?cid=3,site,premierpoolsandspas.com,2,true,Premier Pools & Spas,A3',
    'A4,Premier Pools of Round Rock,pool,Swimming pool contractor,"9 Lake Rd, Round Rock, TX 78664","Round Rock, TX",78664,30.50,-97.68,https://premierpoolsandspas.com/roundrock,512-555-0199,4.6,80,https://maps.google.com/?cid=4,site,premierpoolsandspas.com,2,true,Premier Pools & Spas,A3',
    'A5,Pool Troopers,pool,Pool cleaning service,"3 Route Rd, Fort Myers, FL 33901","Fort Myers, FL",33901,26.64,-81.87,https://pooltroopers.com/,239-555-0104,4.2,88,https://maps.google.com/?cid=5,site,pooltroopers.com,1,false,Pool Troopers (service),A5',
    'A6,Gunite Guys,kw:pool,General contractor,"7 Dry Rd, Mesa, AZ 85201","Mesa, AZ",85201,33.42,-111.83,https://guniteguys.example/,480-555-0106,5.0,2,https://maps.google.com/?cid=6,site,guniteguys.example,1,false,,A6',
    'A7,SAB Pools,pool,Swimming pool contractor,,,,27.96,-82.47,,813-555-0107,4.9,12,https://maps.google.com/?cid=7,none,,1,false,,A7'].join('\n') + '\n');
  fs.writeFileSync(path.join(run, 'excluded_maps.csv'), 'place_id,name,icp_type,google_types,full_address,city,zip,latitude,longitude,website,phone_number,rating,review_count,place_link,drop_reason\nX1,Rack & Cue Billiards,pool,Pool hall,"5 Cue St, Houston, TX 77001","Houston, TX",77001,29.76,-95.37,,713-555-0106,4.4,150,https://maps.google.com/?cid=9,off_icp_type\n');
  fs.writeFileSync(path.join(run, 'classify', 'out', 'batch_000.json'), JSON.stringify([
    { place_id: 'A1', business_type: 'inground_builder', confidence: 'high', why: 'builds gunite pools', pool_types: ['gunite_concrete', 'fiberglass'], evidence: 'We design and build custom gunite and fiberglass pools', services: 'custom pools, remodels' },
    { place_id: 'A3', business_type: 'inground_builder', confidence: 'high', why: 'new pool construction', pool_types: ['gunite_concrete'], evidence: 'new pool construction', services: 'new pools' },
    { place_id: 'A4', business_type: 'inground_builder', confidence: 'high', why: 'new pool construction', pool_types: ['gunite_concrete'], evidence: 'new pool construction', services: 'new pools' },
    { place_id: 'A5', business_type: 'service_only', confidence: 'high', why: 'weekly cleaning only', pool_types: [], evidence: 'weekly pool cleaning and repairs', services: 'cleaning, repairs' },
    { place_id: 'A6', business_type: 'builder_unconfirmed', confidence: 'medium', why: 'gunite named, no build phrase', pool_types: ['gunite_concrete'], evidence: 'gunite specialists', services: 'gunite' }]));
  fs.writeFileSync(path.join(run, 'domain_siblings.json'), JSON.stringify({ A4: 'A3' }));
  fs.writeFileSync(path.join(run, 'owner', 'site_text.jsonl'), [JSON.stringify({ place_id: 'A1', status: 'ok', emails: ['info@blueskypools.com'], socials: { facebook: ['https://facebook.com/blueskypools'] }, pages: [{ url: 'http://blueskypools.com/', text: 'We design and build custom gunite and fiberglass pools for homeowners' }] }), JSON.stringify({ place_id: 'A3', status: 'ok', emails: [], socials: {}, pages: [{ url: 'https://premierpoolsandspas.com/austin', text: 'new pool construction' }] }), JSON.stringify({ place_id: 'A5', status: 'ok', emails: ['hello@pooltroopers.com'], socials: {}, pages: [] }), JSON.stringify({ place_id: 'A6', status: 'home_failed:403', emails: [], socials: {}, pages: [] })].join('\n') + '\n');
  fs.writeFileSync(path.join(run, 'owner', 'serp_text.jsonl'), JSON.stringify({ place_id: 'A3', emails_from_serp: ['sales@premierpoolsandspas.com'] }) + '\n');
  fs.writeFileSync(path.join(run, 'owner', 'contacts_final.jsonl'), JSON.stringify({ place_id: 'A1', primary_name: 'Jane Doe', contacts: [{ name: 'Jane Doe', title: 'Owner' }] }) + '\n');
  const s = assemble(run);
  let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
  const q = readCsv(path.join(run, 'deliverable', 'pool_builders_qualified.csv')), all = readCsv(path.join(run, 'deliverable', 'pool_builders_all.csv')), ex = readCsv(path.join(run, 'deliverable', 'pool_builders_excluded.csv')), rv = readCsv(path.join(run, 'deliverable', 'pool_builders_review.csv'));
  check('A2 collapsed into A1 (same phone+street) and reported', s.duplicates_collapsed_phone_or_name_plus_street === 1 && all.find(r => r.place_id === 'A2').duplicate_of === 'A1');
  check('branches on one domain both kept as Qualified', q.filter(r => r.org_group === 'premierpoolsandspas.com').length === 2);
  check('qualified = 3, review = 2 (incl. the SAB), excluded = 2 (1 site-text + 1 maps)', s.qualified === 3 && s.review === 2 && s.excluded_total === 2 && s.maps_stage_excluded === 1 && ex.find(r => r.place_id === 'X1').exclude_stage === 'maps_qualify');
  const a1 = q.find(r => r.place_id === 'A1');
  check('A1: phone normalised, email from site, facebook, owner, pool types, evidence page, tile', a1.phone === '(813) 555-0101' && a1.phone_e164 === '+18135550101' && a1.email === 'info@blueskypools.com' && a1.email_source === 'website' && a1.facebook_url === 'https://facebook.com/blueskypools' && a1.owner_name === 'Jane Doe' && a1.owner_title === 'Owner' && a1.pool_type === 'concrete/gunite | fiberglass' && a1.evidence_source === 'http://blueskypools.com/' && a1.discovered_near_tile === 'tampa, FL' && a1.state === 'FL' && a1.zip === '33602' && a1.priority === 'A');
  const a4 = q.find(r => r.place_id === 'A4');
  check('A4 (sibling) gets the representative site status and the SERP email only where its own', a4.website_fetch_status === 'ok' && a4.email === '' );
  check('A3 email came from serp', q.find(r => r.place_id === 'A3').email === 'sales@premierpoolsandspas.com' && q.find(r => r.place_id === 'A3').email_source === 'serp');
  const a6 = rv.find(r => r.place_id === 'A6');
  check('A6 review with unknown fetch', a6 && a6.website_fetch_status === 'home_failed:403' && a6.pool_type === 'concrete/gunite');
  const a7 = all.find(r => r.place_id === 'A7');
  check('address-less SAB row located from the nearest tile', a7.state === 'FL' && a7.city === 'Tampa' && a7.location_source === 'nearest_tile' && a7.verdict === 'Review');
  check('summary by state + fill', s.by_state.FL.qualified === 1 && s.by_state.TX.qualified === 2 && s.fill_qualified_pct.phone === 100 && fs.existsSync(path.join(run, 'deliverable', 'summary.md')));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
}
const s = assemble(RUN);
console.log(`assembled -> ${path.join(RUN, 'deliverable')}: unique ${s.total_unique_collected} | qualified ${s.qualified} | review ${s.review} | excluded ${s.excluded_total} (maps ${s.maps_stage_excluded}) | dupes ${s.duplicates_collapsed_phone_or_name_plus_street}`);
