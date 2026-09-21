#!/usr/bin/env node
/* store.js / store-sync.js against a fake PostgREST server. No network, no keys leave the test.
 * Checks: (a) absent keys -> open() null and store-sync exits 0 without a request; (b) upsert chunks at 500 with
 * merge-duplicates + on_conflict; (c) places mapping (types split on '|', blank review -> null, region token) and
 * first_seen_run preserved for rows the store already holds; (d) a 5xx returns null with ONE warning, never throws;
 * (e) pullSiteText / pullVerdicts send the max-age filter and the domain/email list; (f) site_text dedupes by
 * root_domain preferring ok; (g) verdicts skip 'unverified'; (h) store-sync places end-to-end through the CLI. */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync, execFile } = require('child_process');
// The CLI checks must NOT use spawnSync: the fake PostgREST server lives in THIS process, and a synchronous spawn blocks the event loop the server needs to answer the child (deadlock).
const runCli = (args, env) => new Promise(res => execFile('node', [path.join(__dirname, '..', 'store-sync.js'), ...args], { encoding: 'utf8', env: env || process.env, timeout: 20000 }, (err, stdout, stderr) => res({ status: err ? (err.code ?? 1) : 0, stdout, stderr })));
const { open, Store, rootDomain } = require('../store.js');
let fails = 0; const check = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const reqs = []; let mode = 'ok'; const known = new Set(['ChIJ_known']);
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    reqs.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    if (mode === '500') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end('{"message":"boom"}'); }
    if (mode === '404') { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"code":"PGRST205","message":"Could not find the table"}'); }
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/places?select=place_id')) {
      const m = decodeURIComponent(req.url).match(/place_id=in\.\((.*)\)/); const ids = m ? m[1].split(',').map(s => s.replace(/"/g, '')) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(ids.filter(i => known.has(i)).map(i => ({ place_id: i }))));
    }
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/site_text')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([{ root_domain: 'a.com.au', status: 'ok', text: 'cached' }])); }
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/email_verdicts')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([{ email: 'x@a.com.au', verdict: 'sendable' }])); }
    res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('');
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));

  // (a) absent keys
  const emptyEnv = path.join(tmp, 'empty.env'); fs.writeFileSync(emptyEnv, 'OTHER=1\n');
  const savedUrl = process.env.SUPABASE_URL, savedKey = process.env.SUPABASE_SERVICE_KEY; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  check('(a) open() is null without keys', open({ envPath: emptyEnv }) === null);
  const r0 = spawnSync('node', [path.join(__dirname, '..', 'store-sync.js'), 'places', '--in', emptyEnv, '--run-id', 'r', '--country', 'au', '--env', emptyEnv], { encoding: 'utf8', env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' } });
  check('(a) store-sync exits 0 and skips without keys', r0.status === 0 && /skipped/.test(r0.stderr) && reqs.length === 0);

  const envFile = path.join(tmp, 'store.env'); fs.writeFileSync(envFile, `SUPABASE_URL=${url}\nSUPABASE_SERVICE_KEY=test-key\n`);
  const store = open({ envPath: envFile, quiet: true });
  check('open() returns a Store with keys', store instanceof Store);

  // (b) chunking + headers
  reqs.length = 0;
  const many = Array.from({ length: 1201 }, (_, i) => ({ email: `e${i}@x.com`, verdict: 'sendable' }));
  const sent = await store.upsert('email_verdicts', many, 'email');
  check('(b) 1201 rows -> 3 chunks (500/500/201)', sent === 1201 && reqs.length === 3 && reqs[0].body.length === 500 && reqs[2].body.length === 201);
  check('(b) merge-duplicates + on_conflict + service key headers', /resolution=merge-duplicates/.test(reqs[0].headers.prefer) && /on_conflict=email/.test(reqs[0].url) && reqs[0].headers.apikey === 'test-key' && reqs[0].headers.authorization === 'Bearer test-key');

  // (c) places mapping + first_seen_run preservation
  reqs.length = 0;
  const leads = [
    { place_id: 'ChIJ_new', name: 'Eastern Restumping', google_types: 'Building restoration service|Service establishment', city: 'Ringwood VIC', latitude: '-37.81', longitude: '145.22', website: 'https://www.eastern-restumping.com.au/about', review_count: '', rating: '4.9', is_claimed: 'true', phone_number: '03 9000' },
    { place_id: 'ChIJ_known', name: 'Mainmark Sydney', google_types: 'Civil engineering company', city: 'North Sydney NSW', latitude: '-33.84', longitude: '151.21', website: 'https://mainmark.com/au/sydney', review_count: '214', rating: '4.7' },
  ];
  const res = await store.upsertPlaces(leads, 'run-A', 'AU');
  const posts = reqs.filter(r => r.method === 'POST');
  const fresh = posts.find(p => p.body.some(b => b.place_id === 'ChIJ_new')), seen = posts.find(p => p.body.some(b => b.place_id === 'ChIJ_known'));
  check('(c) result counts inserted 1 / updated 1', res && res.inserted === 1 && res.updated === 1);
  check('(c) new row carries first_seen_run; known row does not', fresh.body[0].first_seen_run === 'run-A' && !('first_seen_run' in seen.body[0]) && seen.body[0].last_seen_run === 'run-A');
  const nr = fresh.body[0];
  check('(c) google_types split on |, blank review -> null, region parsed, root_domain, country lowercased', Array.isArray(nr.google_types) && nr.google_types.length === 2 && nr.review_count === null && nr.region === 'VIC' && nr.root_domain === 'eastern-restumping.com.au' && nr.country === 'au' && nr.rating === 4.9 && nr.raw.is_claimed === true);
  check('(c) rootDomain keeps com.au second-level', rootDomain('https://www.foo.com.au/x') === 'foo.com.au' && rootDomain('mainmark.com/au') === 'mainmark.com');

  // (d) 5xx and 404 degrade, never throw
  mode = '500'; let threw = false; let out;
  try { out = await store.upsert('places', [{ place_id: 'x', name: 'y' }], 'place_id'); } catch { threw = true; }
  check('(d) 5xx -> null, no throw, one warning', !threw && out === null && store.warned === 1);
  mode = '404'; out = await store.ledger('run-A', 'scraper_tech_maps', 12, 'probe');
  check('(d) schema-not-applied 404 -> null with a second warning', out === null && store.warned === 2);
  mode = 'ok';

  // (e) pulls send the age filter and the list
  reqs.length = 0;
  const st = await store.pullSiteText(['A.com.au', 'b.com.au', 'a.com.au'], 30);
  check('(e) pullSiteText: one request, deduped lowercase domains, fetched_at=gte filter', st.length === 1 && reqs.length === 1 && /fetched_at=gte\./.test(reqs[0].url) && /root_domain=in\.%28%22a\.com\.au%22%2C%22b\.com\.au%22%29|root_domain=in\.\("a\.com\.au","b\.com\.au"\)/.test(decodeURIComponent(reqs[0].url).replace(/%28|%29|%22|%2C/g, m => ({ '%28': '(', '%29': ')', '%22': '"', '%2C': ',' }[m]))));
  reqs.length = 0;
  const vd = await store.pullVerdicts(['X@a.com.au'], 90);
  check('(e) pullVerdicts: verified_at=gte filter + lowercased email', vd.length === 1 && /verified_at=gte\./.test(reqs[0].url) && /x%40a\.com\.au|x@a\.com\.au/.test(reqs[0].url));

  // (f) site_text dedupe prefers ok
  reqs.length = 0;
  await store.upsertSiteText([{ website: 'https://dup.com.au', status: '403', text: '' }, { website: 'https://www.dup.com.au/contact', status: 'ok', text: 'hello', emails: ['info@dup.com.au'] }], 'plain');
  check('(f) two records for one root_domain -> one row, status ok kept', reqs[0].body.length === 1 && reqs[0].body[0].status === 'ok' && reqs[0].body[0].root_domain === 'dup.com.au' && reqs[0].body[0].source === 'plain');

  // (g) verdicts skip unverified
  reqs.length = 0;
  await store.upsertVerdicts([{ Email: 'A@b.com', verify_verdict: 'sendable', verify_detail: 'mv:ok' }, { Email: 'c@d.com', verify_verdict: 'unverified' }]);
  check('(g) unverified rows are not written; email lowercased', reqs[0].body.length === 1 && reqs[0].body[0].email === 'a@b.com' && reqs[0].body[0].verdict === 'sendable');

  // (g2) contacts: the per-lead shape (contacts[]) is flattened to one row per contact; the flat shape still works
  reqs.length = 0;
  await store.upsertContacts([
    { place_id: 'L1', primary_name: 'Ann Lee', confidence: 'high', contacts: [{ name: 'Ann Lee', role_bucket: 'owner_or_partner', source: 'registry', evidence: 'Ann Lee — Director' }, { name: 'Bob Roy', role_bucket: 'gm', source: 'website', evidence: 'Bob Roy, manager' }] },
    { place_id: 'L2', name: 'Cy Day', role_bucket: 'owner_or_partner', source: 'web_search', evidence: 'Cy Day owner' },
    { place_id: 'L3', contacts: [] },
    { place_id: 'L1', contacts: [{ name: 'ann lee', role_bucket: 'owner_or_partner' }] },
  ], 'run-A');
  const cb = reqs[0] && reqs[0].body;
  check('(g2) per-lead contacts[] rows flatten to one row per contact (2 + 1), empty and duplicate-name rows skipped', !!cb && cb.length === 3 && cb.filter(r => r.place_id === 'L1').length === 2 && cb.some(r => r.place_id === 'L2' && r.name === 'Cy Day'));
  check('(g2) flattened rows inherit the lead confidence and carry run_id', cb.find(r => r.name === 'Ann Lee').confidence === 'high' && cb.every(r => r.run_id === 'run-A') && /on_conflict=place_id%2Cname%2Crun_id|on_conflict=place_id,name,run_id/.test(reqs[0].url));

  // (h) CLI end to end
  reqs.length = 0;
  const csv = path.join(tmp, 'leads.csv');
  fs.writeFileSync(csv, 'place_id,business_id,name,icp_type,google_types,full_address,city,zip,neighborhood,latitude,longitude,website,phone_number,rating,review_count,is_claimed,verified,hours,place_link\n' +
    'ChIJ_cli,0x1:0x2,"Restumping, Underpinning & Co",foundation,Construction company|Foundation,"1 Smith St, Sunbury VIC 3429",Sunbury VIC,,, -37.58,144.73,https://rc.com.au,03 1,4.8,12,true,false,,\n' +
    'ChIJ_cli,0x1:0x2,"Restumping, Underpinning & Co",foundation,Construction company,,Sunbury VIC,,,-37.58,144.73,https://rc.com.au,,4.8,12,,,,\n');
  const r1 = await runCli(['places', '--in', csv, '--run-id', 'run-B', '--country', 'au', '--env', envFile]);
  check('(h) store-sync places: exit 0, dedupes the duplicate place_id, reports counts', r1.status === 0 && /1 unique of 2 rows/.test(r1.stdout) && /"inserted":1/.test(r1.stdout));
  const r2 = await runCli(['ledger', '--run-id', 'run-B', '--service', 'scraper_tech_maps', '--credits', '3', '--note', 'probe', '--env', envFile]);
  check('(h) store-sync ledger: exit 0', r2.status === 0 && /ledger: 1/.test(r2.stdout));
  mode = '404';
  const r3 = await runCli(['ledger', '--run-id', 'run-B', '--service', 's', '--credits', '1', '--env', envFile]);
  check('(h) store-sync exits 2 when the store refuses (schema missing)', r3.status === 2 && /refused/.test(r3.stderr));

  if (savedUrl) process.env.SUPABASE_URL = savedUrl; if (savedKey) process.env.SUPABASE_SERVICE_KEY = savedKey;
  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
