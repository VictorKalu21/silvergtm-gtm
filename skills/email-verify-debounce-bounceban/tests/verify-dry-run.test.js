#!/usr/bin/env node
/* Classification logic via --dry-run over seeded checkpoints (no API calls): ok → sendable; invalid/disposable → dropped;
 * catch_all + bb deliverable → sendable (recovered); unknown + bb risky → risky; catch_all without bb → unverified;
 * passthrough columns kept; BOM tolerated.
 * Plus the 2026-09-17 routing directive (IMPROVEMENTS.md): BounceBan also gets MV `invalid` and `error`
 * (a bb `deliverable` on an invalid overrides to sendable as `bb:recovered_from_invalid`, anything else stays
 * dropped with the MV reason), `disposable` is never sent, `--bb-on` restores the old set, and an MV call that
 * THREW is checkpointed as `error` so the address still reaches stage 2 (a stubbed fetch, still no network). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'scripts', 'verify-millionverifier-bounceban.js');
const { classify, needsBB, parseBbOn, BB_ON_DEFAULT, BB_ON_LEGACY } = require(S);
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-')); const out = path.join(tmp, 'v'); fs.mkdirSync(out);
const jsonl = (f, rows) => fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
const run = (dir, extra = [], env = {}) => JSON.parse(execFileSync('node', [S, '--dry-run', ...extra], { env: { ...process.env, IN: path.join(tmp, 'list.csv'), OUT_DIR: dir, ...env }, encoding: 'utf8' }).trim().split('\n').pop());

// ---- the original case: unchanged behaviour on the unchanged results ----
fs.writeFileSync(path.join(tmp, 'list.csv'), '﻿Email,name\na@x.com,A\nb@x.com,B\nc@x.com,C\nd@x.com,D\ne@x.com,E\nf@x.com,F\n');
jsonl(path.join(out, 'mv.jsonl'), [{ email: 'a@x.com', result: 'ok' }, { email: 'b@x.com', result: 'invalid', subresult: 'mailbox_not_found' }, { email: 'c@x.com', result: 'catch_all' }, { email: 'd@x.com', result: 'unknown' }, { email: 'e@x.com', result: 'catch_all' }]);
jsonl(path.join(out, 'bounceban.jsonl'), [{ email: 'c@x.com', result: 'deliverable' }, { email: 'd@x.com', result: 'risky' }]);
const rep = run(out);
check('verdict counts', rep.sendable === 2 && rep.dropped === 1 && rep.risky === 1 && rep.unverified === 2 && rep.dry_run === true);
const full = fs.readFileSync(path.join(out, 'list_full.csv'), 'utf8');
check('recovered detail + passthrough', /c@x\.com,C,sendable,"mv:catch_all bb:deliverable\(recovered\)"/.test(full.replace(/"/g, m => m)) || full.includes('"c@x.com","C","sendable","mv:catch_all bb:deliverable(recovered)"'));
check('files written', ['sendable', 'risky', 'dropped', 'full', 'unverified'].every(n => fs.existsSync(path.join(out, `list_${n}.csv`))));
check('an MV invalid with no BounceBan answer is still dropped, with the MV reason', full.includes('"b@x.com","B","dropped","mv:invalid/mailbox_not_found"'));

// ---- 2026-09-17: invalid + error are BounceBan's to recover ----
const out2 = path.join(tmp, 'v2'); fs.mkdirSync(out2);
fs.writeFileSync(path.join(tmp, 'list.csv'), 'Email,name\ni1@x.com,I1\ni2@x.com,I2\ni3@x.com,I3\ner1@x.com,E1\ner2@x.com,E2\ndi@x.com,D1\n');
jsonl(path.join(out2, 'mv.jsonl'), [
  { email: 'i1@x.com', result: 'invalid', subresult: 'mailbox_not_found' },   // bb recovers it
  { email: 'i2@x.com', result: 'invalid', subresult: 'mailbox_not_found' },   // bb says undeliverable
  { email: 'i3@x.com', result: 'invalid' },                                   // bb never answered
  { email: 'er1@x.com', result: 'error' },                                    // bb recovers it
  { email: 'er2@x.com', result: 'error', mv_call_failed: true },              // bb says unknown
  { email: 'di@x.com', result: 'disposable' },                                // never sent, always dropped
]);
jsonl(path.join(out2, 'bounceban.jsonl'), [
  { email: 'i1@x.com', result: 'deliverable' }, { email: 'i2@x.com', result: 'undeliverable' },
  { email: 'er1@x.com', result: 'deliverable' }, { email: 'er2@x.com', result: 'unknown' },
]);
const rep2 = run(out2);
const full2 = fs.readFileSync(path.join(out2, 'list_full.csv'), 'utf8');
check('an MV invalid that BounceBan calls deliverable is overridden to sendable', full2.includes('"i1@x.com","I1","sendable","mv:invalid bb:recovered_from_invalid"'));
check('an MV invalid BounceBan cannot recover stays dropped with the MV reason', full2.includes('"i2@x.com","I2","dropped","mv:invalid/mailbox_not_found bb:undeliverable"'));
check('an MV invalid with no bb record stays dropped', full2.includes('"i3@x.com","I3","dropped","mv:invalid"'));
check('an MV error that BounceBan calls deliverable is sendable', full2.includes('"er1@x.com","E1","sendable","mv:error bb:deliverable(recovered)"'));
check('an MV error BounceBan cannot recover is risky, not silently dropped', full2.includes('"er2@x.com","E2","risky","mv:error bb:unknown"'));
check('disposable is always dropped', full2.includes('"di@x.com","D1","dropped","mv:disposable"'));
check('report counts + bb_on echoed', rep2.sendable === 2 && rep2.dropped === 3 && rep2.risky === 1 && rep2.recovered_from_invalid === 1 && rep2.bb_on.join() === BB_ON_DEFAULT.join());

// ---- --bb-on is the one flag back to the old behaviour ----
const rep3 = run(out2, ['--bb-on', 'catch_all,unknown,error']);
const full3 = fs.readFileSync(path.join(out2, 'list_full.csv'), 'utf8');
check('--bb-on catch_all,unknown,error drops every invalid again', full3.includes('"i1@x.com","I1","dropped","mv:invalid/mailbox_not_found"') && rep3.sendable === 1 && rep3.dropped === 4 && rep3.bb_on.join() === BB_ON_LEGACY.join());

// ---- the routing set itself ----
const DEF = parseBbOn(''), OLD = parseBbOn('catch_all,unknown,error');
check('default routing set = catch_all/unknown/error/invalid', BB_ON_DEFAULT.every(r => DEF.has(r)) && DEF.size === BB_ON_DEFAULT.length + 1);
check('error rows are selected for stage 2', needsBB({ result: 'error' }, DEF) && needsBB({ result: 'error' }, OLD));
check('a stage-1 record with no result at all is selected', needsBB({ result: '' }, DEF) && needsBB({}, DEF));
check('an address with NO stage-1 record is selected (it used to be skipped)', needsBB(undefined, DEF));
check('invalid is selected by default and not with the old set', needsBB({ result: 'invalid' }, DEF) && !needsBB({ result: 'invalid' }, OLD));
check('ok and disposable are never selected', !needsBB({ result: 'ok' }, DEF) && !needsBB({ result: 'disposable' }, DEF));
check('--bb-on disposable is refused', !parseBbOn('catch_all,disposable').has('disposable'));
check('classify defaults to the new set when none is passed', classify({ result: 'invalid' }, { result: 'deliverable' })[0] === 'sendable');

// ---- the 20-row bug: an MV call that THREW left the address out of stage 2 entirely ----
// A stubbed global fetch (no network): MV throws, BounceBan answers deliverable.
const out4 = path.join(tmp, 'v4'); fs.mkdirSync(out4);
const stub = path.join(tmp, 'stub-fetch.js');
fs.writeFileSync(stub, `globalThis.fetch = async (url) => {
  if (/millionverifier/.test(url)) throw new Error('ECONNRESET simulated');
  return { text: async () => JSON.stringify({ email: new URL(url).searchParams.get('email'), result: 'deliverable', status: 'success' }) };
};\n`);
fs.writeFileSync(path.join(tmp, 'list.csv'), 'Email,name\nz@x.com,Z\n');
const rep4 = JSON.parse(execFileSync('node', ['--require', stub, S], { env: { ...process.env, IN: path.join(tmp, 'list.csv'), OUT_DIR: out4, MILLIONVERIFIER_KEY: 'test', BOUNCEBAN_KEY: 'test' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop());
const mvRows = fs.readFileSync(path.join(out4, 'mv.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
check('a thrown MV call is checkpointed as an error result', mvRows.length === 1 && mvRows[0].result === 'error' && mvRows[0].mv_call_failed === true && rep4.mv_call_failures === 1);
check('and the address still reaches stage 2', fs.existsSync(path.join(out4, 'bounceban.jsonl')) && rep4.bb_calls_this_run === 1);
check('and BounceBan can recover it', rep4.sendable === 1 && rep4.unverified === 0 && fs.readFileSync(path.join(out4, 'list_full.csv'), 'utf8').includes('"z@x.com","Z","sendable","mv:error bb:deliverable(recovered)"'));

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
