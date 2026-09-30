#!/usr/bin/env node
/* verify-millionverifier-bounceban.js — two-stage email gate (SKILL.md): MillionVerifier, then
 * BounceBan on everything BounceBan can still recover. Resumable via append-only JSONL checkpoints.
 *
 *   IN=<list.csv> OUT_DIR=<dir> node scripts/verify-millionverifier-bounceban.js [--concurrency 4] [--dry-run]
 *                                                                               [--bb-on catch_all,unknown,error,invalid]
 *
 * Keys: EMAIL_VERIFY_ENV (path) or "$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env"
 *   with MILLIONVERIFIER_KEY=... and BOUNCEBAN_KEY=... ; or the two env vars directly. Never committed.
 * CSV needs an exact `Email` column; every other column passes through.
 * Outputs: <stem>_sendable.csv, <stem>_risky.csv, <stem>_dropped.csv, <stem>_full.csv, mv.jsonl, bounceban.jsonl.
 * --dry-run classifies from the checkpoints only (no API calls); rows without a checkpoint are left `unverified`.
 *
 * Routing (operator directive 2026-09-17, IMPROVEMENTS.md): BounceBan also recovers MV `invalid` and
 * `error`, so the default `--bb-on` set is catch_all,unknown,error,invalid — measured on the Atlas
 * Growth UK run, 3 of the first 4 MV-invalid addresses came back deliverable. An MV `invalid` that
 * BounceBan calls `deliverable` is overridden to sendable (`bb:recovered_from_invalid`); anything else
 * stays dropped with the MV reason. `disposable` is never sent. `--bb-on catch_all,unknown,error`
 * restores the old behaviour.
 *
 * Verified 2026-09-12: MV `GET api.millionverifier.com/api/v3/?api=KEY&email=&timeout=20` → {result: ok|catch_all|
 * unknown|disposable|invalid|error, role, free, credits}. BounceBan `GET api.bounceban.com/v1/verify/single?email=`
 * with header `Authorization: KEY` → {result: deliverable|undeliverable|risky|unknown, is_accept_all, is_role,
 * credits_consumed, credits_remaining, status:"success"}; OR {status:"verifying", id, try_again_at} → poll
 * GET /v1/verify/single/status?id=<id> (same header) until `result` appears.
 */
const fs = require('fs'), path = require('path');

// ---- routing + classification (pure; exported so the test can assert them without a network) -----
// The MV results BounceBan is allowed to re-try. `''` is always in the set: a stage-1 record with no
// `result` at all is an MV error by another name, and an error is exactly what BounceBan can answer.
const BB_ON_DEFAULT = ['catch_all', 'unknown', 'error', 'invalid'];
const BB_ON_LEGACY = ['catch_all', 'unknown', 'error'];          // the pre-2026-09-17 set: --bb-on catch_all,unknown,error
const NEVER_BB = new Set(['ok', 'disposable']);                  // ok needs nothing; disposable is never recoverable
const mvResult = m => String((m && m.result) || '').toLowerCase().trim();
const bbResult = b => String((b && b.result) || '').toLowerCase().trim();
function parseBbOn(spec) {
  const list = String(spec || '').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(list.length ? list : BB_ON_DEFAULT);
  for (const r of NEVER_BB) if (set.delete(r)) console.error(`WARN: --bb-on ${r} ignored (${r} is never sent to BounceBan)`);
  set.add('');
  return set;
}
// Does this address still need stage 2? `!m` means stage 1 produced no record at all — which used to
// silently exclude the address from stage 2 (see IMPROVEMENTS.md 2026-09-17); BounceBan is its only chance.
function needsBB(m, bbOn) {
  if (!m) return true;
  const r = mvResult(m);
  if (NEVER_BB.has(r)) return false;
  return bbOn.has(r);
}
function classify(m, b, bbOn) {
  bbOn = bbOn || parseBbOn();
  if (!m && !b) return ['unverified', 'no stage-1 result'];
  const r = mvResult(m);
  const sub = m && m.subresult ? '/' + m.subresult : '';
  const role = b && b.is_role ? ' role' : '';
  if (r === 'ok') return ['sendable', `mv:ok${m.role ? ' role' : ''}${m.free ? ' free' : ''}`];
  if (r === 'disposable') return ['dropped', `mv:disposable${sub}`];
  if (r === 'invalid') {
    // an MV `invalid` is a verdict, not a pending question: it only leaves `dropped` on a BounceBan
    // `deliverable`, and stays dropped (with the MV reason) on anything else, including no answer.
    if (!bbOn.has('invalid')) return ['dropped', `mv:invalid${sub}`];
    const br = bbResult(b);
    if (br === 'deliverable') return ['sendable', `mv:invalid bb:recovered_from_invalid${role}`];
    return ['dropped', `mv:invalid${sub}${b ? ' bb:' + (br || b.error || 'none') : ''}`];
  }
  if (!b) return ['unverified', `mv:${r || (m ? 'none' : 'missing')} awaiting bounceban`];
  const br = bbResult(b);
  if (br === 'deliverable') return ['sendable', `mv:${r || 'none'} bb:deliverable(recovered)${role}`];
  return ['risky', `mv:${r || 'none'} bb:${br || b.error || 'none'}`];
}

module.exports = { BB_ON_DEFAULT, BB_ON_LEGACY, NEVER_BB, parseBbOn, needsBB, classify, mvResult, bbResult };
if (require.main !== module) return;   // required by a test: nothing below runs (argv parse + API calls)

// ---- run path ------------------------------------------------------------------------------------
const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');
const IN = process.env.IN, OUT_DIR = process.env.OUT_DIR || 'verify';
const CONC = parseInt(arg('concurrency', '4'), 10);
const BB_ON = parseBbOn(arg('bb-on', ''));
if (!IN) { console.error('IN=<csv> required'); process.exit(1); }
function loadEnv(f) { const o = {}; if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const ENV = loadEnv(process.env.EMAIL_VERIFY_ENV || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env'));
const MV_KEY = process.env.MILLIONVERIFIER_KEY || ENV.MILLIONVERIFIER_KEY, BB_KEY = process.env.BOUNCEBAN_KEY || ENV.BOUNCEBAN_KEY;
if (!DRY && (!MV_KEY || !BB_KEY)) { console.error('MILLIONVERIFIER_KEY and BOUNCEBAN_KEY required (env file or env vars)'); process.exit(1); }

const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const L = strip(fs.readFileSync(IN, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift());
if (!H.includes('Email')) { console.error('CSV must have an exact `Email` column'); process.exit(1); }
const rows = L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); });
fs.mkdirSync(OUT_DIR, { recursive: true });
const MVF = path.join(OUT_DIR, 'mv.jsonl'), BBF = path.join(OUT_DIR, 'bounceban.jsonl');
const load = f => { const m = new Map(); if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.email) m.set(d.email.toLowerCase(), d); } catch (e) { } } return m; };
const mv = load(MVF), bb = load(BBF);
const append = (f, d) => fs.appendFileSync(f, JSON.stringify(d) + '\n');

async function getJSON(url, headers) { const r = await fetch(url, { headers }); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { error: 'non-json ' + r.status + ' ' + t.slice(0, 120) }; } }
async function mvVerify(email) {
  let d = await getJSON(`https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(MV_KEY)}&email=${encodeURIComponent(email)}&timeout=20`);
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = { result: 'error', error: 'non-object MV response' };
  d.email = d.email || email; d.checked_at = new Date().toISOString(); return d;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// BounceBan usually answers inline, but ~10% of calls return {status:"verifying", id, try_again_at} and must be polled
// on /v1/verify/single/status?id= (observed 2026-09-12: 3 of 25). Poll up to 8 times, 8 s apart.
async function bbVerify(email) {
  let d = await getJSON(`https://api.bounceban.com/v1/verify/single?email=${encodeURIComponent(email)}`, { Authorization: BB_KEY });
  for (let i = 0; i < 8 && d && d.status === 'verifying' && d.id; i++) {
    const wait = Math.max(8000, (Number(d.try_again_at) * 1000 - Date.now()) || 0);
    await sleep(Math.min(wait, 20000));
    const s = await getJSON(`https://api.bounceban.com/v1/verify/single/status?id=${encodeURIComponent(d.id)}`, { Authorization: BB_KEY });
    if (s && s.result) { d = { ...s, id: d.id, polled: i + 1 }; break; }
    if (s && s.status && s.status !== 'verifying') { d = { ...s, id: d.id, polled: i + 1 }; break; }
  }
  d.email = d.email || email; d.checked_at = new Date().toISOString(); return d;
}

async function pool(items, fn, n) { let i = 0; const w = Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }); await Promise.all(w); }
(async () => {
  const emails = [...new Set(rows.map(r => r.Email.trim().toLowerCase()).filter(Boolean))];
  let spentMV = 0, spentBB = 0, mvCallFails = 0;
  if (!DRY) {
    await pool(emails.filter(e => !mv.has(e)), async e => {
      let d;
      try { d = await mvVerify(e); }
      catch (err) {
        // THE 2026-09-17 BUG: a stage-1 call that THREW wrote no checkpoint at all, so the address had
        // no MV record, the stage-2 selection's `m &&` test skipped it, and it fell out as `unverified`
        // — never reaching BounceBan, on the first run and on every retry (20 rows on the Atlas Growth
        // UK run). A failed call is now checkpointed as a real `error` result, which routes to stage 2.
        mvCallFails++;
        d = { email: e, result: 'error', error: String((err && err.message) || err).slice(0, 200), mv_call_failed: true, checked_at: new Date().toISOString() };
        console.error('MV fail', e, (err && err.message) || err);
      }
      mv.set(e, d); append(MVF, d); spentMV++;
    }, CONC);
    const toBB = emails.filter(e => needsBB(mv.get(e), BB_ON) && !bb.has(e));
    await pool(toBB, async e => { try { const d = await bbVerify(e); bb.set(e, d); append(BBF, d); spentBB++; } catch (err) { console.error('BB fail', e, err.message); } }, Math.min(CONC, 4));
  }
  const out = { sendable: [], risky: [], dropped: [], unverified: [] };
  const full = rows.map(r => { const e = r.Email.trim().toLowerCase(); const [v, detail] = classify(mv.get(e), bb.get(e), BB_ON); const o = { ...r, verify_verdict: v, verify_detail: detail }; out[v].push(o); return o; });
  const stem = path.basename(IN).replace(/\.csv$/i, '');
  const HH = [...H, 'verify_verdict', 'verify_detail'];
  const write = (name, arr) => fs.writeFileSync(path.join(OUT_DIR, `${stem}_${name}.csv`), [HH.join(',')].concat(arr.map(o => HH.map(h => esc(o[h])).join(','))).join('\n') + '\n');
  write('sendable', out.sendable); write('risky', out.risky); write('dropped', out.dropped); write('full', full);
  if (out.unverified.length) write('unverified', out.unverified);
  const recoveredFromInvalid = full.filter(o => /bb:recovered_from_invalid/.test(o.verify_detail)).length;
  const rep = { rows: rows.length, unique_emails: emails.length, sendable: out.sendable.length, risky: out.risky.length, dropped: out.dropped.length, unverified: out.unverified.length, mv_calls_this_run: spentMV, bb_calls_this_run: spentBB, dry_run: DRY, bb_on: [...BB_ON].filter(Boolean), mv_call_failures: mvCallFails, recovered_from_invalid: recoveredFromInvalid };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep));
})();
