// Two-stage email deliverability gate: MillionVerifier all → BounceBan catch-alls/unknowns.
// Sendable = MV "ok" + BounceBan-recovered uncertain emails. Resumable.
//
// Env vars:
//   IN        - input CSV path (must have an "Email" column). Required.
//   OUT_DIR   - output directory (default: "verify" relative to CWD)
// Keys loaded from C:\Users\victo\Silver GTM Systems\ENVs-Secrets\email-verification.env
const fs = require('fs');
const path = require('path');
const https = require('https');

const ENVP = path.join(process.env.USERPROFILE || process.env.HOME, 'Silver GTM Systems', 'ENVs-Secrets', 'email-verification.env');
for (const l of fs.readFileSync(ENVP, 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const MVKEY = process.env.MILLIONVERIFIER_KEY, BKEY = process.env.BOUNCEBAN_KEY;
if (!MVKEY) { console.error('Missing MILLIONVERIFIER_KEY in email-verification.env'); process.exit(1); }
if (!BKEY) { console.error('Missing BOUNCEBAN_KEY in email-verification.env'); process.exit(1); }

const IN = process.env.IN; if (!IN) { console.error('Set IN=<path-to-csv>'); process.exit(1); }
const DIR = process.env.OUT_DIR || 'verify';
const STEM = path.basename(IN, path.extname(IN));
const MV = path.join(DIR, 'mv.jsonl');
const BB = path.join(DIR, 'bounceban.jsonl');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url, headers, timeout) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: headers || {}, timeout: timeout || 20000 }, (r) => {
      let b = ''; r.on('data', (d) => b += d);
      r.on('end', () => { if (r.statusCode === 429) return resolve({ _retry: true }); try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', function () { this.destroy(); resolve({ _retry: true }); });
  });
}

function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c === '\r') {} else cur += c; }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const csvEsc = (v) => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

async function millionverifier(email) {
  for (let i = 0; i < 4; i++) {
    const j = await getJson(`https://api.millionverifier.com/api/v3/?api=${MVKEY}&email=${encodeURIComponent(email)}`);
    if (j && j.result && !j._retry) return j;
    await sleep(500 * (i + 1));
  }
  return null;
}

async function bounceban(email) {
  for (let i = 0; i < 5; i++) {
    const j = await getJson('https://api.bounceban.com/v1/verify/single?email=' + encodeURIComponent(email), { Authorization: BKEY }, 90000);
    if (j && j.status === 'success' && !j._retry) return j;
    await sleep(2000 * (i + 1));
  }
  return null;
}

function classifyMV(result) {
  const r = (result || '').toLowerCase();
  if (r === 'ok') return 'good';
  if (r === 'catch_all' || r === 'unknown') return 'uncertain';
  return 'drop'; // invalid, disposable, spamtrap
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const rows = parseCsv(fs.readFileSync(IN, 'utf8')).filter((r) => r.length > 1);
  const H = rows.shift();
  const records = rows.map((r) => { const o = {}; H.forEach((h, i) => o[h] = r[i]); return o; });
  const emails = [...new Set(records.map((r) => (r.Email || '').trim().toLowerCase()).filter(Boolean))];

  // Stage 1: MillionVerifier
  let done = new Set();
  if (fs.existsSync(MV)) for (const l of fs.readFileSync(MV, 'utf8').split('\n').filter(Boolean)) { try { done.add(JSON.parse(l).email); } catch {} }
  let q1 = emails.filter((e) => !done.has(e));
  console.log(`[MillionVerifier] ${q1.length} to verify (of ${emails.length}; ${done.size} done)`);
  let n = 0;
  async function w1() {
    while (q1.length) {
      const email = q1.shift();
      const j = await millionverifier(email);
      const result = j ? j.result : 'error';
      const verdict = j ? classifyMV(result) : 'drop';
      fs.appendFileSync(MV, JSON.stringify({ email, result, verdict, resultcode: j ? j.resultcode : '', free: j ? j.free : '', role: j ? j.role : '' }) + '\n');
      if (++n % 50 === 0) console.log(`  ...${n}`);
      await sleep(30);
    }
  }
  await Promise.all(Array.from({ length: 8 }, w1));

  const mv = new Map();
  for (const l of fs.readFileSync(MV, 'utf8').split('\n').filter(Boolean)) { const o = JSON.parse(l); mv.set(o.email, o); }
  const uncertain = emails.filter((e) => (mv.get(e) || {}).verdict === 'uncertain');

  // Stage 2: BounceBan uncertain
  let done2 = new Set();
  if (fs.existsSync(BB)) for (const l of fs.readFileSync(BB, 'utf8').split('\n').filter(Boolean)) { try { done2.add(JSON.parse(l).email); } catch {} }
  let q2 = uncertain.filter((e) => !done2.has(e));
  console.log(`[BounceBan] ${q2.length} uncertain to resolve (of ${uncertain.length}; ${done2.size} done)`);
  let m = 0, credits = '?';
  async function w2() {
    while (q2.length) {
      const email = q2.shift();
      const j = await bounceban(email);
      if (!j) fs.appendFileSync(BB, JSON.stringify({ email, result: 'error' }) + '\n');
      else { credits = j.credits_remaining; fs.appendFileSync(BB, JSON.stringify({ email, result: j.result, score: j.score, is_accept_all: j.is_accept_all, is_role: j.is_role }) + '\n'); }
      if (++m % 25 === 0) console.log(`  ...${m} (credits ~${credits})`);
      await sleep(50);
    }
  }
  await Promise.all(Array.from({ length: 4 }, w2));

  const bb = new Map();
  for (const l of fs.readFileSync(BB, 'utf8').split('\n').filter(Boolean)) { const o = JSON.parse(l); bb.set(o.email, o); }

  function finalVerdict(email) {
    const d = mv.get(email); if (!d) return { verdict: 'dropped', detail: 'no-mv-result' };
    if (d.verdict === 'good') return { verdict: 'sendable', detail: 'mv:ok' };
    if (d.verdict === 'drop') return { verdict: 'dropped', detail: 'mv:' + d.result };
    const b = bb.get(email);
    if (b && b.result === 'deliverable') return { verdict: 'sendable', detail: 'bounceban:deliverable(recovered)' };
    return { verdict: 'risky', detail: 'mv:' + d.result + (b ? '|bounceban:' + b.result : '') };
  }

  const outCols = H.concat(['verify_verdict', 'verify_detail']);
  const sendable = [], dropped = [], risky = [], full = [];
  for (const rec of records) {
    const e = (rec.Email || '').trim().toLowerCase();
    const fv = e ? finalVerdict(e) : { verdict: 'dropped', detail: 'no-email' };
    const line = outCols.map((c) => c === 'verify_verdict' ? fv.verdict : c === 'verify_detail' ? fv.detail : csvEsc(rec[c])).join(',');
    full.push(line); if (fv.verdict === 'sendable') sendable.push(line); else if (fv.verdict === 'risky') risky.push(line); else dropped.push(line);
  }
  const hdr = outCols.join(',');
  fs.writeFileSync(path.join(DIR, STEM + '_sendable.csv'), [hdr, ...sendable].join('\n'));
  fs.writeFileSync(path.join(DIR, STEM + '_dropped.csv'), [hdr, ...dropped].join('\n'));
  fs.writeFileSync(path.join(DIR, STEM + '_risky.csv'), [hdr, ...risky].join('\n'));
  fs.writeFileSync(path.join(DIR, STEM + '_full.csv'), [hdr, ...full].join('\n'));

  console.log('\n=== DONE ===');
  console.log(`total ${records.length} | unique emails ${emails.length}`);
  console.log(`SENDABLE ${sendable.length}  (mv-ok + bounceban-recovered)`);
  console.log(`risky    ${risky.length}`);
  console.log(`dropped  ${dropped.length}`);
  console.log(`bounceban credits left ~${credits}`);
  console.log(`-> ${DIR}/${STEM}_sendable.csv`);
})();
