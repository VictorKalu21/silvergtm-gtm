#!/usr/bin/env node
/* search-owner.js DataForSEO backend: response normalisation, location codes, email-rung queries and
 * extraction, and an end-to-end stubbed run (SEARCH_OWNER_STUB) proving serp_text.jsonl shape, cost
 * accounting and the --max-cost stop (exit 3). No network. */
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const SO = path.join(__dirname, '..', 'search-owner.js');
const { locationCode, parseDataforseo, emailsFromText, buildEmailQueries, overBudget } = require(SO);
let fails = 0; const check = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };

const okResp = (items, cost = 0.002) => ({ status_code: 20000, cost, tasks_count: 1, tasks_error: 0, tasks: [{ status_code: 20000, cost, result: [{ items }] }] });
const org = (t, d, u) => ({ type: 'organic', title: t, description: d, url: u });

// 1. normalisation
const p = parseDataforseo(okResp([org('Acme Pools - About', 'Founded by Jane Doe, owner', 'https://acmepools.com/about'), { type: 'people_also_ask', title: 'x' }, org('BBB', 'Principal: Jane Doe', 'https://bbb.org/x')]));
check('ok response -> 2 organic results, PAA ignored', p.status === 'ok' && p.results.length === 2 && p.results[1].url === 'https://bbb.org/x');
check('cost carried', p.cost === 0.002);
check('http-level error -> failed', parseDataforseo({ status_code: 40101, status_message: 'Auth error', cost: 0 }).status === 'failed:Auth error');
check('task-level error -> failed', parseDataforseo({ status_code: 20000, cost: 0, tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] }).status.startsWith('failed:'));
check('garbage -> parse_error', parseDataforseo(null).status === 'parse_error');
// 2. location codes
check('US default 2840', locationCode('US') === 2840 && locationCode(undefined) === 2840);
check('gb -> 2826, override wins', locationCode('gb') === 2826 && locationCode('gb', 9999) === 9999);
// 3. emails
const em = emailsFromText('Contact info@acmepools.com or jane.doe@acmepools.com; logo@2x.png; user@example.com');
check('email extraction + junk filter', em.length === 2 && em.includes('info@acmepools.com') && em.includes('jane.doe@acmepools.com'));
// 4. email queries
const eq = buildEmailQueries({ website: 'https://www.acmepools.com/' }, { facebook: ['https://facebook.com/acmepools'], instagram: ['https://instagram.com/acmepools'] }, h => /facebook\.com$/.test(h));
check('site + facebook + instagram queries', eq.length === 3 && eq[0].surface === 'site' && eq[0].query.startsWith('site:acmepools.com (') && eq[1].query.startsWith('site:facebook.com/acmepools'));
const eqShared = buildEmailQueries({ website: 'https://facebook.com/acmepools' }, null, h => /facebook\.com$/.test(h));
check('shared-host website -> no site query', eqShared.length === 0);
check('overBudget', overBudget(1.0, 1.0) && !overBudget(0.5, 1.0) && !overBudget(5, Infinity));

// 5. end-to-end stubbed run
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'so-dfs-'));
const leads = path.join(tmp, 'leads.csv');
fs.writeFileSync(leads, 'place_id,name,city,neighborhood,full_address,zip,phone_number,website,icp_type\nP1,Acme Pools,"Tampa, FL",,"1 Main St, Tampa, FL 33602",33602,(813) 555-0100,https://acmepools.com/,pool\nP2,Beta Pools,"Austin, TX",,"2 Main St, Austin, TX 78701",78701,(512) 555-0100,https://betapools.com/,pool\nP3,Gamma Pools,"Mesa, AZ",,"3 Main St, Mesa, AZ 85201",85201,(480) 555-0100,,pool\n');
const cfg = path.join(tmp, 'cfg.json');
fs.writeFileSync(cfg, JSON.stringify({ geo: { country: 'us', region_from_city: ',\\s*([A-Z]{2})\\b', region_default: 'US' }, owner_query: { serp_backend: 'dataforseo', bias_terms: ['owner'], use_linkedin: true } }));
const stub = path.join(tmp, 'stub.json');
fs.writeFileSync(stub, JSON.stringify({
  'Acme Pools Tampa FL ("owner")': okResp([org('Acme Pools | BBB', 'Principal: Jane Doe, Owner', 'https://bbb.org/acme')]),
  'site:linkedin.com Acme Pools Tampa FL': okResp([org('Jane Doe - Owner - Acme Pools', 'Tampa, Florida', 'https://linkedin.com/in/janedoe')]),
  '*': okResp([], 0.002)
}));
const envBase = { ...process.env, SEARCH_OWNER_STUB: stub };
// 5a. backend requires --max-cost
let r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o0')], { env: envBase, encoding: 'utf8' });
check('dataforseo backend refuses to run without --max-cost', r.status === 1 && /max-cost/.test(r.stderr));
// 5b. full run with email search, generous cap
r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o1'), '--max-cost', '1', '--email-search', '--concurrency', '1'], { env: envBase, encoding: 'utf8' });
const out1 = fs.readFileSync(path.join(tmp, 'o1', 'serp_text.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
check('run completes, 3 records', r.status === 0 && out1.length === 3);
const p1 = out1.find(x => x.place_id === 'P1');
check('P1 ok with biased + linkedin text and backend tag', p1.status === 'ok' && /Jane Doe/.test(p1.biased_text) && /linkedin\.com\/in\/janedoe/.test(p1.linkedin_text) && p1.backend === 'dataforseo');
check('email rung ran on the site, not on the no-website lead', p1.email_queries.length === 1 && /^site:acmepools\.com/.test(p1.email_queries[0]) && out1.find(x => x.place_id === 'P3').email_queries.length === 0);
const cost1 = JSON.parse(fs.readFileSync(path.join(tmp, 'o1', 'serp_cost.json'), 'utf8'));
// P1: biased+linkedin+email = 3; P2: biased+linkedin+broad+email = 4; P3: biased+linkedin+broad = 3  => 10 calls x $0.002
check('cost accounting: 10 calls, $0.02', cost1.calls_this_run === 10 && Math.abs(cost1.spent_usd_this_run - 0.02) < 1e-9 && cost1.budget_hit === false);
// 5c. cap stops the run with exit 3 and a resumable file
r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o2'), '--max-cost', '0.005', '--concurrency', '1'], { env: envBase, encoding: 'utf8' });
const cost2 = JSON.parse(fs.readFileSync(path.join(tmp, 'o2', 'serp_cost.json'), 'utf8'));
const out2 = fs.readFileSync(path.join(tmp, 'o2', 'serp_text.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
check('--max-cost stops early: exit 3, budget_hit, fewer than 3 leads', r.status === 3 && cost2.budget_hit === true && out2.length < 3 && /max-cost/.test(r.stdout));
// 5d. resume continues from the cap with a new cap, reusing the spent total
r = spawnSync(process.execPath, [SO, '--leads', leads, '--config', cfg, '--out', path.join(tmp, 'o2'), '--max-cost', '1', '--resume', '--concurrency', '1'], { env: envBase, encoding: 'utf8' });
const out2b = fs.readFileSync(path.join(tmp, 'o2', 'serp_text.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
const cost2b = JSON.parse(fs.readFileSync(path.join(tmp, 'o2', 'serp_cost.json'), 'utf8'));
check('--resume finishes the rest and keeps the running total', r.status === 0 && out2b.length === 3 && cost2b.spent_usd_total_before_this_run_included > cost2b.spent_usd_this_run);
// 5e. legacy backend untouched by default (needs its key)
r = spawnSync(process.execPath, [SO, '--leads', leads, '--out', path.join(tmp, 'o3'), '--env', path.join(tmp, 'none.env')], { env: { ...process.env, SCRAPER_TECH_SEARCH_KEY: '' }, encoding: 'utf8' });
check('default backend is still scraper_tech and still wants its key', r.status === 1 && /SCRAPER_TECH_SEARCH_KEY/.test(r.stderr));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
