#!/usr/bin/env node
/* TDD test for collapse-domains.js + shared-hosts.js.
 * Fixture: a 3-branch roll-up on subdomains of one domain (rep = most reviews), an independent,
 * a Facebook-only lead, a wixsite lead, a no-website lead, a g.page short link, and a UK co.uk pair.
 * Asserts: grouping by ROOT domain (subdomains collapse), rep selection, sibling map, shared hosts
 * never grouped and routed to the no-website file, brand_family from config, row conservation.
 */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const SCRIPT = path.join(__dirname, '..', 'collapse-domains.js');
const SH = require(path.join(__dirname, '..', 'shared-hosts.js'));
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }
const csv = f => { const L = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.trim()); const H = L.shift().split(','); return L.map(l => { const c = []; let cur = '', q = false; for (const ch of l) { if (q) { if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return Object.fromEntries(H.map((h, i) => [h, c[i]])); }); };

// --- unit: shared-hosts helpers ---
check('rootDomain collapses subdomain', SH.rootDomain('https://houston.groundworks.com/foundation') === 'groundworks.com');
check('rootDomain strips www', SH.rootDomain('http://www.olshan.com') === 'olshan.com');
check('rootDomain keeps co.uk', SH.rootDomain('https://www.acme-piling.co.uk/x') === 'acme-piling.co.uk');
check('isSharedHost facebook path', SH.isSharedHost('https://www.facebook.com/AcmeFoundations') === true);
check('isSharedHost m.facebook subdomain', SH.isSharedHost('https://m.facebook.com/x') === true);
check('isSharedHost wixsite subdomain', SH.isSharedHost('https://acme.wixsite.com/site') === true);
check('isSharedHost bare host accepted', SH.isSharedHost('sites.google.com') === true);
check('isSharedHost real site false', SH.isSharedHost('https://www.acmefoundationrepair.com') === false);
check('classifyWebsite none/shared/site', SH.classifyWebsite('') === 'none' && SH.classifyWebsite('https://g.page/acme') === 'shared_host' && SH.classifyWebsite('https://acme.com') === 'site');

// --- integration: collapse-domains.js ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collapse-'));
const head = 'place_id,name,website,review_count,city';
const rows = [
  'gw1,Groundworks Houston,https://houston.groundworks.com/,120,"Houston, TX"',
  'gw2,Groundworks Dallas,https://dallas.groundworks.com/,340,"Dallas, TX"',      // most reviews -> representative
  'gw3,Alpha Foundations,https://www.groundworks.com/alpha,80,"Tampa, FL"',
  'ind1,Two Brothers Foundation Repair,https://www.twobrothersfoundation.com,291,"Houston, TX"',
  'fb1,Bubba Foundation Repair,https://www.facebook.com/bubbafoundation,15,"Waco, TX"',
  'fb2,Cletus Concrete Leveling,https://facebook.com/cletusconcrete,9,"Tyler, TX"',
  'wx1,Lone Star Piers,https://lonestar.wixsite.com/piers,4,"Austin, TX"',
  'gp1,Perma-Pier Austin,https://g.page/permapier-austin,50,"Austin, TX"',
  'nw1,No Site Slabjacking,,3,"Lubbock, TX"',
  'uk1,Acme Piling Ltd,https://www.acme-piling.co.uk/,20,London',
  'uk2,Acme Piling North,https://north.acme-piling.co.uk/,25,Leeds',
];
fs.writeFileSync(path.join(tmp, 'in.csv'), [head, ...rows].join('\n') + '\n');
fs.writeFileSync(path.join(tmp, 'cfg.json'), JSON.stringify({ brand_families: { Groundworks: ['groundworks', 'alpha foundations'], 'Perma-Pier': ['perma-pier', 'permapier'] } }));
execFileSync(process.execPath, [SCRIPT, '--in', path.join(tmp, 'in.csv'), '--out', tmp, '--config', path.join(tmp, 'cfg.json')], { stdio: 'pipe' });

const ann = csv(path.join(tmp, 'leads_annotated.csv'));
const reps = csv(path.join(tmp, 'leads_domains.csv'));
const nos = csv(path.join(tmp, 'leads_nowebsite.csv'));
const sib = JSON.parse(fs.readFileSync(path.join(tmp, 'domain_siblings.json'), 'utf8'));
const rep = JSON.parse(fs.readFileSync(path.join(tmp, 'collapse_report.json'), 'utf8'));
const by = id => ann.find(r => r.place_id === id);

check('annotated keeps every input row', ann.length === rows.length);
check('annotated has new columns', ['website_class', 'root_domain', 'location_count', 'is_multi_location', 'brand_family', 'rep_place_id'].every(c => c in ann[0]));
check('subdomains group to one root domain', by('gw1').root_domain === 'groundworks.com' && by('gw3').root_domain === 'groundworks.com');
check('location_count=3 on the roll-up', by('gw1').location_count === '3' && by('gw1').is_multi_location === 'yes');
check('representative = most reviews (gw2)', by('gw1').rep_place_id === 'gw2' && by('gw2').rep_place_id === 'gw2');
check('sibling_of maps gw1,gw3 -> gw2', sib.sibling_of.gw1 === 'gw2' && sib.sibling_of.gw3 === 'gw2' && !('gw2' in sib.sibling_of));
check('reps file: gw2, ind1, uk rep only (3 rows)', reps.length === 3 && reps.some(r => r.place_id === 'gw2') && reps.some(r => r.place_id === 'ind1'));
check('UK co.uk pair grouped, rep = uk2', by('uk1').root_domain === 'acme-piling.co.uk' && by('uk1').rep_place_id === 'uk2');
check('independent is its own rep, count 1', by('ind1').rep_place_id === 'ind1' && by('ind1').location_count === '1' && by('ind1').is_multi_location === 'no');
check('facebook leads NOT grouped together', by('fb1').website_class === 'shared_host' && by('fb1').rep_place_id === 'fb1' && by('fb2').rep_place_id === 'fb2' && by('fb1').location_count === '1');
check('no-website file = fb1,fb2,wx1,gp1,nw1', nos.length === 5 && ['fb1', 'fb2', 'wx1', 'gp1', 'nw1'].every(id => nos.some(r => r.place_id === id)));
check('none vs shared_host classes', by('nw1').website_class === 'none' && by('wx1').website_class === 'shared_host' && by('gp1').website_class === 'shared_host');
check('brand_family from name', by('gw1').brand_family === 'Groundworks' && by('gw3').brand_family === 'Groundworks');
check('brand_family from name on shared-host lead too', by('gp1').brand_family === 'Perma-Pier');
check('brand_family blank on independent', by('ind1').brand_family === '');
check('report: spend rows 6 -> 3, saved 3', rep.spend_rows_before === 6 && rep.spend_rows_after === 3 && rep.spend_rows_saved === 3);
check('report: fanned siblings = 3', rep.fanned_siblings === 3);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
