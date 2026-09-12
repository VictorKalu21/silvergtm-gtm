#!/usr/bin/env node
/* prep-sweep-batches.js: excludes leads named in ANY --have file, derives state from city when the
 * state column is empty, builds the registry query, honours --batch and --limit. */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'prep-sweep-batches.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
fs.writeFileSync(path.join(tmp, 'leads.csv'), 'place_id,name,city,state,zip,website,brand_family\nA,Acme Piers,"Dallas, TX",TX,75001,https://acme.com,\nB,Bravo Foundation,"Tulsa, OK",,74101,,\nC,Charlie Slab,"Wichita, KS",KS,67201,,\nD,Delta Co,"Omaha, NE",NE,68101,,\n');
fs.writeFileSync(path.join(tmp, 'read.jsonl'), JSON.stringify({ place_id: 'A', contacts: [{ name: 'Jane' }] }) + '\n' + JSON.stringify({ place_id: 'C', contacts: [] }) + '\n');
fs.writeFileSync(path.join(tmp, 'sweep.jsonl'), '﻿' + JSON.stringify({ place_id: 'D', contacts: [{ name: 'Dan' }] }) + '\n');
const m = JSON.parse(execFileSync('node', [S, '--leads', path.join(tmp, 'leads.csv'), '--out', path.join(tmp, 'o'), '--have', path.join(tmp, 'read.jsonl'), '--have', path.join(tmp, 'sweep.jsonl'), '--batch', '1'], { encoding: 'utf8' }));
check('A and D excluded, B and C queued', m.queued === 2 && m.already_named === 2 && m.batches === 2);
const b0 = JSON.parse(fs.readFileSync(path.join(tmp, 'o', 'batches', 'batch-0-in.json'), 'utf8'))[0];
check('state derived from city when column empty', b0.place_id === 'B' && b0.state === 'OK');
check('query shape', b0.query === '"Bravo Foundation" Tulsa OK owner' && b0.registry === 'bbb.org');
const m2 = JSON.parse(execFileSync('node', [S, '--leads', path.join(tmp, 'leads.csv'), '--out', path.join(tmp, 'o2'), '--limit', '1', '--registry', 'zoominfo.com'], { encoding: 'utf8' }));
check('--limit and --registry', m2.queued === 1 && m2.registry === 'zoominfo.com');
fs.writeFileSync(path.join(tmp, 'only.json'), '﻿["C","D"]');
const m3 = JSON.parse(execFileSync('node', [S, '--leads', path.join(tmp, 'leads.csv'), '--out', path.join(tmp, 'o3'), '--only', path.join(tmp, 'only.json')], { encoding: 'utf8' }));
check('--only restricts the queue (BOM-safe)', m3.queued === 2 && m3.only === 2);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
