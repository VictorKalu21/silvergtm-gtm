#!/usr/bin/env node
// Job-side Firecrawl rung over this run's site-text residue (status != ok in owner/site_text.jsonl).
// Why job-side: the engine's --firecrawl pass (fetch-sites.js PASS 3) re-fetches the whole list and runs 4
// workers, but this Firecrawl plan allows maxConcurrency=2 (queue-status probe) — 4 workers produced 408
// "waiting for a concurrency slot" on the probe. Filed in IMPROVEMENTS.md. Resumable: skips hosts already in
// the output file. Output record shape = fetch-sites.js record (pages/emails/emails_by_source/text/source).
const fs = require('fs'), path = require('path');
const ENG = '/home/user/silvergtm-gtm/skills/google-maps-scrape';
const M = require(path.join(ENG, 'fetch-sites.js'));
const KEY = fs.readFileSync(path.join(ENG, '.env'), 'utf8').split('\n').find(l => l.startsWith('FIRECRAWL_KEY='))?.split('=')[1]?.trim();
if (!KEY) { console.error('no FIRECRAWL_KEY'); process.exit(1); }
const OUT = 'owner/site_text_firecrawl.jsonl', SKIP = /^home_failed:(404|400|402|307)$/;
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).website) : []);
const residue = fs.readFileSync('owner/site_text.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(r => r.status !== 'ok' && !SKIP.test(r.status) && !done.has(r.website))
  // 403 last: on the 6-site smoke test the 403 class was 1/5 alive (parked/WAF domains); DNS/TLS/5xx/timeout first
  .sort((a, b) => (a.status === 'home_failed:403') - (b.status === 'home_failed:403'));
const LIMIT = +(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 1e9);
const q = residue.slice(0, LIMIT); console.error(`residue ${residue.length}, this run ${q.length}, already done ${done.size}`);
const HOME_CAP = 6000, TOTAL_CAP = 18000; let n = 0, ok = 0, withEmail = 0; const t0 = Date.now();
async function scrape(url) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 120000);
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'html'], timeout: 90000, waitFor: 2000 }) });
    const d = await r.json(); return { http: r.status, ok: !!d.success, md: d.data?.markdown || '', html: d.data?.html || '', status: d.data?.metadata?.statusCode, err: d.error || '' };
  } catch (e) { return { http: 0, ok: false, md: '', html: '', err: String(e.message || e) }; } finally { clearTimeout(to); }
}
let nextStart = 0; const GAP = 6500;                 // 10 req/min plan limit (429 body: 'Consumed (req/min): 11'); 429 rows cost no credits but burn the queue
async function worker() {
  while (q.length) {
    const rec = q.shift();
    const wait = Math.max(0, nextStart - Date.now()); nextStart = Math.max(Date.now(), nextStart) + GAP; if (wait) await new Promise(r => setTimeout(r, wait));
    const r = await scrape(rec.website); n++;
    const out = { ...rec, source: 'firecrawl', firecrawl: { http: r.http, status: r.status, err: r.err.slice(0, 120) } };
    if (r.ok && r.md.trim().length > 200 && !/just a moment|enable javascript and cookies|attention required/i.test(r.md.slice(0, 600))) {
      const text = r.md.slice(0, TOTAL_CAP);
      const merged = M.mergeEmailSources([M.extractEmails(r.html, M.htmlToText(r.html)), M.emailsIn(text).map(e => ({ email: e, source: 'text' }))]);
      Object.assign(out, { status: 'ok', pages: [{ url: rec.website, label: 'home', text: text.slice(0, HOME_CAP) }], emails: merged.emails, emails_by_source: merged.by_source, text, pages_fetched: 1 });
      ok++; if (merged.emails.length) withEmail++;
    } else { out.status = 'firecrawl_failed:' + (r.status || r.http || 'err'); }
    fs.appendFileSync(OUT, JSON.stringify(out) + '\n');
    process.stderr.write(`${n}/${q.length + n} ${out.status} ${rec.website} emails=${(out.emails || []).length} ${((Date.now() - t0) / 1000 / n).toFixed(1)}s/site\n`);
  }
}
Promise.all([worker(), worker()]).then(() => console.log(JSON.stringify({ attempted: n, recovered: ok, with_email: withEmail, seconds: Math.round((Date.now() - t0) / 1000) })));
