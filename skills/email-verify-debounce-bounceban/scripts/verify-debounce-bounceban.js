#!/usr/bin/env node
/* verify-debounce-bounceban.js — two-stage email gate (SKILL.md) with DeBounce as stage 1, then BounceBan on
 * everything BounceBan can still recover. Same inputs, outputs and routing as verify-millionverifier-bounceban.js,
 * so finalize/plusvibe steps read either runner's `<stem>_full.csv` unchanged. Resumable via JSONL checkpoints.
 *
 *   IN=<list.csv> OUT_DIR=<dir> node scripts/verify-debounce-bounceban.js [--concurrency 4] [--dry-run]
 *        [--stage1-only]            DeBounce only; report how many addresses stage 2 WOULD get, then stop
 *        [--bb-max N]               never send more than N addresses to BounceBan in this run
 *        [--bb-on catch_all,unknown,error,invalid]
 *
 * Keys: EMAIL_VERIFY_ENV (path) or "$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env" with
 *   DEBOUNCE_KEY=... and BOUNCEBAN_KEY=... . The FILE wins over an env var of the same name (2026-10-13: a cloud
 *   container exported a 5-character placeholder BOUNCEBAN_KEY that silently replaced the real key in the MV
 *   runner); the env var is only a fallback when the file has no value. Both keys are checked on free endpoints
 *   (DeBounce /v1/balance, BounceBan /v1/account) before any paid call; a rejected key aborts the run.
 *
 * DeBounce, probed 2026-10-18 (3 addresses + balance): GET https://api.debounce.io/v1/?api=KEY&email= →
 *   {debounce:{email, code, role, free_email, result:"Safe to Send"|…, reason, send_transactional, did_you_mean},
 *    success:"1", balance}; 1 credit per address; balance at GET /v1/balance/?api=KEY → {balance}.
 *   Codes (DeBounce docs): 1 syntax error · 2 spam trap · 3 disposable · 4 accept-all · 5 deliverable ·
 *   6 invalid · 7 unknown · 8 role (risky). Normalised to the MV runner's vocabulary so the routing is shared:
 *   5→ok · 4→catch_all · 7,8→unknown · 6→invalid · 3→disposable · 1→syntax · 2→spamtrap · anything else→error.
 *   `syntax` and `spamtrap` are never sent to BounceBan (not recoverable), like `disposable`.
 *
 * BounceBan checkpoint rule (IMPROVEMENTS 2026-10-13): a stage-2 line counts as done ONLY when it carries `result`.
 * An auth/HTTP error is not checkpointed (it is retried next run); a still-`verifying` answer is kept in
 * bounceban_pending.jsonl and re-polled by id (free) at the start of the next run.
 */
const fs = require('fs'), path = require('path');

// ---- normalisation + routing + classification (pure; exported for the test) ----------------------
const CODE = { '5': 'ok', '4': 'catch_all', '7': 'unknown', '8': 'unknown', '6': 'invalid', '3': 'disposable', '1': 'syntax', '2': 'spamtrap' };
function normDebounce(raw, email) {
  const d = (raw && raw.debounce) || {};
  const code = String(d.code ?? '').trim();
  const result = CODE[code] || 'error';
  return { email: String(d.email || email).toLowerCase(), result, code, reason: d.reason || '', db_result: d.result || '',
    role: d.role === 'true' || d.role === true, free: d.free_email === 'true' || d.free_email === true,
    did_you_mean: d.did_you_mean || '', error: result === 'error' ? String((raw && (raw.error || raw.message)) || (raw && raw.success === '0' ? 'success:0' : 'no code')).slice(0, 200) : undefined };
}
const BB_ON_DEFAULT = ['catch_all', 'unknown', 'error', 'invalid'];
const NEVER_BB = new Set(['ok', 'disposable', 'syntax', 'spamtrap']);
const s1Result = m => String((m && m.result) || '').toLowerCase().trim();
const bbResult = b => String((b && b.result) || '').toLowerCase().trim();
function parseBbOn(spec) {
  const list = String(spec || '').split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(list.length ? list : BB_ON_DEFAULT);
  for (const r of NEVER_BB) if (set.delete(r)) console.error(`WARN: --bb-on ${r} ignored (${r} is never sent to BounceBan)`);
  set.add('');
  return set;
}
function needsBB(m, bbOn) { if (!m) return true; const r = s1Result(m); if (NEVER_BB.has(r)) return false; return bbOn.has(r); }
function classify(m, b, bbOn) {
  bbOn = bbOn || parseBbOn();
  if (!m && !b) return ['unverified', 'no stage-1 result'];
  const r = s1Result(m);
  const why = m && m.reason ? '/' + m.reason.replace(/\s+/g, '_').toLowerCase() : '';
  const role = b && b.is_role ? ' role' : '';
  if (r === 'ok') return ['sendable', `db:ok${m.role ? ' role' : ''}${m.free ? ' free' : ''}`];
  if (NEVER_BB.has(r)) return ['dropped', `db:${r}${why}`];
  if (r === 'invalid') {
    if (!bbOn.has('invalid')) return ['dropped', `db:invalid${why}`];
    const br = bbResult(b);
    if (br === 'deliverable') return ['sendable', `db:invalid bb:recovered_from_invalid${role}`];
    return ['dropped', `db:invalid${why}${b ? ' bb:' + (br || 'none') : ''}`];
  }
  if (!b) return ['unverified', `db:${r || 'none'} awaiting bounceban`];
  const br = bbResult(b);
  if (br === 'deliverable') return ['sendable', `db:${r || 'none'} bb:deliverable(recovered)${role}`];
  return ['risky', `db:${r || 'none'} bb:${br || 'none'}`];
}
// a BounceBan answer is final only with a result; anything else is retried (error) or re-polled (verifying + id)
const bbFinal = d => !!(d && bbResult(d));
const bbPending = d => !!(d && !bbResult(d) && d.status === 'verifying' && d.id);
function loadEnv(f) { const o = {}; if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
function pickKey(name, fileEnv, procEnv) { if (fileEnv[name]) return { key: fileEnv[name], source: 'file' }; if (procEnv[name]) return { key: procEnv[name], source: 'env' }; return { key: '', source: 'missing' }; }

module.exports = { CODE, normDebounce, BB_ON_DEFAULT, NEVER_BB, parseBbOn, needsBB, classify, bbFinal, bbPending, loadEnv, pickKey };
if (require.main !== module) return;

// ---- run path ------------------------------------------------------------------------------------
const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run'), S1_ONLY = argv.includes('--stage1-only');
const IN = process.env.IN, OUT_DIR = process.env.OUT_DIR || 'verify';
const CONC = parseInt(arg('concurrency', '4'), 10);
const BB_MAX = arg('bb-max', '') === '' ? Infinity : parseInt(arg('bb-max'), 10);
const BB_ON = parseBbOn(arg('bb-on', ''));
if (!IN) { console.error('IN=<csv> required'); process.exit(1); }
const ENV = loadEnv(process.env.EMAIL_VERIFY_ENV || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env'));
const DB = pickKey('DEBOUNCE_KEY', ENV, process.env), BB = pickKey('BOUNCEBAN_KEY', ENV, process.env);
if (!DRY && !DB.key) { console.error('DEBOUNCE_KEY required (env file or env var)'); process.exit(1); }
if (!DRY && !S1_ONLY && !BB.key) { console.error('BOUNCEBAN_KEY required (env file or env var)'); process.exit(1); }

const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const L = strip(fs.readFileSync(IN, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift());
if (!H.includes('Email')) { console.error('CSV must have an exact `Email` column'); process.exit(1); }
const rows = L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); });
fs.mkdirSync(OUT_DIR, { recursive: true });
const DBF = path.join(OUT_DIR, 'debounce.jsonl'), BBF = path.join(OUT_DIR, 'bounceban.jsonl'), BBP = path.join(OUT_DIR, 'bounceban_pending.jsonl');
const load = (f, keep = () => true) => { const m = new Map(); if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.email && keep(d)) m.set(d.email.toLowerCase(), d); } catch (e) { } } return m; };
const db = load(DBF), bb = load(BBF, bbFinal), pending = load(BBP, bbPending);
for (const e of bb.keys()) pending.delete(e);
const append = (f, d) => fs.appendFileSync(f, JSON.stringify(d) + '\n');
const writePending = () => fs.writeFileSync(BBP, [...pending.values()].map(d => JSON.stringify(d)).join('\n') + (pending.size ? '\n' : ''));

async function getJSON(url, headers) { const r = await fetch(url, { headers }); const t = await r.text(); try { return { status: r.status, j: JSON.parse(t) }; } catch (e) { return { status: r.status, j: { error: 'non-json ' + r.status + ' ' + t.slice(0, 120) } }; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function dbVerify(email) {
  for (let t = 1; t <= 3; t++) {
    const { status, j } = await getJSON(`https://api.debounce.io/v1/?api=${encodeURIComponent(DB.key)}&email=${encodeURIComponent(email)}`);
    if (status === 429 || status >= 500) { await sleep(2000 * t); continue; }
    const d = normDebounce(j, email); d.checked_at = new Date().toISOString(); return d;
  }
  return { email, result: 'error', error: 'http retry exhausted', checked_at: new Date().toISOString() };
}
async function bbCall(url) { return (await getJSON(url, { Authorization: BB.key })).j; }
async function bbVerify(email) {
  let d = await bbCall(`https://api.bounceban.com/v1/verify/single?email=${encodeURIComponent(email)}`);
  for (let i = 0; i < 8 && d && d.status === 'verifying' && d.id; i++) {
    await sleep(Math.min(Math.max(8000, (Number(d.try_again_at) * 1000 - Date.now()) || 0), 20000));
    const s = await bbCall(`https://api.bounceban.com/v1/verify/single/status?id=${encodeURIComponent(d.id)}`);
    if (s && (s.result || (s.status && s.status !== 'verifying'))) { d = { ...s, id: d.id, polled: i + 1 }; break; }
  }
  d.email = d.email || email; d.checked_at = new Date().toISOString(); return d;
}
async function pool(items, fn, n) { let i = 0; const w = Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }); await Promise.all(w); }

(async () => {
  const emails = [...new Set(rows.map(r => r.Email.trim().toLowerCase()).filter(Boolean))];
  let spentDB = 0, spentBB = 0, bbErrors = 0, repolled = 0, preflight = {};
  if (!DRY) {
    // free pre-flight: a rejected key aborts before a single paid call
    const bal = (await getJSON(`https://api.debounce.io/v1/balance/?api=${encodeURIComponent(DB.key)}`)).j;
    if (!bal || bal.balance === undefined) { console.error(`DeBounce key rejected (source: ${DB.source}): ${JSON.stringify(bal).slice(0, 120)}`); process.exit(2); }
    preflight.debounce_balance_before = Number(bal.balance);
    if (!S1_ONLY) {
      const acc = (await getJSON('https://api.bounceban.com/v1/account', { Authorization: BB.key })).j;
      if (!acc || acc.available_credits === undefined) { console.error(`BounceBan key rejected (source: ${BB.source}): ${String(acc && (acc.msg || acc.error)).slice(0, 120)}`); process.exit(2); }
      preflight.bounceban_credits_before = acc.available_credits;
    }
    await pool(emails.filter(e => !db.has(e)), async e => {
      let d; try { d = await dbVerify(e); } catch (err) { d = { email: e, result: 'error', error: String((err && err.message) || err).slice(0, 200), call_failed: true, checked_at: new Date().toISOString() }; }
      db.set(e, d); append(DBF, d); spentDB++;
    }, CONC);
    if (!S1_ONLY) {
      for (const [e, p] of pending) {   // re-poll last run's still-verifying answers by id (free)
        const s = await bbCall(`https://api.bounceban.com/v1/verify/single/status?id=${encodeURIComponent(p.id)}`);
        if (s && s.result) { const d = { ...s, id: p.id, email: e, checked_at: new Date().toISOString(), polled_late: true }; bb.set(e, d); append(BBF, d); pending.delete(e); repolled++; }
      }
      const toBB = emails.filter(e => needsBB(db.get(e), BB_ON) && !bb.has(e) && !pending.has(e)).slice(0, BB_MAX);
      await pool(toBB, async e => {
        try {
          const d = await bbVerify(e);
          if (bbFinal(d)) { bb.set(e, d); append(BBF, d); spentBB++; }
          else if (bbPending(d)) { pending.set(e, d); spentBB++; }
          else { bbErrors++; if (bbErrors <= 3) console.error('BB not final', e.replace(/^[^@]+/, '<addr>'), JSON.stringify(d).slice(0, 120)); }
        } catch (err) { bbErrors++; console.error('BB fail', err.message); }
      }, Math.min(CONC, 4));
      writePending();
    }
  }
  const wouldBB = emails.filter(e => needsBB(db.get(e), BB_ON) && !bb.has(e));
  const out = { sendable: [], risky: [], dropped: [], unverified: [] };
  const full = rows.map(r => { const e = r.Email.trim().toLowerCase(); const [v, detail] = classify(db.get(e), bb.get(e), BB_ON); const o = { ...r, verify_verdict: v, verify_detail: detail }; out[v].push(o); return o; });
  const stem = path.basename(IN).replace(/\.csv$/i, '');
  const HH = [...H, 'verify_verdict', 'verify_detail'];
  const write = (name, arr) => fs.writeFileSync(path.join(OUT_DIR, `${stem}_${name}.csv`), [HH.join(',')].concat(arr.map(o => HH.map(h => esc(o[h])).join(','))).join('\n') + '\n');
  write('sendable', out.sendable); write('risky', out.risky); write('dropped', out.dropped); write('full', full);
  if (out.unverified.length) write('unverified', out.unverified);
  const stage1 = {}; for (const e of emails) { const r = s1Result(db.get(e)) || 'none'; stage1[r] = (stage1[r] || 0) + 1; }
  const rep = { rows: rows.length, unique_emails: emails.length, stage1_by_result: stage1, would_go_to_bounceban: wouldBB.length,
    sendable: out.sendable.length, risky: out.risky.length, dropped: out.dropped.length, unverified: out.unverified.length,
    debounce_calls_this_run: spentDB, bb_calls_this_run: spentBB, bb_not_final: bbErrors, bb_pending: pending.size, bb_repolled: repolled,
    dry_run: DRY, stage1_only: S1_ONLY, bb_max: Number.isFinite(BB_MAX) ? BB_MAX : null, bb_on: [...BB_ON].filter(Boolean),
    key_source: { debounce: DB.source, bounceban: BB.source }, ...preflight,
    recovered_from_invalid: full.filter(o => /bb:recovered_from_invalid/.test(o.verify_detail)).length };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep));
  if (bbErrors) process.exitCode = 3;   // a stage-2 call that never got an answer is a failure, not a quiet `risky`
})();
