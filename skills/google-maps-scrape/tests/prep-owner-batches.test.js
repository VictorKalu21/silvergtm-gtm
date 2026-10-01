#!/usr/bin/env node
/* Tests prep-owner-batches.js + merge-owner-reads.js on a 5-lead fixture:
 *   L1 site text with a people page (ranked first, capped), L2 owner page only, L3 web-search
 *   evidence only, L4 nothing at all (skipped, reason `nothing`), L5 an EMPTY site_text record and
 *   nothing else but a Companies House match (reason `no_text` without --ch; a batch item with
 *   `ch_directors` with it — IMPROVEMENTS.md: the registry is evidence, and injecting it after the
 *   skip decision lost 192 leads on the UK run). Merge: a good contact, an evidence mismatch, a bad
 *   bucket, a role-word name, an unknown place_id, and a missing out file are all counted. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const PREP = path.join(__dirname, '..', 'prep-owner-batches.js'), MERGE = path.join(__dirname, '..', 'merge-owner-reads.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerread-')); const owner = path.join(tmp, 'owner'); fs.mkdirSync(path.join(owner, 'serp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'leads.csv'), 'place_id,name,full_address,zip,neighborhood,city,state,website,brand_family\nL1,Acme Piers,"1 Main St, Dallas, TX 75001",75001,,"Dallas, TX",TX,https://acme.com,\nL2,Bravo Foundation,"2 Oak, Tulsa, OK",74101,,"Tulsa, OK",OK,https://bravo.com,\nL3,Charlie Slab,"3 Elm, Wichita, KS",67201,,"Wichita, KS",KS,,\nL4,Delta Nothing,"4 Pine",,, "Houston, TX",TX,,\nL5,Echo Registry,"5 Mill Road, Bolton",,, "Bolton",,,\n');
const home = '=== home (https://acme.com)\n' + 'We fix foundations. '.repeat(300);
const team = '=== team (https://acme.com/team)\nJane Acme, Owner. Bob Smith, Estimator.';
fs.writeFileSync(path.join(owner, 'site_text.jsonl'), '﻿' + JSON.stringify({ place_id: 'L1', text: home + '\n' + team, emails: ['info@acme.com'] }) + '\n'
  + JSON.stringify({ place_id: 'L5', text: '', emails: [] }) + '\n');   // fetched, came back empty -> `no_text`, not `nothing`
// Companies House: L5 matched (the ONLY evidence it has), L3 demoted city_only, L2 a pass-2 record.
// L5 also appears in the lowconf file with a different company — the engine match must win.
fs.writeFileSync(path.join(owner, 'companies_house.jsonl'),
  JSON.stringify({ place_id: 'L5', business_name: 'Echo Registry', matched: true, confidence: 'matched', match_basis: 'postcode', ch_company: 'ECHO REGISTRY LTD', ch_number: '11111111', officers: [{ name: 'ECHO, Sam', role: 'director', appointed_on: '2015-01-01' }] }) + '\n'
  + JSON.stringify({ place_id: 'L3', business_name: 'Charlie Slab', matched: true, confidence: 'low_confidence', demoted_reason: 'city_only', ch_company: 'CHARLIE SLABBING LTD', ch_number: '33333333', officers: [{ name: 'SLAB, Tina', role: 'director', appointed_on: '2012-02-02' }] }) + '\n'
  + JSON.stringify({ place_id: 'L4', business_name: 'Delta Nothing', matched: false, reason: 'no_name_match' }) + '\n');
fs.writeFileSync(path.join(owner, 'companies_house_lowconf.jsonl'),
  JSON.stringify({ place_id: 'L5', business_name: 'Echo Registry', ch_company: 'WRONG ECHO LTD', ch_number: '99999999', officers: [{ name: 'WRONG, Guy', role: 'director', appointed_on: '2001-01-01' }] }) + '\n');
fs.writeFileSync(path.join(owner, 'companies_house_pass2.jsonl'),
  JSON.stringify({ place_id: 'L2', business_name: 'Bravo Foundation', confidence: 'exact_title', ch_company: 'BRAVO FOUNDATION LTD', ch_number: '22222222', officers: [{ name: 'BRAVO, Tom', role: 'director', appointed_on: '2010-05-05' }] }) + '\n');
fs.writeFileSync(path.join(owner, 'owner_pages.jsonl'), JSON.stringify({ place_id: 'L2', url: 'https://bravo.com/about', text: 'Meet Tom Bravo, President. ' + 'x'.repeat(5000) }) + '\n');
fs.writeFileSync(path.join(owner, 'sweep.jsonl'), JSON.stringify({ place_id: 'L3', contacts: [{ name: 'Carl Charlie', title: 'Owner', evidence: 'Carl Charlie - Owner - Charlie Slab' }] }) + '\n');
const read = path.join(owner, 'read');
const man = JSON.parse(execFileSync('node', [PREP, '--leads', path.join(tmp, 'leads.csv'), '--dir', owner, '--out', read, '--batch', '2', '--cap-site', '500', '--cap-page', '100',
  '--ch', 'companies_house.jsonl,companies_house_lowconf.jsonl,companies_house_pass2.jsonl'], { encoding: 'utf8' }));   // paths resolve against --dir
check('4 items (the registry-only lead included), 1 skipped none, 2 batches', man.items === 4 && man.skipped_none === 1 && man.batches === 2);
check('only the lead with NO evidence of any kind is skipped, with reason `nothing`', JSON.stringify(JSON.parse(fs.readFileSync(path.join(read, 'skipped_none.json'), 'utf8'))) === JSON.stringify([{ place_id: 'L4', reason: 'nothing' }]) && man.skipped_none_by_reason.nothing === 1 && !man.skipped_none_by_reason.no_text);
const b0 = JSON.parse(fs.readFileSync(path.join(read, 'batches', 'batch-0-in.json'), 'utf8'));
check('people page ranked first and BOM stripped', b0[0].place_id === 'L1' && b0[0].site_text.startsWith('=== team'));
check('site cap honoured', b0[0].site_text.length <= 500 + 2);
check('owner page cap honoured', b0[1].owner_page_text.length === 100);
check('emails passed through', b0[0].emails[0] === 'info@acme.com');
const b1 = JSON.parse(fs.readFileSync(path.join(read, 'batches', 'batch-1-in.json'), 'utf8'));
check('web-search evidence formatted', b1[0].web_search_evidence.includes('Carl Charlie — Owner: "Carl Charlie - Owner'));
// --- Companies House as evidence (the registry-only lead reaches a reader) ---
check('empty site_text + one active officer lands in a batch, NOT in skipped_none', b1[1].place_id === 'L5' && b1[1].site_text === '' && man.with_ch_directors === 3 && man.sources.ch === 3);
check('ch_directors rendered in the injector format the owner-prompt keys on',
  b1[1].ch_directors === 'Companies House [matched match]: ECHO REGISTRY LTD (11111111)\nECHO, Sam — director (appointed 2015-01-01)');
check('an engine match beats the same lead\'s low-confidence candidate', !b1[1].ch_directors.includes('WRONG ECHO'));
check('a DEMOTED city_only record reaches the reader tagged low_confidence, with the rule-3 wording',
  b1[0].ch_directors === 'Companies House [low_confidence match]  (DEMOTED: city_only — the ONLY basis for this match was the town name, so it is a CANDIDATE, not authoritative: apply Companies House rule 3 before you output anybody from it): CHARLIE SLABBING LTD (33333333)\nSLAB, Tina — director (appointed 2012-02-02)');
check('a pass-2 record carries its OWN confidence string', b0[1].ch_directors.startsWith('Companies House [exact_title match]: BRAVO FOUNDATION LTD (22222222)\n'));
check('a lead with no CH record still gets an empty ch_directors field', b0[0].ch_directors === '');
// only-missing: L3 already has a contact -> excluded
fs.writeFileSync(path.join(tmp, 'have.jsonl'), JSON.stringify({ place_id: 'L3', contacts: [{ name: 'x' }] }) + '\n');
const man2 = JSON.parse(execFileSync('node', [PREP, '--leads', path.join(tmp, 'leads.csv'), '--dir', owner, '--out', path.join(tmp, 'read2'), '--only-missing', path.join(tmp, 'have.jsonl')], { encoding: 'utf8' }));
check('--only-missing drops leads that already have a contact', man2.items === 2 && man2.skipped_already === 1);
// without --ch the registry lead is skipped again — but as `no_text` (a source had it, with no text),
// which is the number the old single `skipped_none` count hid.
check('skipped_none records a reason per lead: no_text vs nothing', man2.skipped_none === 2
  && man2.skipped_none_by_reason.no_text === 1 && man2.skipped_none_by_reason.nothing === 1
  && JSON.parse(fs.readFileSync(path.join(tmp, 'read2', 'skipped_none.json'), 'utf8')).find(x => x.place_id === 'L5').reason === 'no_text');
// merge: batch-0 out present (with a BOM), batch-1 out missing
fs.writeFileSync(path.join(read, 'batches', 'batch-0-out.json'), '﻿' + JSON.stringify({
  L1: { contacts: [
    { name: 'Jane Acme', first_name: 'Jane', title: 'Owner', role_bucket: 'owner_or_partner', is_likely_owner: true, evidence: 'Jane Acme, Owner.', source: 'website' },
    { name: 'Bob Smith', title: 'Estimator', role_bucket: 'estimator', evidence: 'Bob Smith, Estimator.', source: 'website' },
    { name: 'Nobody Here', title: 'GM', role_bucket: 'gm', evidence: 'no such quote', source: 'website' },
    { name: 'Royal Foundation Owner', title: 'Owner', role_bucket: 'owner_or_partner', evidence: 'Royal Foundation Owner', source: 'website' },
    { name: 'jane acme', title: 'Owner', role_bucket: 'owner_or_partner', evidence: 'Jane Acme, Owner.', source: 'website' },
    { name: 'Horton', title: 'CDO', role_bucket: 'other', evidence: 'Horton', source: 'serp' },
    { name: 'Free Resources', title: 'Top Secret', role_bucket: 'other', evidence: 'Free Resources', source: 'serp' },
    { name: 'Brian Bohannan', title: 'Vice President of Sales', role_bucket: 'owner_or_partner', evidence: 'Brian Bohannan - Vice President of Sales', source: 'serp' } ], confidence: 'high' },
  L2: { contacts: [], confidence: 'low', needs_review: true },
  ZZ: { contacts: [] } }));
const rep = JSON.parse(execFileSync('node', [MERGE, '--dir', read], { encoding: 'utf8' }));
check('one lead with one deduped contact', rep.leads === 2 && rep.leads_with_contacts === 1 && rep.contacts === 1 && rep.owner_level === 1);
check('drops counted: evidence, bucket, roleword, unknown id', rep.dropped_no_evidence_name === 1 && rep.dropped_bad_bucket === 1 && rep.dropped_roleword_name === 1 && rep.dropped_unknown_place_id === 1);
check('single-token, trade-word and EXCLUDE-title contacts dropped and counted', rep.dropped_single_token_name === 1 && rep.dropped_tradeword_name === 1 && rep.excluded_by_title === 1);
check('missing out file reported', rep.batches_missing_out.length === 1);
const out = fs.readFileSync(path.join(owner, 'contacts_read.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
check('primary + best_send_email fallback to site emails', out[0].primary_name === 'Jane Acme' && out[0].best_send_email === 'info@acme.com' && out[1].needs_review === true);
check('csv written', fs.existsSync(path.join(owner, 'contacts_read.csv')));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
