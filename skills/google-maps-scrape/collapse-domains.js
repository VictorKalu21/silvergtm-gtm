#!/usr/bin/env node
/*
 * collapse-domains.js :: dedupe the owner-finding SPEND by root domain, before any credit is spent.
 *
 * Every branch of one brand shares one website, and every domain-keyed / site-keyed source
 * returns the same answer for all of them — so N branches = N paid lookups for 1 result
 * (measured elsewhere: 109 locations sharing a domain -> 43 distinct answers, 66 paid twice).
 * Enrich ONE representative per root domain, fan the answer out to its siblings at
 * build-clay time (build-clay-csv.js --siblings). Independents (1 domain = 1 place_id) are
 * untouched. Row count in clay.csv is unchanged — only the spend collapses.
 *
 * Also the ONE place that classifies a lead's website:
 *   site        -> with-website track (leads_domains.csv, one row per root domain)
 *   shared_host -> facebook.com / sites.google.com / wixsite.com ... (see shared-hosts.js):
 *                  not the business's own site, NEVER grouped (400 Facebook-only firms are not
 *                  one company), routed to the no-website recovery track
 *   none        -> no-website recovery track (SKILL STEP 5d)
 *
 * Free by-products: location_count / is_multi_location (a chain signal that needs no brand
 * list — honest limit: it only sees multi-branch presence WITHIN the scraped footprint) and
 * brand_family (name/domain match against config.brand_families, a per-client label list).
 *
 * Usage:
 *   node collapse-domains.js --in <leads_netnew.csv> --out <dir> [--config <client-config.json>]
 *
 * Config (optional): "brand_families": { "Groundworks": ["groundworks","alpha foundations"], ... }
 *   label -> list of lowercase substrings matched against "<name> <root_domain>".
 *
 * Outputs (<dir>/):
 *   leads_annotated.csv   ALL input rows + website_class, root_domain, location_count,
 *                         is_multi_location, brand_family, rep_place_id   -> build-clay --leads
 *   leads_domains.csv     representatives only (website_class=site)      -> fetch-sites / search-owner
 *   leads_nowebsite.csv   website_class in (none, shared_host)           -> STEP 5d recovery track
 *   domain_siblings.json  { reps:{rep_pid:{root_domain,siblings:[...]}}, sibling_of:{sib_pid:rep_pid} }
 *   collapse_report.json  counts incl. spend rows saved
 *
 * Representative = the branch with the most reviews (most prominent listing; tie -> first seen).
 * Design note: for a PE roll-up the corporate site names corporate leadership, not the branch GM.
 * Collapsing loses the per-branch SERP signal by design — a branch GM at a roll-up can't
 * authorize a vendor; corporate marketing can, and they're the same people across all branches.
 */
const fs = require('fs');
const path = require('path');
const { rootDomain, classifyWebsite } = require('./shared-hosts');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const IN = arg('in'), OUT = arg('out'), CFG = arg('config', '');
if (!IN || !OUT) { console.error('ERROR: --in <leads.csv> and --out <dir> required'); process.exit(1); }

function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const writeCsv = (file, head, rows) => fs.writeFileSync(file, [head.map(esc).join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\n') + '\n');

const cfg = CFG && fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG, 'utf8').replace(/^﻿/, '')) : {};
const families = Object.entries(cfg.brand_families || {}).map(([label, terms]) => [label, (Array.isArray(terms) ? terms : [terms]).map(t => String(t).toLowerCase()).filter(Boolean)]);
const brandOf = (name, dom) => { const hay = ((name || '') + ' ' + (dom || '')).toLowerCase(); for (const [label, terms] of families) if (terms.some(t => hay.includes(t))) return label; return ''; };

const rows = pc(fs.readFileSync(IN, 'utf8').replace(/^﻿/, '')).filter(r => r.length > 1);
const H = rows.shift();
if (!H.includes('place_id') || !H.includes('website')) { console.error('ERROR: input needs place_id and website columns'); process.exit(1); }
const leads = rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]])));
const nameCol = H.includes('name') ? 'name' : (H.includes('business_name') ? 'business_name' : null);
const reviews = l => { const n = parseInt(l.review_count, 10); return isFinite(n) ? n : 0; };

// 1) classify + group by root domain (site-class rows only)
const groups = new Map(); // root_domain -> [lead]
for (const l of leads) {
  l.website_class = classifyWebsite(l.website);
  l.root_domain = l.website_class === 'none' ? '' : rootDomain(l.website);
  if (l.website_class === 'site' && l.root_domain) {
    if (!groups.has(l.root_domain)) groups.set(l.root_domain, []);
    groups.get(l.root_domain).push(l);
  }
}

// 2) pick a representative per domain, annotate every row
const reps = {}, sibling_of = {};
let multiDomains = 0;
for (const [dom, members] of groups) {
  const rep = members.reduce((best, l) => (reviews(l) > reviews(best) ? l : best), members[0]);
  const sibs = members.filter(l => l !== rep).map(l => l.place_id);
  if (sibs.length) { multiDomains++; reps[rep.place_id] = { root_domain: dom, siblings: sibs }; for (const s of sibs) sibling_of[s] = rep.place_id; }
  for (const l of members) { l.location_count = String(members.length); l.is_multi_location = members.length > 1 ? 'yes' : 'no'; l.rep_place_id = rep.place_id; }
}
for (const l of leads) {
  if (l.website_class !== 'site') { l.location_count = '1'; l.is_multi_location = 'no'; l.rep_place_id = l.place_id; }
  l.brand_family = brandOf(nameCol ? l[nameCol] : '', l.website_class === 'site' ? l.root_domain : '');
}

// 3) outputs
const annotCols = [...H, 'website_class', 'root_domain', 'location_count', 'is_multi_location', 'brand_family', 'rep_place_id'];
const repRows = leads.filter(l => l.website_class === 'site' && l.rep_place_id === l.place_id);
const noSite = leads.filter(l => l.website_class !== 'site');
fs.mkdirSync(OUT, { recursive: true });
writeCsv(path.join(OUT, 'leads_annotated.csv'), annotCols, leads);
writeCsv(path.join(OUT, 'leads_domains.csv'), annotCols, repRows);
writeCsv(path.join(OUT, 'leads_nowebsite.csv'), annotCols, noSite);
fs.writeFileSync(path.join(OUT, 'domain_siblings.json'), JSON.stringify({ reps, sibling_of }, null, 1));

const withSite = leads.length - noSite.length;
const brandCounts = {}; for (const l of leads) if (l.brand_family) brandCounts[l.brand_family] = (brandCounts[l.brand_family] || 0) + 1;
const report = {
  input: leads.length,
  website_class: { site: withSite, shared_host: noSite.filter(l => l.website_class === 'shared_host').length, none: noSite.filter(l => l.website_class === 'none').length },
  root_domains: groups.size, multi_location_domains: multiDomains,
  spend_rows_before: withSite, spend_rows_after: repRows.length, spend_rows_saved: withSite - repRows.length,
  fanned_siblings: Object.keys(sibling_of).length, brand_family: brandCounts,
  outputs: { annotated: 'leads_annotated.csv', with_website_reps: 'leads_domains.csv', no_website: 'leads_nowebsite.csv', siblings: 'domain_siblings.json' },
};
fs.writeFileSync(path.join(OUT, 'collapse_report.json'), JSON.stringify(report, null, 2));
console.log(`collapse-domains: ${leads.length} rows -> ${repRows.length} owner-finding rows (${report.spend_rows_saved} saved by domain dedupe) | no-website track: ${noSite.length} (${report.website_class.shared_host} shared-host + ${report.website_class.none} none)`);
console.log(`  root domains: ${groups.size} | multi-location: ${multiDomains} | fanned siblings: ${report.fanned_siblings}${Object.keys(brandCounts).length ? ' | brand_family: ' + JSON.stringify(brandCounts) : ''}`);
console.log(`  -> ${OUT}/{leads_annotated,leads_domains,leads_nowebsite}.csv + domain_siblings.json + collapse_report.json`);
