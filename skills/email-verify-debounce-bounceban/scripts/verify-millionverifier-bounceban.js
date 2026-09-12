#!/usr/bin/env node
/* verify-millionverifier-bounceban.js — two-stage email gate (SKILL.md): MillionVerifier, then
 * BounceBan on catch-all / unknown / error. Resumable via append-only JSONL checkpoints.
 *
 *   IN=<list.csv> OUT_DIR=<dir> node scripts/verify-millionverifier-bounceban.js [--concurrency 4] [--dry-run]
 *
 * Keys: EMAIL_VERIFY_ENV (path) or "$HOME/Silver GTM Systems/ENVs-Secrets/email-verification.env"
 *   with MILLIONVERIFIER_KEY=... and BOUNCEBAN_KEY=... ; or the two env vars directly. Never committed.
 * CSV needs an exact `Email` column; every other column passes through.
 * Outputs: <stem>_sendable.csv, <stem>_risky.csv, <stem>_dropped.csv, <stem>_full.csv, mv.jsonl, bounceban.jsonl.
 * --dry-run classifies from the checkpoints only (no API calls); rows without a checkpoint are left `unverified`.
 *
 * Verified 2026-09-12: MV `GET api.millionverifier.com/api/v3/?api=KEY&email=&timeout=20` → {result: ok|catch_all|
 * unknown|disposable|invalid|error, role, free, credits}. BounceBan `GET api.bounceban.com/v1/verify/single?email=`
 * with header `Authorization: KEY` is SYNCHRONOUS → {result: deliverable|undeliverable|risky|unknown, is_accept_all,
 * is_role, credits_consumed, credits_remaining, status:"success"}.
 */
const fs = require('fs'), path = require('path');
const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');
const IN = process.env.IN, OUT_DIR = process.env.OUT_DIR || 'verify';
const CONC = parseInt(arg('concurrency', '4'), 10);
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
async function mvVerify(email) { const d = await getJSON(`https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(MV_KEY)}&email=${encodeURIComponent(email)}&timeout=20`); d.email = d.email || email; d.checked_at = new Date().toISOString(); return d; }
async function bbVerify(email) { const d = await getJSON(`https://api.bounceban.com/v1/verify/single?email=${encodeURIComponent(email)}`, { Authorization: BB_KEY }); d.email = d.email || email; d.checked_at = new Date().toISOString(); return d; }

const NEEDS_BB = new Set(['catch_all', 'unknown', 'error', '']);
function classify(m, b) {
  if (!m) return ['unverified', 'no stage-1 result'];
  const r = String(m.result || '').toLowerCase();
  if (r === 'ok') return ['sendable', `mv:ok${m.role ? ' role' : ''}${m.free ? ' free' : ''}`];
  if (r === 'invalid' || r === 'disposable') return ['dropped', `mv:${r}${m.subresult ? '/' + m.subresult : ''}`];
  if (!b) return ['unverified', `mv:${r || 'none'} awaiting bounceban`];
  const br = String(b.result || '').toLowerCase();
  if (br === 'deliverable') return ['sendable', `mv:${r} bb:deliverable(recovered)${b.is_role ? ' role' : ''}`];
  return ['risky', `mv:${r} bb:${br || b.error || 'none'}`];
}

async function pool(items, fn, n) { let i = 0; const w = Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }); await Promise.all(w); }
(async () => {
  const emails = [...new Set(rows.map(r => r.Email.trim().toLowerCase()).filter(Boolean))];
  let spentMV = 0, spentBB = 0;
  if (!DRY) {
    await pool(emails.filter(e => !mv.has(e)), async e => { try { const d = await mvVerify(e); mv.set(e, d); append(MVF, d); spentMV++; } catch (err) { console.error('MV fail', e, err.message); } }, CONC);
    const toBB = emails.filter(e => { const m = mv.get(e); return m && NEEDS_BB.has(String(m.result || '').toLowerCase()) && !bb.has(e); });
    await pool(toBB, async e => { try { const d = await bbVerify(e); bb.set(e, d); append(BBF, d); spentBB++; } catch (err) { console.error('BB fail', e, err.message); } }, Math.min(CONC, 4));
  }
  const out = { sendable: [], risky: [], dropped: [], unverified: [] };
  const full = rows.map(r => { const e = r.Email.trim().toLowerCase(); const [v, detail] = classify(mv.get(e), bb.get(e)); const o = { ...r, verify_verdict: v, verify_detail: detail }; out[v].push(o); return o; });
  const stem = path.basename(IN).replace(/\.csv$/i, '');
  const HH = [...H, 'verify_verdict', 'verify_detail'];
  const write = (name, arr) => fs.writeFileSync(path.join(OUT_DIR, `${stem}_${name}.csv`), [HH.join(',')].concat(arr.map(o => HH.map(h => esc(o[h])).join(','))).join('\n') + '\n');
  write('sendable', out.sendable); write('risky', out.risky); write('dropped', out.dropped); write('full', full);
  if (out.unverified.length) write('unverified', out.unverified);
  const rep = { rows: rows.length, unique_emails: emails.length, sendable: out.sendable.length, risky: out.risky.length, dropped: out.dropped.length, unverified: out.unverified.length, mv_calls_this_run: spentMV, bb_calls_this_run: spentBB, dry_run: DRY };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep));
})();
