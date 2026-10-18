#!/usr/bin/env node
/* verify-debounce-bounceban.js, no network: DeBounce code normalisation; routing (never-BB set, default bb-on);
 * classification via --dry-run over seeded checkpoints (same verdicts as the MV runner); a BounceBan line with no
 * `result` (the 2026-10-13 auth-failure shape) is NOT treated as done; still-`verifying` lines are pending, not final;
 * the key file wins over an env var of the same name; `would_go_to_bounceban` is reported. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'scripts', 'verify-debounce-bounceban.js');
const { normDebounce, needsBB, parseBbOn, classify, bbFinal, bbPending, pickKey, loadEnv } = require(S);
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

// ---- normalisation (the 2026-10-18 probe shape) ----
const probe = { debounce: { email: 'A@x.com', code: '5', role: 'false', free_email: 'false', result: 'Safe to Send', reason: 'Deliverable' }, success: '1', balance: '8467' };
const n5 = normDebounce(probe, 'a@x.com');
check('code 5 → ok, email lowercased, flags parsed', n5.result === 'ok' && n5.email === 'a@x.com' && n5.role === false && n5.free === false);
const codes = { 4: 'catch_all', 7: 'unknown', 8: 'unknown', 6: 'invalid', 3: 'disposable', 1: 'syntax', 2: 'spamtrap' };
check('every DeBounce code maps to the shared vocabulary', Object.entries(codes).every(([c, r]) => normDebounce({ debounce: { code: c } }, 'z@x.com').result === r));
check('no code / error body → error with a reason', (d => d.result === 'error' && !!d.error)(normDebounce({ success: '0', error: 'Wrong API' }, 'z@x.com')));

// ---- routing ----
const BBON = parseBbOn('');
check('never-BB: ok, disposable, syntax, spamtrap', ['ok', 'disposable', 'syntax', 'spamtrap'].every(r => !needsBB({ result: r }, BBON)));
check('to BB: catch_all, unknown, error, invalid, and a missing stage-1 record', ['catch_all', 'unknown', 'error', 'invalid'].every(r => needsBB({ result: r }, BBON)) && needsBB(undefined, BBON));

// ---- BounceBan finality (the 2026-10-13 bug) ----
check('auth-failure line is not final', !bbFinal({ msg: 'Authorization information is missing or invalid.', email: 'a@x.com' }));
check('verifying line with id is pending, not final', bbPending({ status: 'verifying', id: 'q1', email: 'a@x.com' }) && !bbFinal({ status: 'verifying', id: 'q1' }));
check('a result line is final', bbFinal({ result: 'deliverable' }));

// ---- key precedence ----
check('file key wins over a placeholder env var', pickKey('BOUNCEBAN_KEY', { BOUNCEBAN_KEY: 'realkey123' }, { BOUNCEBAN_KEY: 'pro12' }).source === 'file');
check('env var is the fallback when the file has none', pickKey('DEBOUNCE_KEY', {}, { DEBOUNCE_KEY: 'k' }).source === 'env');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vdb-'));
fs.writeFileSync(path.join(tmp, 'k.env'), 'DEBOUNCE_KEY = "abc123" \r\nBOUNCEBAN_KEY=xyz\n');
check('env file parse strips quotes, spaces and CR', (e => e.DEBOUNCE_KEY === 'abc123' && e.BOUNCEBAN_KEY === 'xyz')(loadEnv(path.join(tmp, 'k.env'))));

// ---- dry-run classification over seeded checkpoints ----
const out = path.join(tmp, 'v'); fs.mkdirSync(out);
const jsonl = (f, rows) => fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(tmp, 'list.csv'), '﻿Email,name\nok@x.com,A\nca@x.com,B\nun@x.com,C\ninv@x.com,D\ndis@x.com,E\nsyn@x.com,F\nau@x.com,G\nnob@x.com,H\n');
jsonl(path.join(out, 'debounce.jsonl'), [
  { email: 'ok@x.com', result: 'ok' }, { email: 'ca@x.com', result: 'catch_all' }, { email: 'un@x.com', result: 'unknown' },
  { email: 'inv@x.com', result: 'invalid', reason: 'Bounce' }, { email: 'dis@x.com', result: 'disposable' }, { email: 'syn@x.com', result: 'syntax' },
  { email: 'au@x.com', result: 'catch_all' }, { email: 'nob@x.com', result: 'catch_all' }]);
jsonl(path.join(out, 'bounceban.jsonl'), [
  { email: 'ca@x.com', result: 'deliverable' }, { email: 'un@x.com', result: 'risky' }, { email: 'inv@x.com', result: 'deliverable' },
  { email: 'au@x.com', msg: 'Authorization information is missing or invalid.' }]);
const rep = JSON.parse(execFileSync('node', [S, '--dry-run'], { env: { ...process.env, IN: path.join(tmp, 'list.csv'), OUT_DIR: out }, encoding: 'utf8' }).trim().split('\n').pop());
const full = fs.readFileSync(path.join(out, 'list_full.csv'), 'utf8');
check('verdict counts', rep.sendable === 3 && rep.risky === 1 && rep.dropped === 2 && rep.unverified === 2);
check('catch_all + bb deliverable → recovered', full.includes('"ca@x.com","B","sendable","db:catch_all bb:deliverable(recovered)"'));
check('invalid + bb deliverable → recovered_from_invalid', full.includes('"inv@x.com","D","sendable","db:invalid bb:recovered_from_invalid"'));
check('syntax is dropped, never sent', full.includes('"syn@x.com","F","dropped","db:syntax"'));
check('an auth-failure bb line leaves the row awaiting bounceban, not risky', full.includes('"au@x.com","G","unverified","db:catch_all awaiting bounceban"'));
check('would_go_to_bounceban counts the auth-failed row and the untouched one', rep.would_go_to_bounceban === 2);

console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
