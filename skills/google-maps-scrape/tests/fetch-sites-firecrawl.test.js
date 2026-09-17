#!/usr/bin/env node
/* fetch-sites.js --firecrawl-residue / plan-aware PASS 3 (IMPROVEMENTS.md MEDIUM, 2026-09-17).
 * A local HTTP server plays Firecrawl (no network, no key, no credits):
 *   GET  /v1/team/queue-status -> {"maxConcurrency": N}   (the real body, probe 2026-09-17)
 *   POST /v1/scrape            -> 429 once (Retry-After: 1), then 200 per-URL fixtures
 * Asserts: the 429 row is slept-on and re-queued (not burned); workers never exceed the plan's
 * maxConcurrency (2, and 1 on the second run); only `status != ok` rows are attempted, with
 * 404/400/402/307 skipped and the 403 class attempted last; a challenge page or a <200-char page
 * is NOT ok; a recovery is written back in place with source:'firecrawl' and gets the RAW-HTML
 * email rungs (mailto/cfemail), not just the markdown text rung; and a second run is a no-op.
 */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');   // async: a *Sync child would block this process's own server
const SCRIPT = path.join(__dirname, '..', 'fetch-sites.js');
let fails = 0;
const check = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// --- fixtures ------------------------------------------------------------------------------------
const cfEncode = (addr, key) => [key, ...[...addr].map(c => c.charCodeAt(0) ^ key)].map(b => b.toString(16).padStart(2, '0')).join('');
const CF_HEX = cfEncode('sales@piledsolutions.co.uk', 0x5b);
const GOOD_MD = 'KHB Piling — underpinning and piling contractors across the North West. '.repeat(6);
const GOOD_HTML = `<html><body><h1>KHB Piling</h1><p>${GOOD_MD}</p>
  <a href="mailto:info@khbpiling.co.uk">Email us</a>
  <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${CF_HEX}">[email&#160;protected]</a></body></html>`;
const CHALLENGE_MD = 'Just a moment...\nEnable JavaScript and cookies to continue. ' + 'x'.repeat(400);
const THIN_MD = 'Domain parked.';                       // under the 200-char floor
const FIXTURES = { '/good': GOOD_MD, '/403site': 'Recovered behind the WAF. ' + 'y'.repeat(400), '/challenge': CHALLENGE_MD, '/thin': THIN_MD };

// --- the fake Firecrawl --------------------------------------------------------------------------
let MAXCONC = 2;                 // what queue-status reports (changed between runs)
let inflight = 0, maxInflight = 0, queueStatusCalls = 0, first429Done = false;
let order = [];                  // every /v1/scrape url, in request order
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/team/queue-status')) {
    queueStatusCalls++;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ success: true, jobsInQueue: 0, maxConcurrency: MAXCONC }));
  }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const url = (JSON.parse(body || '{}').url) || '';
    const p = new URL(url).pathname;
    order.push(p);
    if (!first429Done) {                                  // the first call of the whole run is rate-limited
      first429Done = true;
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      return res.end(JSON.stringify({ success: false, error: 'Rate limit exceeded. Consumed (req/min): 11' }));
    }
    inflight++; maxInflight = Math.max(maxInflight, inflight);
    setTimeout(() => {                                    // a slow enough call that overlap is observable
      inflight--;
      const md = FIXTURES[p];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { markdown: md, html: p === '/good' ? GOOD_HTML : `<html><body>${md}</body></html>`, metadata: { statusCode: 200 } } }));
    }, 180);
  });
});

const run = (args) => new Promise(resolve => {
  const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  child.on('close', code => resolve({ code, out, err }));
});
const readJsonl = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsfire-'));
  const owner = path.join(tmp, 'owner'); fs.mkdirSync(owner);
  fs.writeFileSync(path.join(tmp, 'owner-prompt.md'), '# prompt\n');          // gate: anchored on the residue file's folder
  const envFile = path.join(tmp, 'fake.env'); fs.writeFileSync(envFile, 'FIRECRAWL_KEY=fake-local-test-value\n');
  const site = path.join(owner, 'site_text.jsonl');
  const ROWS = [
    { place_id: 'P0', name: 'Already Read', website: base + '/alive', status: 'ok', pages: [{ url: base + '/alive', label: 'home', text: 'read already' }], emails: ['x@alive.co.uk'], emails_by_source: { 'x@alive.co.uk': 'text' }, text: 'read already', pages_fetched: 1 },
    { place_id: 'P1', name: 'Gone', website: base + '/gone404', status: 'home_failed:404', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P2', name: 'Bad Request', website: base + '/bad400', status: 'home_failed:400', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P3', name: 'Payment', website: base + '/pay402', status: 'home_failed:402', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P4', name: 'Redirect', website: base + '/redir307', status: 'home_failed:307', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P5', name: 'KHB Piling', website: base + '/good', status: 'home_failed:503', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P6', name: 'Cloudflared', website: base + '/challenge', status: 'home_failed:AbortError', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P7', name: 'Parked', website: base + '/thin', status: 'home_failed:ECONNRESET', pages: [], emails: [], emails_by_source: {}, text: '' },
    { place_id: 'P8', name: 'WAF Co', website: base + '/403site', status: 'home_failed:403', pages: [], emails: [], emails_by_source: {}, text: '' },
  ];
  fs.writeFileSync(site, ROWS.map(r => JSON.stringify(r)).join('\n') + '\n');

  const ARGS = ['--firecrawl-residue', site, '--firecrawl-base', base, '--env', envFile, '--firecrawl-rpm', '600'];
  const r1 = await run(ARGS);
  const rep = JSON.parse(r1.out.trim().split('\n').pop());
  const after = readJsonl(site);
  const byId = Object.fromEntries(after.map(r => [r.place_id, r]));

  // --- (a) worker cap from queue-status ---
  check('queue-status is read once at the start of the pass', queueStatusCalls === 1);
  check('workers never exceed the plan maxConcurrency (2)', maxInflight > 0 && maxInflight <= 2 && rep.workers === 2 && rep.plan_max_concurrency === 2);
  check('the worker/rpm line is reported', /2 worker\(s\) \(plan maxConcurrency 2\), 600 req\/min/.test(r1.err));

  // --- (b) 429 back-off + re-queue ---
  check('the 429 is counted separately from a failure', rep.rate_limited_429 === 1 && rep.calls === rep.attempted + 1);
  check('the rate-limited row is re-queued and retried, not burned', order.filter(p => p === '/good').length === 2);
  check('the 429 back-off is logged with the Retry-After seconds', /429 .*\/good — sleeping 1s, row re-queued \(try 1\)/.test(r1.err));
  check('the retried row still recovers', byId.P5.status === 'ok');

  // --- (c) residue-only selection ---
  check('only status != ok rows are attempted', !order.includes('/alive'));
  check('404/400/402/307 are skipped as dead', !order.some(p => /gone404|bad400|pay402|redir307/.test(p)) && /dead-code skipped 4/.test(r1.err));
  check('exactly the four live residue rows are attempted', rep.attempted === 4 && new Set(order).size === 4);
  check('the 403 class is attempted last', order.indexOf('/403site') === Math.max(...['/good', '/challenge', '/thin', '/403site'].map(p => order.indexOf(p))));
  check('an already-ok row is left byte-identical', JSON.stringify(byId.P0) === JSON.stringify(ROWS[0]));
  check('the file keeps every row, in place', after.length === ROWS.length && after.map(r => r.place_id).join() === ROWS.map(r => r.place_id).join());
  check('a dead row is untouched (no credit, no firecrawl stamp)', byId.P1.status === 'home_failed:404' && !byId.P1.firecrawl);

  // --- (c) a challenge page / a thin page is NOT a recovery ---
  check('a challenge page is not ok', byId.P6.status === 'home_failed:AbortError' && byId.P6.source !== 'firecrawl' && !!byId.P6.firecrawl);
  check('a page under 200 chars is not ok', byId.P7.status === 'home_failed:ECONNRESET' && byId.P7.source !== 'firecrawl');
  check('recovered/failed tally', rep.recovered === 2 && rep.failed === 2 && rep.with_email === 1);

  // --- (c)/(d) the recovered record ---
  check("recovered rows are written back with source:'firecrawl'", byId.P5.source === 'firecrawl' && byId.P8.source === 'firecrawl' && byId.P5.pages_fetched === 1 && /KHB Piling/.test(byId.P5.text));
  check('(d) the RAW html email rungs run on the recovered page',
    byId.P5.emails.includes('info@khbpiling.co.uk') && byId.P5.emails.includes('sales@piledsolutions.co.uk') &&
    byId.P5.emails_by_source['info@khbpiling.co.uk'] === 'mailto' && byId.P5.emails_by_source['sales@piledsolutions.co.uk'] === 'cfemail');

  // --- resumable: a second run attempts nothing ---
  order = []; queueStatusCalls = 0;
  const r2 = await run(ARGS);
  const rep2 = JSON.parse(r2.out.trim().split('\n').pop());
  check('a second run is a no-op (resumable, no double spend)', rep2.attempted === 0 && order.length === 0 && /attempting 0/.test(r2.err));
  check('--firecrawl-redo-failed re-attempts only the failed rows', await (async () => {
    const r3 = await run([...ARGS, '--firecrawl-redo-failed']);
    const rep3 = JSON.parse(r3.out.trim().split('\n').pop());
    return rep3.attempted === 2 && new Set(order).size === 2 && !order.includes('/good');
  })());

  // --- the cap follows the plan: a maxConcurrency of 1 means one worker ---
  MAXCONC = 1; maxInflight = 0; order = [];
  fs.writeFileSync(site, ROWS.map(r => JSON.stringify(r)).join('\n') + '\n');   // reset the residue
  const r4 = await run(ARGS);
  check('a plan maxConcurrency of 1 runs exactly one worker', maxInflight === 1 && /1 worker\(s\) \(plan maxConcurrency 1\)/.test(r4.err));

  // --- guards ---
  const r5 = await run(['--firecrawl-residue', site, '--firecrawl-base', base, '--env', path.join(tmp, 'nokey.env')]);
  check('no FIRECRAWL_KEY = refuse, spend nothing', r5.code === 1 && /needs FIRECRAWL_KEY/.test(r5.err));
  const r6 = await run(['--firecrawl-residue', path.join(owner, 'nope.jsonl'), '--env', envFile]);
  check('a missing residue file is refused', r6.code === 1 && /file not found/.test(r6.err));
  const r7 = await run([]);
  check('--in is still required without --firecrawl-residue', r7.code === 1 && /--in <csv> required/.test(r7.err));

  fs.rmSync(tmp, { recursive: true, force: true });
  server.close();
  process.exit(fails ? 1 : 0);
});
