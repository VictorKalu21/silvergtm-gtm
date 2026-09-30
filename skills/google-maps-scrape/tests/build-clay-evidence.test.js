#!/usr/bin/env node
/* TDD test for build-clay-csv.js --siblings + evidence_tier + appended columns.
 * Fixture: rep (site_text only) with one fanned sibling; independent with serp only; one with both;
 * one with nothing. Asserts the sibling reads the rep's text, fanned_from is set, tiers are right,
 * annotated columns pass through, and the schema is ONLY extended at the end (existing order intact).
 */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const SCRIPT = path.join(__dirname, '..', 'build-clay-csv.js');
let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }
// char-level parser: site_text/serp_text cells are multi-line inside quotes, so never split on \n first
const csv = f => { const t = fs.readFileSync(f, 'utf8'); const R = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; } if (c !== '' || r.length) { r.push(c); R.push(r); } const rows = R.filter(x => x.length > 1); const H = rows.shift(); return { H, rows: rows.map(x => Object.fromEntries(H.map((h, i) => [h, x[i] == null ? '' : x[i]]))) }; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clayev-'));
const owner = path.join(tmp, 'owner'); fs.mkdirSync(owner);
const head = 'place_id,name,icp_type,google_types,full_address,zip,neighborhood,city,phone_number,website,rating,review_count,place_link,root_domain,location_count,brand_family';
fs.writeFileSync(path.join(tmp, 'leads_annotated.csv'), [head,
  'rep1,Groundworks Dallas,fr,Foundation,1 Main,75201,,"Dallas, TX",555,https://dallas.groundworks.com,4.8,340,,groundworks.com,2,Groundworks',
  'sib1,Groundworks Houston,fr,Foundation,2 Main,77002,,"Houston, TX",556,https://houston.groundworks.com,4.7,120,,groundworks.com,2,Groundworks',
  'ind1,Two Brothers,fr,Foundation,3 Main,77003,,"Houston, TX",557,https://twobrothers.com,4.9,291,,twobrothers.com,1,',
  'both1,All Texas,fr,Foundation,4 Main,77004,,"Houston, TX",558,https://alltexas.com,4.5,105,,alltexas.com,1,',
  'none1,Ghost Piers,fr,Foundation,5 Main,77005,,"Houston, TX",559,https://ghostpiers.com,4.0,2,,ghostpiers.com,1,',
].join('\n') + '\n');
fs.writeFileSync(path.join(owner, 'site_text.jsonl'), [
  JSON.stringify({ place_id: 'rep1', pages: [{ label: 'home', text: 'Meet our team: Jane Doe, President of Groundworks.' }], emails: ['info@groundworks.com'] }),
  JSON.stringify({ place_id: 'both1', pages: [{ label: 'home', text: 'Owner Bob Smith founded All Texas in 1999.' }], emails: [] }),
].join('\n') + '\n');
fs.writeFileSync(path.join(owner, 'serp_text.jsonl'), [
  JSON.stringify({ place_id: 'ind1', biased_text: '1. Two Brothers owner Mike Jones - LinkedIn' }),
  JSON.stringify({ place_id: 'both1', linkedin_text: 'Bob Smith - Owner - All Texas' }),
].join('\n') + '\n');
fs.writeFileSync(path.join(tmp, 'domain_siblings.json'), JSON.stringify({ reps: { rep1: { root_domain: 'groundworks.com', siblings: ['sib1'] } }, sibling_of: { sib1: 'rep1' } }));
fs.writeFileSync(path.join(tmp, 'owner-prompt.md'), '# test prompt\n');
const out = path.join(tmp, 'clay.csv');
const log = execFileSync(process.execPath, [SCRIPT, '--leads', path.join(tmp, 'leads_annotated.csv'), '--dir', owner, '--out', out, '--siblings', path.join(tmp, 'domain_siblings.json')], { encoding: 'utf8' });
const { H, rows } = csv(out);
const by = id => rows.find(r => r.place_id === id);

check('schema: original 18 columns unchanged in order', H.slice(0, 18).join(',') === 'place_id,business_name,icp_type,google_types,full_address,zip,neighborhood,city,phone,website,emails,rating,review_count,place_link,ch_company,ch_directors,site_text,serp_text');
check('schema: new columns appended at END', H.slice(18).join(',') === 'root_domain,location_count,brand_family,fanned_from,evidence_tier');
check('rep1: SITE_ONLY, not fanned', by('rep1').evidence_tier === 'SITE_ONLY' && by('rep1').fanned_from === '');
check('sib1: reads rep text (fanned)', by('sib1').site_text.includes('Jane Doe') && by('sib1').fanned_from === 'rep1' && by('sib1').evidence_tier === 'SITE_ONLY');
check('sib1: emails fanned from rep too', by('sib1').emails === 'info@groundworks.com');
check('ind1: SERP_ONLY', by('ind1').evidence_tier === 'SERP_ONLY' && by('ind1').site_text === '');
check('both1: SITE+SERP', by('both1').evidence_tier === 'SITE+SERP');
check('none1: NONE', by('none1').evidence_tier === 'NONE');
check('annotated cols pass through', by('rep1').root_domain === 'groundworks.com' && by('rep1').location_count === '2' && by('rep1').brand_family === 'Groundworks' && by('ind1').brand_family === '');
check('summary prints tiers + NONE note', /evidence_tier:/.test(log) && /NONE — nothing for the Clay column/.test(log) && /fanned from a domain representative: 1/.test(log));

// without --siblings: sibling has no text of its own -> NONE, no fanned_from (backward compatible)
const out2 = path.join(tmp, 'clay2.csv');
execFileSync(process.execPath, [SCRIPT, '--leads', path.join(tmp, 'leads_annotated.csv'), '--dir', owner, '--out', out2], { stdio: 'pipe' });
const r2 = csv(out2).rows.find(r => r.place_id === 'sib1');
check('no --siblings: sib1 is NONE with empty fanned_from', r2.evidence_tier === 'NONE' && r2.fanned_from === '' && r2.site_text === '');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
