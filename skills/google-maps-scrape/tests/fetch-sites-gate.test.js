#!/usr/bin/env node
/* The owner-prompt gate in fetch-sites.js: refuses without <run>/owner-prompt.md, passes with it
 * (also from a batch sub-dir), and --no-prompt-ok bypasses. Uses a header-only CSV so nothing is fetched. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const S = path.join(__dirname, '..', 'fetch-sites.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
const run = fs.mkdtempSync(path.join(os.tmpdir(), 'fsgate-')); const csv = path.join(run, 'leads.csv'); fs.writeFileSync(csv, 'place_id,name,website\n');
const go = (out, extra = []) => spawnSync('node', [S, '--in', csv, '--out', out, ...extra], { encoding: 'utf8', timeout: 20000 });
let r = go(path.join(run, 'owner'));
check('refuses without owner-prompt.md', r.status === 1 && /owner-prompt\.md required/.test(r.stderr));
r = go(path.join(run, 'owner'), ['--no-prompt-ok']);
check('--no-prompt-ok bypasses', !/owner-prompt\.md required/.test(r.stderr));
fs.writeFileSync(path.join(run, 'owner-prompt.md'), '# prompt\n');
r = go(path.join(run, 'owner'));
check('passes with prompt in run folder', !/owner-prompt\.md required/.test(r.stderr));
r = go(path.join(run, 'owner', 'batch-3'));
check('passes from a batch sub-dir', !/owner-prompt\.md required/.test(r.stderr));
fs.rmSync(run, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
