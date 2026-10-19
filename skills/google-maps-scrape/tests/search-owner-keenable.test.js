#!/usr/bin/env node
/* search-owner.js keenable backend: response normalisation (snippet-first, 429, garbage), and an end-to-end
 * stubbed run (SEARCH_OWNER_STUB) proving the same serp_text.jsonl shape as the DataForSEO backend, no
 * --max-cost requirement, calls metered in serp_cost.json at $0, backend tag, and that --mode standard is
 * refused. Keyless path is the default when KEENABLE_KEY is absent (a NOTE on stderr). No network. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const SO = path.join(__dirname, '..', 'search-owner.js');
const { parseKeenable } = require(SO);
let fails = 0; const check = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };

// 1. normalisation — the real 2026-10-19 response shape: {query, mode, results:[{title,url,description,snippet,published_at}]}
const row = (t, u, d, sn) => ({ title: t, url: u, description: d, snippet: sn });
const resp = (results) => ({ query: 'q', mode: 'default', results });
const p = parseKeenable(resp([row('Logan & Mike Plumbing LLC | BBB', 'https://bbb.org/x', 'desc', 'Business Management: Mr. Mike Cail, Owner'), row('no url', '', 'd', 's')]));
check('ok -> rows with url only, snippet preferred over description', p.status === 'ok' && p.results.length === 1 && p.results[0].description === 'Business Management: Mr. Mike Cail, Owner' && p.cost === 0);
check('description used when snippet missing', parseKeenable(resp([{ title: 't', url: 'https://a', description: 'only desc' }])).results[0].description === 'only desc');
check('429 -> error:429 (retried by searchRetry)', parseKeenable({ error: 'rate limited' }, 429).status === 'error:429');
check('api error -> failed:', parseKeenable({ error: 'Missing app identifier' }, 400).status === 'failed:Missing app identifier');
check('garbage -> parse_error', parseKeenable(null).status === 'parse_error' && parseKeenable({}).status === 'failed:no_results_array');

// 2. end-to-end stubbed run
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'so-keen-'));
const leads = path.join(tmp, 'leads.csv');
fs.writeFileSync(leads, 'place_id,name,city,neighborhood,full_address,zip,phone_number,website,icp_type\nP1,Acme Pools,"Tampa, FL",,"1 Main St, Tampa, FL 33602",33602,(813) 555-0100,https://acmepools.com/,pools\nP2,Bay Pools,"Tampa, FL",,"2 Main St, Tampa, FL 33602",33602,,https://baypools.com/,pools\nP3,No Site Pools,"Tampa, FL",,"3 Main St, Tampa, FL 33602",33602,,,pools\n');
const cfg = path.join(tmp, 'cfg.json');
fs.writeFileSync(cfg, JSON.stringify({ geo: { country: 'us', region_from_city: ',\\s*([A-Z]{2})\\b', region_default: 'US' }, owner_query: { serp_backend: 'keenable', bias_terms: ['owner'], use_linkedin: true } }));
const stub = path.join(tmp, 'stub.json');
fs.writeFileSync(stub, JSON.stringify({
  'Acme Pools Tampa FL ("owner")': resp([row('Acme Pools | BBB', 'https://bbb.org/acme', 'd', 'Principal Contacts: Ms. Jane Doe, Owner')]),
  'site:linkedin.com Acme Pools Tampa FL': resp([row('Jane Doe - Owner - Acme Pools', 'https://linkedin.com/in/janedoe', 'Tampa, Florida', '')]),
  '*': resp([])
}));
const envBase = { ...process.env, SEARCH_OWNER_STUB: stub, KEENABLE_KEY: '' };
let r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o1'), '--email-search', '--concurrency', '1', '--env', path.join(tmp, 'none.env')], { env: envBase, encoding: 'utf8' });
const out1 = fs.readFileSync(path.join(tmp, 'o1', 'serp_text.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
check('runs WITHOUT --max-cost, 3 records, exit 0', r.status === 0 && out1.length === 3);
const p1 = out1.find(x => x.place_id === 'P1');
check('P1 ok: biased text carries the BBB snippet, linkedin rung the profile, backend tagged keenable', p1.status === 'ok' && /Jane Doe, Owner/.test(p1.biased_text) && /linkedin\.com\/in\/janedoe/.test(p1.linkedin_text) && p1.backend === 'keenable');
check('email rung ran on the two sites, not the no-website lead', p1.email_queries.length === 1 && /^site:acmepools\.com/.test(p1.email_queries[0]) && out1.find(x => x.place_id === 'P3').email_queries.length === 0);
const cost1 = JSON.parse(fs.readFileSync(path.join(tmp, 'o1', 'serp_cost.json'), 'utf8'));
// P1: biased+linkedin+email = 3; P2: biased+linkedin+broad+email = 4; P3: biased+linkedin+broad = 3 => 10 calls, $0
check('calls metered at $0: 10 calls, backend keenable', cost1.calls_this_run === 10 && cost1.spent_usd_this_run === 0 && cost1.backend === 'keenable');
check('keyless NOTE printed + summary names the keyless pool', /KEENABLE_KEY/.test(r.stderr) && /KEYLESS public pool/.test(r.stdout));
r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o2'), '--mode', 'standard'], { env: envBase, encoding: 'utf8' });
check('--mode standard refused on keenable (live-only)', r.status === 1 && /live-only/.test(r.stderr));
r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o3'), '--concurrency', '1', '--env', path.join(tmp, 'none.env')], { env: { ...envBase, KEENABLE_KEY: 'keen_test' }, encoding: 'utf8' });
check('with a key: no keyless NOTE, summary says keyed', r.status === 0 && !/no KEENABLE_KEY/.test(r.stderr) && /keyed \(100K free/.test(r.stdout));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
