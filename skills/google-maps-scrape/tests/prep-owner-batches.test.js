#!/usr/bin/env node
/* Tests prep-owner-batches.js + merge-owner-reads.js on a 4-lead fixture:
 *   L1 site text with a people page (ranked first, capped), L2 owner page only, L3 web-search
 *   evidence only, L4 nothing (skipped). Merge: a good contact, an evidence mismatch, a bad
 *   bucket, a role-word name, an unknown place_id, and a missing out file are all counted. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const PREP = path.join(__dirname, '..', 'prep-owner-batches.js'), MERGE = path.join(__dirname, '..', 'merge-owner-reads.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ownerread-')); const owner = path.join(tmp, 'owner'); fs.mkdirSync(path.join(owner, 'serp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'leads.csv'), 'place_id,name,full_address,zip,neighborhood,city,state,website,brand_family\nL1,Acme Piers,"1 Main St, Dallas, TX 75001",75001,,"Dallas, TX",TX,https://acme.com,\nL2,Bravo Foundation,"2 Oak, Tulsa, OK",74101,,"Tulsa, OK",OK,https://bravo.com,\nL3,Charlie Slab,"3 Elm, Wichita, KS",67201,,"Wichita, KS",KS,,\nL4,Delta Nothing,"4 Pine",,, "Houston, TX",TX,,\n');
const home = '=== home (https://acme.com)\n' + 'We fix foundations. '.repeat(300);
const team = '=== team (https://acme.com/team)\nJane Acme, Owner. Bob Smith, Estimator.';
fs.writeFileSync(path.join(owner, 'site_text.jsonl'), '﻿' + JSON.stringify({ place_id: 'L1', text: home + '\n' + team, emails: ['info@acme.com'] }) + '\n');
fs.writeFileSync(path.join(owner, 'owner_pages.jsonl'), JSON.stringify({ place_id: 'L2', url: 'https://bravo.com/about', text: 'Meet Tom Bravo, President. ' + 'x'.repeat(5000) }) + '\n');
fs.writeFileSync(path.join(owner, 'sweep.jsonl'), JSON.stringify({ place_id: 'L3', contacts: [{ name: 'Carl Charlie', title: 'Owner', evidence: 'Carl Charlie - Owner - Charlie Slab' }] }) + '\n');
const read = path.join(owner, 'read');
const man = JSON.parse(execFileSync('node', [PREP, '--leads', path.join(tmp, 'leads.csv'), '--dir', owner, '--out', read, '--batch', '2', '--cap-site', '500', '--cap-page', '100'], { encoding: 'utf8' }));
check('3 items, 1 skipped none, 2 batches', man.items === 3 && man.skipped_none === 1 && man.batches === 2);
const b0 = JSON.parse(fs.readFileSync(path.join(read, 'batches', 'batch-0-in.json'), 'utf8'));
check('people page ranked first and BOM stripped', b0[0].place_id === 'L1' && b0[0].site_text.startsWith('=== team'));
check('site cap honoured', b0[0].site_text.length <= 500 + 2);
check('owner page cap honoured', b0[1].owner_page_text.length === 100);
check('emails passed through', b0[0].emails[0] === 'info@acme.com');
const b1 = JSON.parse(fs.readFileSync(path.join(read, 'batches', 'batch-1-in.json'), 'utf8'));
check('web-search evidence formatted', b1[0].web_search_evidence.includes('Carl Charlie — Owner: "Carl Charlie - Owner'));
// only-missing: L3 already has a contact -> excluded
fs.writeFileSync(path.join(tmp, 'have.jsonl'), JSON.stringify({ place_id: 'L3', contacts: [{ name: 'x' }] }) + '\n');
const man2 = JSON.parse(execFileSync('node', [PREP, '--leads', path.join(tmp, 'leads.csv'), '--dir', owner, '--out', path.join(tmp, 'read2'), '--only-missing', path.join(tmp, 'have.jsonl')], { encoding: 'utf8' }));
check('--only-missing drops leads that already have a contact', man2.items === 2 && man2.skipped_already === 1);
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
