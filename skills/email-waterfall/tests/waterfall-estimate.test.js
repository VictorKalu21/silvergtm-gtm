#!/usr/bin/env node
/* --estimate-pattern: sizes the blind-permutation step without spending. Seeded checkpoints make A
 * already sendable (quickenrich + mv ok); B and C have a name + domain and nothing cached; D has no
 * root_domain so it cannot be permuted. Asserts the counts, that `pattern` is stripped from the dry
 * cascade, mv/bb maxima, and that NO waterfall CSV or report is written. No API calls. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'scripts', 'waterfall.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfest-')); const out = path.join(tmp, 'wf'); fs.mkdirSync(out);
fs.writeFileSync(path.join(tmp, 'in.csv'), 'place_id,business_name,full_name,first_name,last_name,root_domain\nA,Acme,Jane Acme,Jane,Acme,acme.com\nB,Bravo,Bob Bravo,Bob,Bravo,bravo.com\nC,Charlie,Carl Charlie,Carl,Charlie,bravo.com\nD,Delta,Dan Delta,Dan,Delta,\n');
const k = (id, n, d) => `${id}|${n}|${d}`;
const w = (name, arr) => fs.writeFileSync(path.join(out, name + '.jsonl'), arr.map(JSON.stringify).join('\n') + '\n');
w('quickenrich', [{ key: k('A', 'jane acme', 'acme.com'), status: 'found', emails: ['jane@acme.com'] }, { key: k('B', 'bob bravo', 'bravo.com'), status: 'miss', emails: [] }]);
w('mv', [{ key: 'jane@acme.com', result: 'ok' }]);
const run = (args) => execFileSync('node', [S, ...args], { env: { ...process.env, IN: path.join(tmp, 'in.csv'), OUT_DIR: out }, encoding: 'utf8' });
const est = JSON.parse(run(['--estimate-pattern', '--rungs', 'quickenrich,pattern', '--verify', 'mv,bb']));
check('A is already sendable from checkpoints', est.contacts_in === 4 && est.already_sendable === 1);
check('B and C reach the pattern rung; D (no domain) cannot be permuted', est.contacts_for_pattern === 2 && est.domains === 1);
check('mv max = contacts × patterns; bb max = contacts when bb is on', est.patterns.length === 6 && est.mv_credits_max === 12 && est.bb_credits_max === 2);
check('nothing written in estimate mode', !fs.existsSync(path.join(out, 'in_waterfall.csv')) && !fs.existsSync(path.join(out, 'report.json')));
const est2 = JSON.parse(run(['--estimate-pattern', '--rungs', 'quickenrich,pattern', '--verify', 'mv', '--patterns', 'first,first.last']));
check('bb max is 0 without bb; --patterns changes the candidate count', est2.bb_credits_max === 0 && est2.mv_credits_max === 4);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
