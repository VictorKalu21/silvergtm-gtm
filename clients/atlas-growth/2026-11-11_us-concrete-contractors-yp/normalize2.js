#!/usr/bin/env node
/* normalize2.js (tranche 2) — same filters as normalize.js; reads yp2/old + yp2/new, writes t2/, drops anything already in tranche 1 by root domain or phone — YP listings -> engine lead shape (SKILL STEP 5b entry). Job-side normaliser only (same role as
 * 2026-09-24 pull/normalize.py): everything after this runs through the google-maps-scrape engine scripts.
 *   node normalize.js        (run from this folder)
 * In : yp/yp_listings.csv (yp-search.js)
 * Out: leads_clean.csv            engine shape, one row per root domain, own-website only (+ strata, found_by, phones)
 *      no_own_website.csv         relevant listings with no own site (phone-only list; kept, not worked)
 *      not_concrete.csv           YP-loose cards dropped on category/name
 *      dup_dropped.csv            listings collapsed into another by phone / root domain
 *      normalize_report.json      counts, per stratum
 */
const fs = require('fs');
const ENG = '../../../skills/google-maps-scrape/';
const { rootDomain, isSharedHost } = require(ENG + 'shared-hosts.js');
const { csv } = require(ENG + 'build-plusvibe.js');
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const write = (f, H, rows) => fs.writeFileSync(f, [H.join(',')].concat(rows.map(r => H.map(h => esc(r[h])).join(','))).join('\n') + '\n');
const fs2 = require('fs'); fs2.mkdirSync('t2', { recursive: true });
const rows = [...csv('yp2/old/yp_listings.csv'), ...csv('yp2/new/yp_listings.csv')].filter((r, i, a) => a.findIndex(x => x.ypid === r.ypid) === i);
// tranche 1 universe (every own-site lead it kept or collapsed): never re-add
const T1 = [...csv('leads_clean.csv'), ...csv('dup_dropped.csv')]; const t1Dom = new Set(), t1Phone = new Set(), t1Yp = new Set();
for (const r of T1) { if (r.website) t1Dom.add(rootDomain(new URL(/^https?:\/\//i.test(r.website) ? r.website : 'http://' + r.website).hostname.replace(/^www\./, ''))); const p = String(r.phone_number || r.phone || '').replace(/\D/g, '').slice(-10); if (p) t1Phone.add(p); t1Yp.add(String(r.ypid || '').replace(/^yp_/, '')); }
const REL = /concrete|cement|driveway|flatwork|stamp|paving|paver|masonry|hardscape|decorative/i; // bare "patio" is NOT enough: 224 Patio-Builders-only cards are deck/cover/landscape firms
const NOT_OWN = /(^|\.)(localsearch\.com|yellowpages\.com|yp\.com|yelp\.com|angi\.com|angieslist\.com|homeadvisor\.com|thumbtack\.com|houzz\.com|bbb\.org|porch\.com|mapquest\.com|manta\.com|nextdoor\.com|buildzoom\.com|networx\.com|expertise\.com|homestars\.com|chamberofcommerce\.com|superpages\.com|dexknows\.com|yellowbot\.com|cylex[^.]*\.com)$/i;
const digits = p => String(p || '').replace(/\D/g, '').slice(-10);
const hostOf = u => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const strata = fb => [...new Set(String(fb).split(';').map(x => x.split(' @ ')[0].trim()).filter(Boolean))];

const rep = { dup_of_tranche1: 0, yp_listings: rows.length, not_concrete: 0, relevant: 0, no_own_website: 0, own_website: 0, dup_collapsed: 0, leads_out: 0, no_own_by: {}, by_stratum_in: {}, by_stratum_out: {} };
const notConcrete = [], noOwn = [], own = [];
for (const r of rows) {
  for (const s of strata(r.found_by)) rep.by_stratum_in[s] = (rep.by_stratum_in[s] || 0) + 1;
  if (!REL.test(r.categories + ' ' + r.name)) { rep.not_concrete++; notConcrete.push(r); continue; }
  rep.relevant++;
  const host = hostOf(r.website);
  let why = '';
  if (!host) why = 'blank'; else if (NOT_OWN.test(host)) why = host.endsWith('localsearch.com') ? 'localsearch_mini_page' : 'directory'; else if (isSharedHost(host)) why = 'shared_host_social';
  if (why) { rep.no_own_website++; rep.no_own_by[why] = (rep.no_own_by[why] || 0) + 1; noOwn.push({ ...r, why }); continue; }
  if (t1Yp.has(r.ypid) || t1Dom.has(rootDomain(host)) || t1Phone.has(digits(r.phone))) { rep.dup_of_tranche1++; continue; }
  rep.own_website++; own.push({ ...r, host, root: rootDomain(host) });
}
// dedupe inside the run: union-find on phone (10 digits) and root domain; keep the listing with most categories
const parent = own.map((_, i) => i); const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
const seenP = new Map(), seenD = new Map();
own.forEach((r, i) => { for (const [m, k] of [[seenP, digits(r.phone)], [seenD, r.root]]) { if (!k) continue; if (m.has(k)) parent[find(i)] = find(m.get(k)); else m.set(k, i); } });
const groups = new Map(); own.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
const out = [], dups = [];
for (const g of groups.values()) {
  g.sort((a, b) => b.categories.split('|').length - a.categories.split('|').length || (a.claimed ? -1 : 1));
  const k = g[0]; for (const d of g.slice(1)) dups.push({ kept_ypid: k.ypid, ...d }); rep.dup_collapsed += g.length - 1;
  const st = [...new Set(g.flatMap(x => strata(x.found_by)))];
  out.push({
    place_id: 'yp_' + k.ypid, name: k.name, icp_type: 'concrete', full_address: [k.street_address, k.locality].filter(Boolean).join(', '), zip: k.zip, neighborhood: '',
    city: k.city && k.state ? `${k.city}, ${k.state}` : k.city, state: k.state, phone_number: k.phone, website: k.website, google_types: k.categories.split('|').join(' | '),
    review_count: '', claimed: k.claimed, source: 'yellowpages', strata: st.join('|'), found_by: [...new Set(g.flatMap(x => x.found_by.split(';')))].join(';'), yp_url: k.yp_url, ypid: k.ypid
  });
}
for (const o of out) for (const s of o.strata.split('|')) rep.by_stratum_out[s] = (rep.by_stratum_out[s] || 0) + 1;
rep.leads_out = out.length;
const H = Object.keys(out[0]);
write('t2/leads_clean.csv', H, out);
write('t2/no_own_website.csv', ['ypid', 'name', 'phone', 'website', 'city', 'state', 'zip', 'categories', 'found_by', 'why'], noOwn);
write('t2/not_concrete.csv', ['ypid', 'name', 'categories', 'found_by'], notConcrete);
write('t2/dup_dropped.csv', ['kept_ypid', 'ypid', 'name', 'phone', 'website', 'found_by'], dups);
fs.writeFileSync('t2/normalize_report.json', JSON.stringify(rep, null, 2));
console.log(JSON.stringify(rep, null, 2));
