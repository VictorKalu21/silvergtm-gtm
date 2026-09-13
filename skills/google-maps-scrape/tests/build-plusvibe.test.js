#!/usr/bin/env node
/* Guards the wrong-name bug of 2026-09-13: a lead's primary owner name rode on ANY address at the
 * company (Jim Briley on nathan@, Nathan Simpson on steve@, "Signature" as a first name) and a
 * role mailbox tagged "personal" upstream kept the person's name (Tyler Nelson on frontdesk@).
 * A name is attached only when the local part is built from that person's name; role mailboxes
 * are always nameless; `check` catches a hand edit; `fill` refuses to write a violating file. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync, spawnSync } = require('child_process');
const SCRIPT = path.join(__dirname, '..', 'build-plusvibe.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const { csv } = require(SCRIPT);   // the script's own multi-line-safe reader (personalized_email holds newlines)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plusvibe-'));
const P = n => path.join(tmp, n);
fs.writeFileSync(P('leads.csv'), 'place_id,name,city,state,full_address,website,google_types\n' +
  'L1,Signature Polyjacking,"Gainesville GA",,"1 Main St, Gainesville, GA 30501",https://sig.com,contractor\n' +
  'L2,Crawlspaces and More,"Nashville, TN",TN,,https://cam.com,contractor\n' +
  'L3,T & T Waterproofing,,,"9 Oak Ave, Naperville, IL 60540",https://tt.com,waterproofing\n' +
  'L4,Sanderson Quality,"Colorado Springs, CO",CO,,https://sqc.com,contractor\n');
fs.writeFileSync(P('contacts.jsonl'),
  JSON.stringify({ place_id: 'L1', contacts: [{ name: 'Nathan Simpson', role_bucket: 'owner_or_partner' }, { name: 'Steve Hall', role_bucket: 'gm' }] }) + '\n' +
  JSON.stringify({ place_id: 'L2', contacts: [{ name: 'Jim Briley', role_bucket: 'owner_or_partner' }] }) + '\n' +
  JSON.stringify({ place_id: 'L3', contacts: [{ name: 'Tyler Nelson', role_bucket: 'owner_or_partner' }] }) + '\n' +
  JSON.stringify({ place_id: 'L4', contacts: [{ name: 'Luke Sanderson', role_bucket: 'owner_or_partner' }] }) + '\n');
fs.writeFileSync(P('emails.csv'), 'place_id,business_name,contact_name,email,email_kind,found_by,verdict\n' +
  'L1,Signature Polyjacking,Nathan Simpson,steve@signaturepolyjacking.com,personal,quickenrich,sendable\n' +   // primary owner's name must NOT ride on steve@
  'L1,Signature Polyjacking,,info@signaturepolyjacking.com,company,site_text,sendable\n' +
  'L2,Crawlspaces and More,Jim Briley,nathan@crawlspacesandmore.com,personal,quickenrich,sendable\n' +           // no contact named nathan -> nameless
  'L3,T & T Waterproofing,Tyler Nelson,frontdesk@ttwaterproofing.com,personal,site_text,sendable\n' +           // role mailbox tagged personal -> nameless
  'L4,Sanderson Quality,Luke Sanderson,lsanderson@sqccolorado.com,personal,site_text,sendable\n' +             // f0+l -> named
  'L4,Sanderson Quality,,bounced@sqccolorado.com,personal,site_text,invalid\n');
const { localOwns } = require(SCRIPT);
const YES = [['josh@x.com', 'Joshua', 'Alexander'], ['dave@x.com', 'David', 'Wirtz'], ['jim@x.com', 'Jimmy', 'Gardner'], ['cj@x.com', 'Chris', 'Jackson'], ['gbev@x.com', 'Giulio', 'Bevilacqua'], ['jfpouwels@gmail.com', 'James', 'Pouwels'], ['zablocki.inc@gmail.com', 'John', 'Zablocki'], ['garrettsales@x.com', 'Garrett', 'Rushing'], ['graham.mrcrawl@gmail.com', 'Graham', 'Smith'], ['lsanderson@x.com', 'Luke', 'Sanderson'], ['chris@x.com', 'Christopher Taylor', 'Douglas']];
const NO = [['erica@x.com', 'Daniel', 'McCoy'], ['chad@x.com', 'Rick', 'Gayheart'], ['brettcesarin@x.com', 'Jeanine', 'Phelps'], ['frontdesk@x.com', 'Tyler', 'Nelson'], ['leads@x.com', 'Steve', 'Lombardi'], ['okfoundations@gmail.com', 'Neil', 'Jester'], ['hydra@x.com', 'Pat', 'Kirby'], ['nathan@x.com', 'Jim', 'Briley'], ['steve@x.com', 'Nathan', 'Simpson'], ['dtarrence@x.com', 'Tom', 'Saucier']];
check('rule: nicknames, initials, first-initial+last, last-prefix all attach', YES.every(([e, f, l]) => localOwns(e, f, l)));
check('rule: other people, role mailboxes, company gmail inboxes stay nameless', NO.every(([e, f, l]) => !localOwns(e, f, l)));
const rep = JSON.parse(execFileSync('node', [SCRIPT, 'base', '--leads', P('leads.csv'), '--emails', P('emails.csv'), '--contacts', P('contacts.jsonl'), '--out', P('base.csv')], { encoding: 'utf8' }));
const rows = Object.fromEntries(csv(P('base.csv')).map(r => [r.place_id, r]));
check('one row per lead, non-sendable dropped', rep.rows === 4 && rep.emails_sendable === 5);
check('steve@ takes Steve Hall (the contact the address is built from), not the primary owner', rows.L1.first_name === 'Steve' && rows.L1.last_name === 'Hall' && rows.L1.email.startsWith('steve@'));
check('nathan@ with no contact named Nathan is nameless', rows.L2.first_name === '' && rows.L2.name_basis === 'none');
check('frontdesk@ tagged personal upstream is still nameless', rows.L3.first_name === '' && rep.role_mailbox === 2 /* frontdesk@ + info@ */ && rep.personal_tag_not_owned === 2 /* frontdesk@ + nathan@ */);
check('lsanderson@ keeps Luke Sanderson with name_basis=local_match', rows.L4.first_name === 'Luke' && rows.L4.name_basis === 'local_match');
check('personal row beats company row for the same lead', rows.L1.email_kind === 'personal');
check('city strips trailing state token / parses from address', rows.L1.city === 'Gainesville' && rows.L3.city === 'Naperville' && rows.L3.state === 'IL');
// prep: batches only leads with site text, resumable
fs.writeFileSync(P('site.jsonl'), JSON.stringify({ place_id: 'L1', text: 'We do polyjacking. '.repeat(500) }) + '\n' + JSON.stringify({ place_id: 'L2', text: 'crawl space' }) + '\n');
const pr = JSON.parse(execFileSync('node', [SCRIPT, 'prep', '--base', P('base.csv'), '--site', P('site.jsonl'), '--dir', P('pz'), '--batch', '1', '--cap', '100'], { encoding: 'utf8' }));
check('prep: 2 batches of 1, 2 without site text', pr.items === 2 && pr.new_batches.length === 2 && pr.no_site_text === 2);
check('prep: website_text capped', JSON.parse(fs.readFileSync(P('pz/batches/batch-0-in.json'), 'utf8'))[0].website_text.length === 100);
const pr2 = JSON.parse(execFileSync('node', [SCRIPT, 'prep', '--base', P('base.csv'), '--site', P('site.jsonl'), '--dir', P('pz')], { encoding: 'utf8' }));
check('prep is resumable: second run adds nothing', pr2.items === 0 && pr2.already_batched === 2);
// fill
fs.writeFileSync(P('cfg.json'), JSON.stringify({ template: 'Hi,\n\nYou handle {{business_type}} in {{city}}. We book {{inspection_type}}; one {{inspection_singular}} into {{project_type}} jobs.',
  fallbacks: { business_type: 'foundation repair', inspection_type: 'foundation inspections', inspection_singular: 'foundation inspection', project_type: 'repair', city: '' }, max_value_len: 30 }));
fs.writeFileSync(P('pz/batches/batch-0-out.json'), JSON.stringify({ L1: { business_type: '"concrete leveling."', inspection_type: 'leveling estimates', inspection_singular: 'leveling estimate', project_type: 'lifting', city: 'Gainesville, GA' } }));
fs.writeFileSync(P('pz/batches/batch-1-out.json'), JSON.stringify({ L3: { business_type: 'concrete leveling', inspection_type: 'free leveling estimates', inspection_singular: 'leveling estimate', project_type: 'leveling', city: '' }, L4: { business_type: 'foundation repair', inspection_type: 'foundation repair inspections', inspection_singular: 'foundation repair inspection', project_type: 'waterproofing', city: '' }, L2: { business_type: 'a value that is far too long to be a trade name at all', inspection_type: 'cannot determine', inspection_singular: '', project_type: 'encapsulation', city: '' } }));
const fr = JSON.parse(execFileSync('node', [SCRIPT, 'fill', '--base', P('base.csv'), '--config', P('cfg.json'), '--dir', P('pz'), '--out', P('upload.csv')], { encoding: 'utf8' }));
const up = Object.fromEntries(csv(P('upload.csv')).map(r => [r.place_id, r]));
check('fill: quotes/period stripped, template filled', up.L1.business_type === 'concrete leveling' && up.L1.personalized_email.includes('You handle concrete leveling in Gainesville. We book leveling estimates; one leveling estimate into lifting jobs.'));
check('fill: known city wins over the model city', up.L1.city === 'Gainesville');
check('fill: too-long / cannot / blank values take the fallback', up.L2.business_type === 'foundation repair' && up.L2.inspection_type === 'foundation inspections' && up.L2.inspection_singular === 'foundation inspection' && up.L2.project_type === 'encapsulation');
check('fill: a word used three times across the trade values, and free in the visit, are flagged', fr.flag_word_used_3x.join() === 'L3' && fr.flag_free_in_visit.join() === 'L3' && fr.fallback_only === 0);
check('fill: visit repeating the trade phrase and off-trade outcome are flagged by place_id', fr.flag_visit_repeats_trade.join() === 'L4' && fr.flag_outcome_off_trade.join() === 'L2,L4' /* L2: fallback trade + encapsulation */);
// redo: the flags become the next batch (L3 + L4 + L2), and nothing to redo exits 2
const rd = JSON.parse(execFileSync('node', [SCRIPT, 'redo', '--dir', P('pz')], { encoding: 'utf8' }));
check('redo: flagged leads with site text become the next batch; flagged fallback rows are listed', rd.redo === 1 && rd.batch === 2 && rd.flagged_without_site_text.sort().join() === 'L3,L4' /* never batched: no site text */ && JSON.parse(fs.readFileSync(P('pz/batches/batch-2-in.json'), 'utf8')).map(i => i.place_id).join() === 'L2');
// a redo batch with a higher number overrides the earlier value
fs.writeFileSync(P('pz/batches/batch-10-out.json'), JSON.stringify({ L4: { business_type: 'foundation repair', inspection_type: 'foundation inspections', inspection_singular: 'foundation inspection', project_type: 'repair', city: '' } }));
fs.writeFileSync(P('pz/batches/batch-11-out.json'), JSON.stringify({ L2: { business_type: 'crawl space repair', inspection_type: 'crawl space inspections', inspection_singular: 'crawl space inspection', project_type: 'encapsulation', city: '' }, L3: { business_type: 'concrete leveling', inspection_type: 'concrete estimates', inspection_singular: 'concrete estimate', project_type: 'lifting', city: '' } }));
const fr2 = JSON.parse(execFileSync('node', [SCRIPT, 'fill', '--base', P('base.csv'), '--config', P('cfg.json'), '--dir', P('pz'), '--out', P('upload.csv')], { encoding: 'utf8' }));
check('fill: redo batch (numeric order) overrides and clears the flags', fr2.flag_outcome_off_trade.length === 0 && fr2.flag_word_used_3x.length === 0 && fr2.flag_free_in_visit.length === 0 && fr2.flag_visit_repeats_trade.length === 0 && fr2.flag_visit_repeats_trade.length === 0 && csv(P('upload.csv')).find(r => r.place_id === 'L4').project_type === 'repair');
check('fill: no unfilled placeholder anywhere', Object.values(up).every(r => !/\{\{/.test(r.personalized_email)));
// check: a hand edit that puts a name on the wrong address is caught; fill refuses to write it
check('check passes on the built upload', spawnSync('node', [SCRIPT, 'check', '--csv', P('upload.csv')]).status === 0);
fs.writeFileSync(P('edited.csv'), fs.readFileSync(P('upload.csv'), 'utf8').replace('"","","nathan@crawlspacesandmore.com"', '"Jim","Briley","nathan@crawlspacesandmore.com"'));
const ck = spawnSync('node', [SCRIPT, 'check', '--csv', P('edited.csv')], { encoding: 'utf8' });
check('check fails on Jim Briley <nathan@> and names the row', ck.status === 1 && /VIOLATION Jim Briley <nathan@/.test(ck.stdout));
const ff = spawnSync('node', [SCRIPT, 'fill', '--base', P('edited.csv'), '--config', P('cfg.json'), '--dir', P('pz'), '--out', P('never.csv')], { encoding: 'utf8' });
check('fill refuses to write a violating file', ff.status === 1 && /NAME RULE VIOLATION/.test(ff.stderr) && !fs.existsSync(P('never.csv')));
check('redo: nothing left to redo exits 2', spawnSync('node', [SCRIPT, 'redo', '--dir', P('pz')]).status === 2);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
