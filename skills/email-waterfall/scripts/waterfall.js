#!/usr/bin/env node
/* waterfall.js — find an email per named contact, cheapest rung first, verify before moving on. See ../SKILL.md. */
const fs = require('fs'), path = require('path');
const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');
const IN = process.env.IN, OUT_DIR = process.env.OUT_DIR || 'waterfall';
const RUNGS = arg('rungs', 'quickenrich,aiark,trykitt').split(',').map(s => s.trim()).filter(Boolean);
const VERIFY = arg('verify', 'mv').split(',').map(s => s.trim());
const LIMIT = parseInt(arg('limit', '0'), 10), CONC = parseInt(arg('concurrency', '3'), 10);
if (!IN) { console.error('IN=<csv> required'); process.exit(1); }
function loadEnv(f) { const o = {}; if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const ENV = { ...loadEnv(process.env.EMAIL_VERIFY_ENV || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env')), ...process.env };
const K = { qe: ENV.QUICKENRICH_KEY, ark: ENV.AIARK_KEY, kitt: ENV.TRYKITT_KEY, mv: ENV.MILLIONVERIFIER_KEY, bb: ENV.BOUNCEBAN_KEY };

const strip = s => s.replace(/^﻿/, '');
function parse(l) { const c = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; }
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const L = strip(fs.readFileSync(IN, 'utf8')).split(/\r?\n/).filter(l => l.trim()); const H = parse(L.shift());
for (const need of ['full_name', 'root_domain']) if (!H.includes(need)) { console.error('CSV needs column ' + need); process.exit(1); }
let rows = L.map(l => { const c = parse(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ''])); });
if (LIMIT > 0) rows = rows.slice(0, LIMIT);
fs.mkdirSync(OUT_DIR, { recursive: true });
const ck = name => { const f = path.join(OUT_DIR, name + '.jsonl'); const m = new Map(); if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { const d = JSON.parse(l); if (d.key) m.set(d.key, d); } catch (e) { } } return { m, add(d) { m.set(d.key, d); fs.appendFileSync(f, JSON.stringify(d) + '\n'); } }; };
const CK = { quickenrich: ck('quickenrich'), aiark: ck('aiark'), trykitt: ck('trykitt'), mv: ck('mv'), bb: ck('bb') };
const keyOf = r => `${(r.place_id || '')}|${r.full_name.trim().toLowerCase()}|${r.root_domain.trim().toLowerCase()}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, opt = {}) { const r = await fetch(url, opt); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { _nonjson: t.slice(0, 300) }; } return { status: r.status, body: j }; }
const spend = { quickenrich: 0, aiark: 0, trykitt: 0, mv: 0, bb: 0 };
const names = r => { const first = r.first_name || r.full_name.split(/\s+/)[0]; const toks = r.full_name.replace(/\./g, '').split(/\s+/).filter(t => !/^(jr|sr|ii|iii)$/i.test(t)); const last = r.last_name || toks[toks.length - 1]; return { first, last }; };

// ---------- rungs: each returns {status:'found'|'miss'|'no_credits'|'error', emails:[...], phone, raw} ----------
async function rungQuickEnrich(r) {
  if (!K.qe) return { status: 'error', emails: [], raw: 'no key' };
  const { first, last } = names(r);
  const u = `https://app.quickenrich.io/api/employees/search?first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&company_url=${encodeURIComponent(r.root_domain)}`;
  const { status, body } = await http(u, { headers: { Authorization: 'Bearer ' + K.qe } });
  const data = Array.isArray(body.data) ? body.data : (body.data ? [body.data] : []);
  const used = Number(body.meta?.credits_used || 0); spend.quickenrich += used;
  if (status === 402 || /credit/i.test(String(body.message || '')) && !data.length && used === 0 && body.success === false) return { status: 'no_credits', emails: [], raw: body };
  // QuickEnrich returns a RECORD (and charges 1 credit) even when the email field is "N/A"; only keep real addresses.
  const isEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const emails = [...new Set(data.map(d => String(d.email || d.work_email || '').trim().toLowerCase()).filter(isEmail))];
  const phone = data.map(d => String(d.employee_phone || d.phone || '').trim()).find(v => v && !/^n\/?a$/i.test(v)) || '';
  const recordNoEmail = data.length && !emails.length;
  return { status: emails.length ? 'found' : (recordNoEmail ? 'record_no_email' : 'miss'), emails, phone, remaining: body.meta?.remaining_credits, raw: body };
}
// AI Ark allows 5 req/s and 300/min per key; a rate-limited reply is {message:"API rate limit exceeded"} with no content.
let arkLast = 0;
async function arkSearch(bodyObj) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = 400 - (Date.now() - arkLast); if (wait > 0) await sleep(wait); arkLast = Date.now();
    const r = await http('https://api.ai-ark.com/api/developer-portal/v1/people', { method: 'POST', headers: { 'X-TOKEN': K.ark, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) });
    const limited = r.status === 429 || /rate limit/i.test(String(r.body?.message || ''));
    if (!limited) return r;
    await sleep(15000 * (attempt + 1));
  }
  return { status: 429, body: { message: 'API rate limit exceeded (after retries)' } };
}
function arkPersonMatches(p, r) { const co = (p.company?.name || '') + ' ' + (p.company?.domain || '') + ' ' + JSON.stringify(p.position_groups || '').slice(0, 2000); const dom = r.root_domain.toLowerCase(); const biz = (r.business_name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 3 && !/^(foundation|repair|waterproofing|basement|systems|services|solutions|company|concrete|crawl|space)$/.test(t)); return co.toLowerCase().includes(dom) || biz.some(t => co.toLowerCase().includes(t)); }
async function rungAiArk(r) {
  if (!K.ark) return { status: 'error', emails: [], raw: 'no key' };
  const fullName = { any: { include: { mode: 'SMART', content: [r.full_name] } } };
  let s = await arkSearch({ contact: { fullName }, account: { domain: { any: { include: [r.root_domain] } } }, page: 0, size: 1 });
  let via = 'domain';
  if (s.status === 402 || s.status === 403) return { status: 'no_credits', emails: [], raw: s.body };
  if (s.status >= 400 || !Array.isArray(s.body.content)) return { status: 'error', emails: [], via, raw: { http: s.status, body: s.body } };
  let people = s.body.content || [];
  spend.aiark += 0.5 * people.length;
  if (!people.length && r.business_name) {
    s = await arkSearch({ contact: { fullName }, account: { name: { any: { include: [r.business_name] } } }, page: 0, size: 1 }); via = 'company_name';
    if (s.status >= 400 || !Array.isArray(s.body.content)) return { status: 'error', emails: [], via, raw: { http: s.status, body: s.body } };
    people = (s.body.content || []); spend.aiark += 0.5 * people.length;
    people = people.filter(p => arkPersonMatches(p, r));
  }
  if (!people.length) return { status: 'miss', emails: [], via, raw: { totalElements: s.body.totalElements } };
  const trackId = s.body.trackId;
  const sub = await http('https://api.ai-ark.com/api/developer-portal/v1/people/email-finder', { method: 'POST', headers: { 'X-TOKEN': K.ark, 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId }) });
  if (sub.status >= 400) return { status: 'error', emails: [], via, raw: sub.body };
  let res = null;
  for (let i = 0; i < 12; i++) { await sleep(10000); const q = await http(`https://api.ai-ark.com/api/developer-portal/v1/people/email-finder/${trackId}/inquiries?page=0&size=10`, { headers: { 'X-TOKEN': K.ark } }); res = q.body; const c = res.content || []; if (c.length && c.every(x => x.state === 'DONE')) break; }
  const outs = (res?.content || []).flatMap(x => x.output || []);
  const valid = outs.filter(o => o.found && /VALID/i.test(o.status || '')).map(o => ({ email: (o.address || '').toLowerCase(), domainType: o.domainType }));
  spend.aiark += valid.length;
  return { status: valid.length ? 'found' : 'miss', emails: [...new Set(valid.map(v => v.email))], via, person: people[0]?.profile?.full_name, linkedin: people[0]?.link?.linkedin, raw: { search: { totalElements: s.body.totalElements, trackId }, finder: res } };
}
async function rungTryKitt(r) {
  if (!K.kitt) return { status: 'error', emails: [], raw: 'no key' };
  // A zero balance does NOT block jobs: the free tier ("bot_type":"freemium") still runs them (verified 2026-09-12,
  // job 89252825 completed with credits 0). So no credit gate; the balance is recorded for the report.
  const c = await http('https://api.trykitt.ai/credit', { headers: { 'x-api-key': K.kitt } });
  // TryKitt insists on a callbackURL but the job is readable by polling GET /job?id= (verified 2026-09-12), so a
  // placeholder satisfies the parameter and no public webhook is needed.
  const j = await http('https://api.trykitt.ai/job/find_email', { method: 'POST', headers: { 'x-api-key': K.kitt, 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: r.full_name, domainOrWebsite: r.root_domain, companyName: r.business_name || undefined, fastMode: true, callbackURL: ENV.TRYKITT_CALLBACK_URL || 'https://example.com/trykitt-callback' }) });
  const id = j.body.job_id || j.body.id || j.body.jobId; if (!id) return { status: 'error', emails: [], raw: j.body };
  let job = null;
  for (let i = 0; i < 15; i++) { await sleep(8000); const g = (await http(`https://api.trykitt.ai/job?id=${encodeURIComponent(id)}`, { headers: { 'x-api-key': K.kitt } })).body; job = Array.isArray(g) ? g[0] : g; const st = String(job?.status || ''); if (st && !/pending|queued|running|processing/i.test(st)) break; }
  const em = String(job?.results?.email || '').toLowerCase();
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) ? em : '';
  spend.trykitt += email ? 1 : 0;
  return { status: email ? 'found' : (/pending|queued/i.test(String(job?.status || '')) ? 'error' : 'miss'), emails: email ? [email] : [], raw: { job_id: id, status: job?.status, outcome: job?.outcome, bot_type: job?.bot_type, credits_before: c.body.credits, results: job?.results } };
}
const RUNG = { quickenrich: rungQuickEnrich, aiark: rungAiArk, trykitt: rungTryKitt };

// ---------- verify ----------
async function mv(email) { const d = (await http(`https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(K.mv)}&email=${encodeURIComponent(email)}&timeout=20`)).body; spend.mv++; return d; }
async function bb(email) { let d = (await http(`https://api.bounceban.com/v1/verify/single?email=${encodeURIComponent(email)}`, { headers: { Authorization: K.bb } })).body; spend.bb++; for (let i = 0; i < 8 && d.status === 'verifying' && d.id; i++) { await sleep(8000); const s = (await http(`https://api.bounceban.com/v1/verify/single/status?id=${d.id}`, { headers: { Authorization: K.bb } })).body; if (s.result) { d = s; break; } } return d; }
async function verify(email) {
  let m = CK.mv.m.get(email); if (!m && !DRY) { m = { key: email, ...(await mv(email)) }; CK.mv.add(m); }
  if (!m) return { verdict: 'unverified', detail: 'no mv' };
  const r = String(m.result || '').toLowerCase();
  if (r === 'ok') return { verdict: 'sendable', detail: `mv:ok${m.role ? ' role' : ''}${m.free ? ' free' : ''}` };
  if (r === 'invalid' || r === 'disposable') return { verdict: 'invalid', detail: `mv:${r}` };
  if (VERIFY.includes('bb') && K.bb) { let b = CK.bb.m.get(email); if (!b && !DRY) { b = { key: email, ...(await bb(email)) }; CK.bb.add(b); } if (b) return String(b.result).toLowerCase() === 'deliverable' ? { verdict: 'sendable', detail: `mv:${r} bb:deliverable` } : { verdict: 'risky', detail: `mv:${r} bb:${b.result || 'none'}` }; }
  return { verdict: 'risky', detail: `mv:${r}` };
}

// ---------- cascade ----------
async function cascade(r) {
  const key = keyOf(r); const trail = []; let best = null, risky = null, phone = '';
  for (const name of RUNGS) {
    let res = CK[name].m.get(key);
    if (res && res.status === 'error') res = null;   // errors are retried on rerun; misses are final
    if (!res) { if (DRY) { trail.push(`${name}:not_run`); continue; } try { res = { key, ...(await RUNG[name](r)), at: new Date().toISOString() }; } catch (e) { res = { key, status: 'error', emails: [], raw: String(e.message) }; } CK[name].add(res); }
    if (res.phone && !phone) phone = res.phone;
    if (res.status !== 'found') { trail.push(`${name}:${res.status}`); continue; }
    let stop = false;
    for (const email of (res.emails || []).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e)))) {
      const v = await verify(email); trail.push(`${name}:${email}:${v.verdict}`);
      if (v.verdict === 'sendable') { best = { email, rung: name, detail: v.detail }; stop = true; break; }
      if (v.verdict === 'risky' && !risky) { risky = { email, rung: name, detail: v.detail }; stop = true; }
      if (v.verdict === 'unverified') { risky = risky || { email, rung: name, detail: v.detail }; stop = true; }
    }
    if (stop) break;
  }
  const out = best || risky;
  return { ...r, wf_email: out?.email || '', wf_rung: out?.rung || '', wf_verdict: best ? 'sendable' : risky ? risky.detail.startsWith('mv:') && !/unverified/.test(risky.detail) ? 'risky' : 'unverified' : 'none', wf_detail: out?.detail || '', wf_phone: phone, wf_trail: trail.join(' > ') };
}
async function pool(items, fn, n) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
(async () => {
  let arkBefore = null; if (!DRY && RUNGS.includes('aiark') && K.ark) { try { arkBefore = (await http('https://api.ai-ark.com/api/developer-portal/v1/payments/credits', { headers: { 'X-TOKEN': K.ark } })).body.total; } catch (e) { } }
  const results = await pool(rows, cascade, CONC);
  const HH = [...H, 'wf_email', 'wf_rung', 'wf_verdict', 'wf_detail', 'wf_phone', 'wf_trail'];
  const stem = path.basename(IN).replace(/\.csv$/i, '');
  fs.writeFileSync(path.join(OUT_DIR, `${stem}_waterfall.csv`), [HH.join(',')].concat(results.map(o => HH.map(h => esc(o[h])).join(','))).join('\n') + '\n');
  const rep = { contacts: results.length, dry_run: DRY, verify: VERIFY, sendable: results.filter(x => x.wf_verdict === 'sendable').length, risky: results.filter(x => x.wf_verdict === 'risky').length, none: results.filter(x => x.wf_verdict === 'none').length, unverified: results.filter(x => x.wf_verdict === 'unverified').length, rungs: {}, credits_spent_this_run: spend };
  for (const name of RUNGS) { const at = results.filter(x => x.wf_trail.includes(name + ':')); const found = at.filter(x => new RegExp(name + ':[^:>]+@').test(x.wf_trail)); const won = results.filter(x => x.wf_rung === name && x.wf_verdict === 'sendable'); const nc = at.filter(x => x.wf_trail.includes(name + ':no_credits')); rep.rungs[name] = { attempted: at.length, found: found.length, sendable: won.length, no_credits: nc.length, credits: spend[name], cost_per_sendable: won.length ? +(spend[name] / won.length).toFixed(2) : null }; }
  if (arkBefore !== null) { try { const after = (await http('https://api.ai-ark.com/api/developer-portal/v1/payments/credits', { headers: { 'X-TOKEN': K.ark } })).body.total; rep.aiark_credits = { before: arkBefore, after }; } catch (e) { } }
  const qeLast = [...CK.quickenrich.m.values()].map(v => v.remaining).filter(v => v !== undefined).pop(); if (qeLast !== undefined) rep.quickenrich_remaining = qeLast;
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(rep, null, 2)); console.log(JSON.stringify(rep));
})();
