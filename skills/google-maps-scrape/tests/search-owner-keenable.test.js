#!/usr/bin/env node
/* search-owner.js Keenable backend: response normalisation, keyed vs keyless endpoint + headers, --max-calls
 * (required, stops with exit 3, resumable), 429 back-off + retry, credits/error accounting. Local fake server only;
 * no live calls. */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), { spawn } = require('child_process');
const SO = path.join(__dirname, '..', 'search-owner.js');
const { parseKeenable } = require(SO);
let fails = 0; const check = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };

const p = parseKeenable({ query: 'q', results: [{ title: 'Acme - About', url: 'https://acme.com/about', snippet: 'Founded by Jane Doe, owner' }], usage: { sku: 'search.pro', amount: 1, credits: 1 } });
check('normalises snippet->description, credits from usage', p.status === 'ok' && p.results[0].description === 'Founded by Jane Doe, owner' && p.results[0].url === 'https://acme.com/about' && p.credits === 1);
check('keyless response (no usage) -> 0 credits', parseKeenable({ results: [] }).credits === 0 && parseKeenable({ results: [] }).status === 'ok');
check('garbage -> parse_error', parseKeenable(null).status === 'parse_error' && parseKeenable({ x: 1 }).status === 'parse_error');

const seen = []; let n429 = 0;
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const body = JSON.parse(b || '{}'); seen.push({ path: req.url, key: req.headers['x-api-key'] || '', title: req.headers['x-keenable-title'] || '', max: body.max_results, q: body.query });
    if (/RATELIMIT/.test(body.query) && n429++ < 1) { res.writeHead(429, { 'Retry-After': '0' }); return res.end('{}'); }
    const keyed = req.url === '/v1/search';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ query: body.query, results: [{ title: 'Jane Doe - Owner', url: 'https://x.com/' + encodeURIComponent(body.query.slice(0, 10)), snippet: 'Jane Doe owner' }], ...(keyed ? { usage: { sku: 'search.pro', amount: 1, credits: 1 } } : {}) }));
  });
});
const run = (args, env) => new Promise(res => { const c = spawn(process.execPath, [SO, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => e += d); c.on('close', code => res({ code, o, e })); });

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'so-keen-'));
  const leads = path.join(tmp, 'leads.csv');
  fs.writeFileSync(leads, 'place_id,name,city,neighborhood,full_address,zip,phone_number,website,icp_type\nP1,Acme Concrete,"Tampa, FL",,,33602,,https://acme.com/,c\nP2,Beta RATELIMIT Concrete,"Austin, TX",,,78701,,https://beta.com/,c\nP3,Gamma Concrete,"Mesa, AZ",,,85201,,,c\n');
  const cfg = path.join(tmp, 'cfg.json');
  fs.writeFileSync(cfg, JSON.stringify({ geo: { country: 'us', region_from_city: ',\\s*([A-Z]{2})\\b', region_default: 'US' }, owner_query: { serp_backend: 'keenable', bias_terms: ['owner'], use_linkedin: false } }));
  const noenv = path.join(tmp, 'none.env'), keyenv = path.join(tmp, 'key.env'); fs.writeFileSync(keyenv, 'KEENABLE_API_KEY=test-key-123\n');
  const E = { KEENABLE_BASE_URL: base, KEENABLE_API_KEY: '' };

  let r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o0'), '--env', noenv], E);
  check('keenable refuses to run without --max-calls', r.code === 1 && /max-calls/.test(r.e));
  r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o0'), '--env', noenv, '--max-calls', '10', '--mode', 'standard'], E);
  check('keenable is live-only', r.code === 1 && /live-only/.test(r.e));

  // keyless
  seen.length = 0; n429 = 0;
  r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o1'), '--env', noenv, '--max-calls', '50', '--concurrency', '9'], E);
  const out1 = fs.readFileSync(path.join(tmp, 'o1', 'serp_text.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const c1 = JSON.parse(fs.readFileSync(path.join(tmp, 'o1', 'serp_cost.json'), 'utf8'));
  check('keyless: public endpoint, generic title header, no key header', seen.length > 0 && seen.every(s => s.path === '/v1/search/public' && s.title === 'Research Agent' && s.key === '') && c1.endpoint === 'public');
  check('keyless: 3 records, backend tagged, text carries the snippet', r.code === 0 && out1.length === 3 && out1.every(x => x.backend === 'keenable') && /Jane Doe/.test(out1[0].biased_text));
  check('429 was retried and counted', c1.errors_by_http['429'] === 1 && out1.find(x => x.place_id === 'P2').status === 'ok');
  check('max_results = 10 sent', seen.every(s => s.max === 10));

  // keyed, from the .env file; credits summed
  seen.length = 0; n429 = 0;
  r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o2'), '--env', keyenv, '--max-calls', '50'], { KEENABLE_BASE_URL: base });
  const c2 = JSON.parse(fs.readFileSync(path.join(tmp, 'o2', 'serp_cost.json'), 'utf8'));
  check('keyed: /v1/search with X-API-Key, no title header', seen.every(s => s.path === '/v1/search' && s.key === 'test-key-123' && s.title === '') && c2.endpoint === 'keyed');
  check('keyed: credits = successful calls; key never written to output', c2.credits_used_this_run === c2.calls_this_run - 0 && !fs.readFileSync(path.join(tmp, 'o2', 'serp_text.jsonl'), 'utf8').includes('test-key-123') && !JSON.stringify(c2).includes('test-key-123'));

  // cap + resume (concurrency 1 keeps the stop exact)
  r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o3'), '--env', noenv, '--max-calls', '2', '--concurrency', '1'], E);
  const o3 = fs.readFileSync(path.join(tmp, 'o3', 'serp_text.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
  check('--max-calls stops early: exit 3, fewer than 3 leads, message names the cap', r.code === 3 && o3.length < 3 && /max-calls 2/.test(r.o));
  r = await run(['--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o3'), '--env', noenv, '--max-calls', '50', '--resume', '--concurrency', '1'], E);
  const o3b = fs.readFileSync(path.join(tmp, 'o3', 'serp_text.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
  check('--resume finishes the remaining leads', r.code === 0 && o3b.length === 3);

  server.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
});
