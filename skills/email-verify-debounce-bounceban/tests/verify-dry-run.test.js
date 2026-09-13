#!/usr/bin/env node
/* Classification logic via --dry-run over seeded checkpoints (no API calls): ok → sendable; invalid/disposable → dropped;
 * catch_all + bb deliverable → sendable (recovered); unknown + bb risky → risky; catch_all without bb → unverified;
 * passthrough columns kept; BOM tolerated. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'scripts', 'verify-millionverifier-bounceban.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-')); const out = path.join(tmp, 'v'); fs.mkdirSync(out);
fs.writeFileSync(path.join(tmp, 'list.csv'), '﻿Email,name\na@x.com,A\nb@x.com,B\nc@x.com,C\nd@x.com,D\ne@x.com,E\nf@x.com,F\n');
fs.writeFileSync(path.join(out, 'mv.jsonl'), [{ email: 'a@x.com', result: 'ok' }, { email: 'b@x.com', result: 'invalid', subresult: 'mailbox_not_found' }, { email: 'c@x.com', result: 'catch_all' }, { email: 'd@x.com', result: 'unknown' }, { email: 'e@x.com', result: 'catch_all' }].map(JSON.stringify).join('\n') + '\n');
fs.writeFileSync(path.join(out, 'bounceban.jsonl'), [{ email: 'c@x.com', result: 'deliverable' }, { email: 'd@x.com', result: 'risky' }].map(JSON.stringify).join('\n') + '\n');
const rep = JSON.parse(execFileSync('node', [S, '--dry-run'], { env: { ...process.env, IN: path.join(tmp, 'list.csv'), OUT_DIR: out }, encoding: 'utf8' }));
check('verdict counts', rep.sendable === 2 && rep.dropped === 1 && rep.risky === 1 && rep.unverified === 2 && rep.dry_run === true);
const full = fs.readFileSync(path.join(out, 'list_full.csv'), 'utf8');
check('recovered detail + passthrough', /c@x\.com,C,sendable,"mv:catch_all bb:deliverable\(recovered\)"/.test(full.replace(/"/g, m => m)) || full.includes('"c@x.com","C","sendable","mv:catch_all bb:deliverable(recovered)"'));
check('files written', ['sendable', 'risky', 'dropped', 'full', 'unverified'].every(n => fs.existsSync(path.join(out, `list_${n}.csv`))));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
