#!/usr/bin/env node
/* merge-owner-reads.js guardrails (IMPROVEMENTS 2026-09-20, Atlas Growth AU run): a reader returned business
 * names as owners ("Perth House", "Gold Coast", "Explosive Restumping"); the default trade-word list is US
 * foundation repair, so they all passed. Two fixes: --trade-words extends the list with the vertical's nouns
 * and place names; and, word list or not, a name that is the leading part of the business name is dropped
 * unless its first token is a personal first name (Matt Hooper House Restumping -> Matt Hooper is kept). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'merge-owner-reads.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mor-')); fs.mkdirSync(path.join(tmp, 'batches'));
const leads = [
  { place_id: 'P1', business_name: 'Perth House Restumping', city: 'Perth WA' },
  { place_id: 'P2', business_name: 'Matt Hooper House Restumping Toowoomba', city: 'Toowoomba QLD' },
  { place_id: 'P3', business_name: 'Restumping Sunbury Pty Ltd', city: 'Sunbury VIC' },
  { place_id: 'P4', business_name: 'Gold Coast Underpinning and Construction Pty Ltd', city: 'Gold Coast QLD' },
  { place_id: 'P5', business_name: 'Buildfix Group', city: 'Seven Hills NSW' },
];
const c = (name, ev) => ({ name, first_name: name.split(' ')[0], title: 'Owner', role_bucket: 'owner_or_partner', is_likely_owner: true, evidence: ev || name, source: 'website', email: '' });
const out = {
  P1: { contacts: [c('Perth House')] },                                   // the business, not a person
  P2: { contacts: [c('Matt Hooper')] },                                   // a sole trader's own name: KEEP
  P3: { contacts: [c('Sunbury Restumping', 'Sunbury Restumping team')] }, // not a leading substring: only --trade-words catches it
  P4: { contacts: [c('Gold Coast')] },                                    // a place
  P5: { contacts: [c('Dale Allan Stewart', 'Dale Allan Stewart — Director')] },
};
fs.writeFileSync(path.join(tmp, 'batches', 'batch-0-in.json'), JSON.stringify(leads));
fs.writeFileSync(path.join(tmp, 'batches', 'batch-0-out.json'), '﻿' + JSON.stringify(out));
const run = extra => { const r = JSON.parse(execFileSync('node', [S, '--dir', tmp, '--out', path.join(tmp, 'c.jsonl'), ...extra], { encoding: 'utf8' }));
  const kept = fs.readFileSync(path.join(tmp, 'c.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(d => d.contacts.length).map(d => d.place_id + ':' + d.contacts[0].name); return { r, kept }; };
const a = run([]);
check('default: business-name-as-person dropped (Perth House, Gold Coast), Matt Hooper and a real director kept', a.r.dropped_business_name === 2 && a.kept.includes('P2:Matt Hooper') && a.kept.includes('P5:Dale Allan Stewart') && !a.kept.some(k => k.startsWith('P1') || k.startsWith('P4')));
check('default: "Sunbury Restumping" is NOT caught (restumping is not in the US word list)', a.kept.includes('P3:Sunbury Restumping') && a.r.dropped_tradeword_name === 0);
const b = run(['--trade-words', 'restumping,reblocking,underpinning']);
check('--trade-words restumping drops "Sunbury Restumping" as a trade word, everything else unchanged', b.r.dropped_tradeword_name === 1 && !b.kept.some(k => k.startsWith('P3')) && b.kept.includes('P2:Matt Hooper') && b.r.dropped_business_name === 2);
check('report carries the new counter and the kept count', typeof b.r.dropped_business_name === 'number' && b.r.contacts === 2 && b.r.leads === 5);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
