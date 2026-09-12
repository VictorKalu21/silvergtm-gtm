#!/usr/bin/env node
/* Cascade logic via --dry-run over seeded checkpoints (no API calls):
 * A: quickenrich found + mv ok -> sendable via quickenrich.   B: quickenrich found but mv invalid -> falls to aiark found + ok -> sendable via aiark.
 * C: quickenrich miss, aiark miss, trykitt no_credits -> none.  D: quickenrich found, mv catch_all, no bb -> risky, cascade stops (aiark not consulted). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'scripts', 'waterfall.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-')); const out = path.join(tmp, 'wf'); fs.mkdirSync(out);
fs.writeFileSync(path.join(tmp, 'in.csv'), 'place_id,business_name,full_name,first_name,last_name,root_domain\nA,Acme,Jane Acme,Jane,Acme,acme.com\nB,Bravo,Bob Bravo,Bob,Bravo,bravo.com\nC,Charlie,Carl Charlie,Carl,Charlie,charlie.com\nD,Delta,Dan Delta,Dan,Delta,delta.com\nE,Echo,Ed Echo,Ed,Echo,echo.com\n');
const k = (id, n, d) => `${id}|${n}|${d}`;
const w = (name, arr) => fs.writeFileSync(path.join(out, name + '.jsonl'), arr.map(JSON.stringify).join('\n') + '\n');
w('quickenrich', [{ key: k('A', 'jane acme', 'acme.com'), status: 'found', emails: ['jane@acme.com'], phone: '+1' }, { key: k('B', 'bob bravo', 'bravo.com'), status: 'found', emails: ['bob@bravo.com'] }, { key: k('C', 'carl charlie', 'charlie.com'), status: 'miss', emails: [] }, { key: k('D', 'dan delta', 'delta.com'), status: 'found', emails: ['dan@delta.com'] }, { key: k('E', 'ed echo', 'echo.com'), status: 'found', emails: ['n/a'] }]);
w('aiark', [{ key: k('B', 'bob bravo', 'bravo.com'), status: 'found', emails: ['robert@bravo.com'] }, { key: k('C', 'carl charlie', 'charlie.com'), status: 'miss', emails: [] }]);
w('trykitt', [{ key: k('C', 'carl charlie', 'charlie.com'), status: 'no_credits', emails: [] }]);
w('mv', [{ key: 'jane@acme.com', result: 'ok' }, { key: 'bob@bravo.com', result: 'invalid' }, { key: 'robert@bravo.com', result: 'ok' }, { key: 'dan@delta.com', result: 'catch_all' }]);
const rep = JSON.parse(execFileSync('node', [S, '--dry-run'], { env: { ...process.env, IN: path.join(tmp, 'in.csv'), OUT_DIR: out }, encoding: 'utf8' }));
const rows = fs.readFileSync(path.join(out, 'in_waterfall.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('","').map(s => s.replace(/^"|"$/g, '')));
const byId = Object.fromEntries(rows.map(r => [r[0], r]));
check('A sendable via quickenrich with phone', byId.A[6] === 'jane@acme.com' && byId.A[7] === 'quickenrich' && byId.A[8] === 'sendable' && byId.A[10] === '+1');
check('B invalid falls through to aiark', byId.B[6] === 'robert@bravo.com' && byId.B[7] === 'aiark' && byId.B[8] === 'sendable');
check('C none after miss/miss/no_credits', byId.C[8] === 'none' && /trykitt:no_credits/.test(byId.C[11]));
check('D catch_all -> risky and cascade stops', byId.D[8] === 'risky' && byId.D[6] === 'dan@delta.com' && !/aiark/.test(byId.D[11]));
check('E junk email from a cached checkpoint never reaches a verifier', byId.E[8] === 'none' && !/n\/a:/.test(byId.E[11]));
check('report per rung', rep.sendable === 2 && rep.risky === 1 && rep.none === 2 && rep.rungs.quickenrich.found === 3 && rep.rungs.quickenrich.sendable === 1 && rep.rungs.aiark.sendable === 1 && rep.rungs.trykitt.no_credits === 1);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
