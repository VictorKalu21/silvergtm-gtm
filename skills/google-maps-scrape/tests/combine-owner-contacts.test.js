#!/usr/bin/env node
/* combine-owner-contacts.js: first file wins, later files fill only unnamed leads, unnamed rows counted as read_or_swept, csv + summary written. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'combine-owner-contacts.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-'));
fs.writeFileSync(path.join(tmp, 'leads.csv'), 'place_id,name,city,state,website,brand_family,review_count\nA,Acme,"Dallas, TX",TX,,,10\nB,Bravo,"Tulsa, OK",OK,,,20\nC,Charlie,"Wichita, KS",KS,,,30\nD,Delta,"Omaha, NE",NE,,,40\n');
const c = (pid, name, role) => JSON.stringify({ place_id: pid, contacts: name ? [{ name, first_name: name.split(' ')[0], title: 'Owner', role_bucket: role, is_likely_owner: role === 'owner_or_partner', evidence: name + ' Owner', source: 'x', email: '' }] : [], primary_name: name || '', primary_first_name: name ? name.split(' ')[0] : '', primary_role: name ? role : '', primary_is_owner: role === 'owner_or_partner', confidence: 'high' });
fs.writeFileSync(path.join(tmp, 'read.jsonl'), c('A', 'Jane Acme', 'owner_or_partner') + '\n' + c('B', '', '') + '\n');
fs.writeFileSync(path.join(tmp, 'sweep.jsonl'), c('A', 'Wrong Person', 'gm') + '\n' + c('B', 'Bob Bravo', 'gm') + '\n' + c('C', '', '') + '\n');
const out = path.join(tmp, 'final.jsonl');
const sum = JSON.parse(execFileSync('node', [S, '--leads', path.join(tmp, 'leads.csv'), '--out', out, path.join(tmp, 'read.jsonl'), path.join(tmp, 'sweep.jsonl')], { encoding: 'utf8' }));
const rows = fs.readFileSync(out, 'utf8').trim().split('\n').map(JSON.parse);
check('first file wins for A', rows.find(r => r.place_id === 'A').primary_name === 'Jane Acme');
check('later file fills B', rows.find(r => r.place_id === 'B').primary_name === 'Bob Bravo' && rows.find(r => r.place_id === 'B').contacts_file === 'sweep.jsonl');
check('summary counts', sum.leads === 4 && sum.read_or_swept === 3 && sum.named === 2 && sum.owner_level_primary === 1 && sum.named_pct === 50);
check('csv + summary files', fs.existsSync(path.join(tmp, 'final.csv')) && fs.existsSync(path.join(tmp, 'final_summary.json')));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
