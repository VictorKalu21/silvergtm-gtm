// Two-stage email gate: MillionVerifier (Stage 1, 8 workers) -> BounceBan on catch_all/unknown (Stage 2, 4 workers). See processes/02.
//   IN=list.csv OUT_DIR=verify node verify-millionverifier-bounceban.mjs
// Keys: MILLIONVERIFIER_KEY / BOUNCEBAN_KEY env vars, or ENV_FILE=path to a KEY=value file (default ~/Silver GTM Systems/ENVs-Secrets/email-verification.env).
// Input needs an `Email` column (exact). Checkpoints mv.jsonl / bounceban.jsonl are append-only -> re-run to resume.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ENV_FILE = process.env.ENV_FILE || path.join(os.homedir(), 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env');
if (fs.existsSync(ENV_FILE)) for (const l of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const MV = process.env.MILLIONVERIFIER_KEY, BB = process.env.BOUNCEBAN_KEY, IN = process.env.IN, OUT_DIR = process.env.OUT_DIR || 'verify';
if (!MV || !BB || !IN) { console.error('need MILLIONVERIFIER_KEY, BOUNCEBAN_KEY and IN=list.csv'); process.exit(1); }
fs.mkdirSync(OUT_DIR, { recursive: true });
function parse(t) { const rows = []; let f = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; } else if (ch !== '\r') c += ch; } if (c.length || f.length) { f.push(c); rows.push(f); } return rows.filter((r) => r.some((x) => x !== '')); }
const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const rows = parse(fs.readFileSync(IN, 'utf8')); const head = rows.shift(); const ei = head.indexOf('Email'); if (ei < 0) { console.error('no `Email` column'); process.exit(1); }
const emails = [...new Set(rows.map((r) => (r[ei] || '').trim().toLowerCase()).filter(Boolean))];
const load = (f) => { const m = {}; if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) { try { const j = JSON.parse(l); m[j.email] = j; } catch {} } return m; };
const MVF = path.join(OUT_DIR, 'mv.jsonl'), BBF = path.join(OUT_DIR, 'bounceban.jsonl'); const mv = load(MVF), bb = load(BBF);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
// Stage 1
const todo1 = emails.filter((e) => !mv[e]); console.error(`Stage 1 MillionVerifier: ${emails.length} unique emails, ${todo1.length} to verify`);
await pool(todo1, 8, async (e) => { for (let a = 0; a < 3; a++) { try { const r = await fetch(`https://api.millionverifier.com/api/v3/?api=${MV}&email=${encodeURIComponent(e)}&timeout=20`, { signal: AbortSignal.timeout(40000) }); const j = await r.json(); if (j.error && /credit|api key/i.test(j.error)) { console.error('MillionVerifier:', j.error); process.exit(2); } mv[e] = { email: e, result: j.result, subresult: j.subresult, quality: j.quality, free: j.free, role: j.role, credits: j.credits }; fs.appendFileSync(MVF, JSON.stringify(mv[e]) + '\n'); return; } catch (err) { await sleep(2000 * (a + 1)); } } mv[e] = { email: e, result: 'unknown', error: 'request failed' }; fs.appendFileSync(MVF, JSON.stringify(mv[e]) + '\n'); });
const c1 = {}; for (const e of emails) c1[mv[e]?.result || 'unknown'] = (c1[mv[e]?.result || 'unknown'] || 0) + 1; console.error('Stage 1 results:', JSON.stringify(c1));
// Stage 2
const todo2 = emails.filter((e) => ['catch_all', 'unknown', 'unverified'].includes(mv[e]?.result) && !bb[e]); console.error(`Stage 2 BounceBan: ${todo2.length} catch-all/unknown to probe`);
await pool(todo2, 4, async (e) => { for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://api.bounceban.com/v1/verify/single?email=${encodeURIComponent(e)}`, { headers: { Authorization: BB }, signal: AbortSignal.timeout(100000) }); const j = await r.json(); if (r.status === 401 || r.status === 402) { console.error('BounceBan:', r.status, JSON.stringify(j).slice(0, 200)); process.exit(3); } bb[e] = { email: e, result: j.result, score: j.score, is_accept_all: j.is_accept_all, is_role: j.is_role, is_free: j.is_free, credits_remaining: j.credits_remaining }; fs.appendFileSync(BBF, JSON.stringify(bb[e]) + '\n'); return; } catch (err) { await sleep(3000); } } bb[e] = { email: e, result: 'unknown', error: 'request failed' }; fs.appendFileSync(BBF, JSON.stringify(bb[e]) + '\n'); });
// Merge
const verdict = (e) => { const m = mv[e] || {}; if (m.result === 'ok') return ['sendable', `mv:${m.result}/${m.subresult || ''}`]; if (['invalid', 'disposable', 'spamtrap'].includes(m.result)) return ['dropped', `mv:${m.result}`]; const b = bb[e]; if (b?.result === 'deliverable') return ['sendable', `mv:${m.result} bb:deliverable score ${b.score}`]; return ['risky', `mv:${m.result} bb:${b?.result || 'n/a'}${b?.score != null ? ' score ' + b.score : ''}`]; };
const stem = path.basename(IN).replace(/\.csv$/i, ''); const buckets = { sendable: [], dropped: [], risky: [] }; const full = [];
for (const r of rows) { const e = (r[ei] || '').trim().toLowerCase(); const [v, d] = e ? verdict(e) : ['dropped', 'no email']; buckets[v].push(r.concat([v, d])); full.push(r.concat([v, d])); }
const H = head.concat(['verify_verdict', 'verify_detail']).map(esc).join(',');
for (const [k, list] of Object.entries(buckets)) fs.writeFileSync(path.join(OUT_DIR, `${stem}_${k}.csv`), [H, ...list.map((r) => r.map(esc).join(','))].join('\n'));
fs.writeFileSync(path.join(OUT_DIR, `${stem}_full.csv`), [H, ...full.map((r) => r.map(esc).join(','))].join('\n'));
const rec = todo2.length ? Object.keys(bb).filter((e) => emails.includes(e) && bb[e].result === 'deliverable').length : 0;
console.error(`===== VERIFY DONE ===== sendable ${buckets.sendable.length} | risky ${buckets.risky.length} | dropped ${buckets.dropped.length} | BounceBan recovered ${rec} of ${Object.keys(bb).filter((e) => emails.includes(e)).length} probed -> ${OUT_DIR}/${stem}_*.csv`);
