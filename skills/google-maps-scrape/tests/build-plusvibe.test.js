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

// ---- (A) the OUTCOME table is the client's, and an unchecked run must not read as a clean one ----
check('fill: no outcome_by_type block = the engine US table, every row checked', fr.outcome_table === 'engine default (US foundation repair)' && fr.outcome_unchecked === 0 && fr.outcome_unchecked_types.length === 0 && fr2.outcome_unchecked === 0);
fs.mkdirSync(P('uk/batches'), { recursive: true });
fs.writeFileSync(P('cfg-uk.json'), JSON.stringify({ template: 'Hi,\n\nYou handle {{business_type}} in {{city}}. We book {{inspection_type}}; one {{inspection_singular}} into {{project_type}} jobs.',
  fallbacks: { business_type: 'damp proofing', inspection_type: 'damp surveys', inspection_singular: 'damp survey', project_type: 'treatment', city: '' }, max_value_len: 60,
  outcome_by_type: { 'damp proofing': ['treatment'], 'mini piling': ['piling', 'underpinning'], 'structural waterproofing': ['tanking'] } }));
fs.writeFileSync(P('uk/batches/batch-0-out.json'), JSON.stringify({
  L1: { business_type: 'mini piling', inspection_type: 'site surveys', inspection_singular: 'site survey', project_type: 'tanking', city: '' },              // off-trade: mini piling does not sell tanking
  L2: { business_type: 'structural waterproofing', inspection_type: 'damp surveys', inspection_singular: 'damp survey', project_type: 'tanking', city: '' },  // on-trade
  L3: { business_type: 'timber treatment', inspection_type: 'site surveys', inspection_singular: 'site survey', project_type: 'treatment', city: '' },       // not in the table at all
  L4: { business_type: 'damp proofing', inspection_type: 'site surveys\nacross the North West', inspection_singular: 'site survey', project_type: 'treatment', city: '' } }));
const uk = spawnSync('node', [SCRIPT, 'fill', '--base', P('base.csv'), '--config', P('cfg-uk.json'), '--dir', P('uk'), '--out', P('uk.csv')], { encoding: 'utf8' });
const fru = JSON.parse(uk.stdout);
check('fill: a UK config table flags mini piling -> tanking', fru.flag_outcome_off_trade.join() === 'L1' && fru.outcome_table === 'config outcome_by_type');
check('fill: a business_type outside the table is counted and WARNed, never silently passed', fru.outcome_unchecked === 1 && fru.outcome_unchecked_types.join() === 'timber treatment (1)' && /WARN: flag_outcome_off_trade CHECKED NOTHING on 1 of 4 rows/.test(uk.stderr) && /timber treatment/.test(uk.stderr));
fs.mkdirSync(P('us2/batches'), { recursive: true });
fs.writeFileSync(P('us2/batches/batch-0-out.json'), JSON.stringify({ L1: { business_type: 'mini piling', inspection_type: 'site surveys', inspection_singular: 'site survey', project_type: 'piling', city: '' } }));
const us2 = spawnSync('node', [SCRIPT, 'fill', '--base', P('base.csv'), '--config', P('cfg.json'), '--dir', P('us2'), '--out', P('us2.csv')], { encoding: 'utf8' });
check('fill: the default table WARNs on a business_type it cannot check (the silently-inert flag)', JSON.parse(us2.stdout).outcome_unchecked === 1 && JSON.parse(us2.stdout).flag_outcome_off_trade.length === 0 && /CHECKED NOTHING on 1 of 4 rows/.test(us2.stderr));

// ---- (B) an embedded newline never reaches a placeholder value --------------------------------
check('fill: a newline inside a model value is collapsed to one line before the length check', csv(P('uk.csv')).find(r => r.place_id === 'L4').inspection_type === 'site surveys across the North West');
const HEAD = 'first_name,last_name,email,city,state,business_type,inspection_type,inspection_singular,project_type,personalized_email,business_name,website,google_types,name_basis,email_kind,found_by,place_id';
fs.writeFileSync(P('base_nl.csv'), HEAD + '\n"","","info@hastingsdamp.co.uk","Hastings \nProud To Be A Respected","","","","","","","Hastings Damp","","","none","company","site_text","N1"\n');
fs.mkdirSync(P('nlpz/batches'), { recursive: true });
fs.writeFileSync(P('nlpz/batches/batch-0-out.json'), '{}');
execFileSync('node', [SCRIPT, 'fill', '--base', P('base_nl.csv'), '--config', P('cfg-uk.json'), '--dir', P('nlpz'), '--out', P('nl_upload.csv')], { encoding: 'utf8' });
const n1 = csv(P('nl_upload.csv')).find(r => r.place_id === 'N1');
check('fill: a KNOWN city carrying a newline (the Maps tagline case) is written single-line', n1.city === 'Hastings Proud To Be A Respected' && !/[\r\n]/.test(n1.city) && spawnSync('node', [SCRIPT, 'check', '--csv', P('nl_upload.csv')]).status === 0);
check('check: a multi-line personalized_email is not a line-break violation', JSON.parse(spawnSync('node', [SCRIPT, 'check', '--csv', P('upload.csv')], { encoding: 'utf8' }).stdout).linebreak_values === 0);
fs.writeFileSync(P('nl.csv'), fs.readFileSync(P('upload.csv'), 'utf8').replace('"Naperville"', '"Naper\nville"'));
const ckn = spawnSync('node', [SCRIPT, 'check', '--csv', P('nl.csv')], { encoding: 'utf8' });
check('check fails on a line break inside a placeholder column and names it', ckn.status === 1 && JSON.parse(ckn.stdout.split('\n')[0]).linebreak_values === 1 && /LINEBREAK city/.test(ckn.stdout));

// ---- (C) a blank city: the three-rung city-fallback, then base --city-overrides ---------------
fs.writeFileSync(P('cf.csv'), 'place_id,business_name,city,latitude,longitude\n' +
  'L3,T & T Waterproofing,,,\n' +               // rung 1: a focused site re-read found the base town
  'C1,Beckenham Damp Co,,51.40,-0.02\n' +       // rung 1 wins even though lat/lon are present
  'C2,Stockport Damp,,53.41,-2.16\n' +          // rung 2: town beats the district in `city`
  'C3,Fylde Damp,,53.79,-2.96\n' +              // rung 2: `city` is a district -> village
  'C4,Rotherham Damp,,,\n' +                    // rung 2: lat/lon from --leads, plain `city`
  'C5,Devon Damp,,50.7,-3.9\n' +                // rung 3: county
  'C6,Damp Detectives South West,,,\n' +        // rung 3: the area in the business name
  'C7,Nowhere Damp,,,\n' +                      // nothing: left out of the file
  'C8,Leeds Damp,Leeds,53.8,-1.5\n');           // not blank: never touched
fs.writeFileSync(P('cf_leads.csv'), 'place_id,name,latitude,longitude\nC4,Rotherham Damp,53.43,-1.35\n');
fs.mkdirSync(P('sr/batches'), { recursive: true });
fs.writeFileSync(P('sr/batches/batch-0-out.json'), JSON.stringify({ L3: { city: 'Warrington', evidence: 'from our Warrington base' }, C1: { city: 'Beckenham' }, C8: { city: 'ignored, city not blank' } }));
const FX = { C2: { address: { town: 'Stockport', city: 'Greater Manchester', county: 'Greater Manchester' } },
  C3: { address: { city: 'Fylde', village: 'Wrea Green', county: 'Lancashire' } },
  C4: { address: { city: 'Rotherham', county: 'South Yorkshire' } },
  C5: { address: { county: 'Devon' } } };
fs.writeFileSync(P('fx.json'), JSON.stringify(FX));
fs.writeFileSync(P('areas.json'), JSON.stringify({ 'South West': 'the South West' }));
const cf = JSON.parse(execFileSync('node', [SCRIPT, 'city-fallback', '--base', P('cf.csv'), '--leads', P('cf_leads.csv'), '--site-read', P('sr'),
  '--area-words', P('areas.json'), '--geocode-fixture', P('fx.json'), '--out', P('city_overrides.json')], { encoding: 'utf8' }));
const cfo = JSON.parse(fs.readFileSync(P('city_overrides.json'), 'utf8'));
check('city-fallback: per-rung counts over 9 rows, 8 of them blank', cf.rows === 9 && cf.blank_city === 8 && cf.rung1_site_read === 2 && cf.rung2_geocode === 3 && cf.rung3_county_or_name === 2 && cf.resolved === 7 && cf.unresolved === 1);
check('city-fallback: town > city > village, and a district in `city` is rejected', cfo.C2 === 'Stockport' && cfo.C3 === 'Wrea Green' && cfo.C4 === 'Rotherham' && cf.geocode_town === 1 && cf.geocode_village === 1 && cf.geocode_city === 1 && cf.district_rejected === 1);
check('city-fallback: rung 3 is county, else the area in the name, else nothing is written', cfo.C5 === 'Devon' && cfo.C6 === 'the South West' && !('C7' in cfo) && !('C8' in cfo) && cf.county === 1 && cf.name_area === 1);
check('city-fallback: --leads supplies lat/lon the base CSV does not carry', cf.geocoded === 4 && cf.geocode_failed === 0);
fs.writeFileSync(P('districts.json'), JSON.stringify({ add: ['Rotherham'] }));
const cf2 = JSON.parse(execFileSync('node', [SCRIPT, 'city-fallback', '--base', P('cf.csv'), '--leads', P('cf_leads.csv'), '--districts', P('districts.json'), '--geocode-fixture', P('fx.json'), '--out', P('cf2.json')], { encoding: 'utf8' }));
check('city-fallback: the district list is configurable (--districts add) and falls through to county', JSON.parse(fs.readFileSync(P('cf2.json'), 'utf8')).C4 === 'South Yorkshire' && cf2.district_rejected === 2 && cf2.geocode_city === 0);
// the produced file is exactly what `base --city-overrides` eats
const repo = JSON.parse(execFileSync('node', [SCRIPT, 'base', '--leads', P('leads.csv'), '--emails', P('emails.csv'), '--contacts', P('contacts.jsonl'), '--out', P('base_ovr.csv'), '--city-overrides', P('city_overrides.json')], { encoding: 'utf8' }));
const orows = Object.fromEntries(csv(P('base_ovr.csv')).map(r => [r.place_id, r]));
check('base --city-overrides applies the file before the fill, counts itself, leaves the rest alone', orows.L3.city === 'Warrington' && repo.city_overrides_applied === 1 && repo.blank_city === 0 && orows.L1.city === 'Gainesville' && repo.rows === 4 && repo.named === 2);

(async () => {
  const { cityFallback, pickGeocodeCity, DISTRICTS_DEFAULT } = require(SCRIPT);
  check('city-fallback: every observed UK district is rejected, a real town is not', DISTRICTS_DEFAULT.length === 17 && DISTRICTS_DEFAULT.every(d => pickGeocodeCity({ city: d, county: 'X' }, DISTRICTS_DEFAULT).city === '') && pickGeocodeCity({ city: 'Rotherham' }, DISTRICTS_DEFAULT).rung === 'geocode_city' && pickGeocodeCity({ town: 'Stockport', city: 'Fylde', village: 'V' }, DISTRICTS_DEFAULT).city === 'Stockport' && pickGeocodeCity({ city: 'Fylde', village: 'Wrea Green' }, DISTRICTS_DEFAULT).rung === 'geocode_village');
  const seen = [];   // the geocode is injectable, so no test ever touches the network
  const { report } = await cityFallback({ base: P('cf.csv'), leads: P('cf_leads.csv'), siteRead: P('sr'), areaWords: [{ match: 'south west', out: 'the South West' }], districts: DISTRICTS_DEFAULT,
    geocode: async (pid, lat, lon) => { if (pid === 'L3' || pid === 'C1') throw new Error('rung 1 must short-circuit before any geocode'); seen.push(`${pid}@${lat},${lon}`); return FX[pid] ?? null; } });
  check('city-fallback: an injected geocode is called once per unresolved lead, never for a rung-1 hit', report.resolved === 7 && seen.join(' ') === 'C2@53.41,-2.16 C3@53.79,-2.96 C4@53.43,-1.35 C5@50.7,-3.9');
  // (D) per-country locality order (IMPROVEMENTS 2026-09-21): au reads suburb first, strips " City", rejects an LGA
  check('city-fallback au: suburb beats the metro/LGA in `city`', pickGeocodeCity({ suburb: 'Woodridge', city: 'Logan City' }, DISTRICTS_DEFAULT, 'au').city === 'Woodridge' && pickGeocodeCity({ suburb: 'Endeavour Hills', city: 'Melbourne' }, DISTRICTS_DEFAULT, 'au').rung === 'geocode_suburb');
  check('city-fallback au: a bare `city` loses its " City" suffix, an LGA is rejected, a village still counts', pickGeocodeCity({ city: 'Logan City' }, DISTRICTS_DEFAULT, 'au').city === 'Logan' && pickGeocodeCity({ city: 'City of Casey' }, DISTRICTS_DEFAULT, 'au').city === '' && pickGeocodeCity({ city: 'Yarra Ranges Council' }, DISTRICTS_DEFAULT, 'au').city === '' && pickGeocodeCity({ village: 'Inverleigh', city: 'Shire of Golden Plains' }, DISTRICTS_DEFAULT, 'au').city === 'Inverleigh');
  check('city-fallback default (UK) order is unchanged: town > city > village, suburb ignored', pickGeocodeCity({ suburb: 'Heaton', city: 'Rotherham' }, DISTRICTS_DEFAULT).city === 'Rotherham' && pickGeocodeCity({ suburb: 'Heaton', town: 'Stockport', city: 'Fylde' }, DISTRICTS_DEFAULT, 'gb').city === 'Stockport');
  const au = await cityFallback({ base: P('cf.csv'), leads: P('cf_leads.csv'), country: 'au', districts: DISTRICTS_DEFAULT, geocode: async (pid) => (pid === 'C2' ? { address: { suburb: 'Glendale', city: 'Newcastle' } } : pid === 'C3' ? { address: { city: 'Logan City' } } : null) });
  check('city-fallback --country au: report counts geocode_suburb and carries the country', au.report.country === 'au' && au.report.geocode_suburb === 1 && au.overrides.C2 === 'Glendale' && au.overrides.C3 === 'Logan');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
