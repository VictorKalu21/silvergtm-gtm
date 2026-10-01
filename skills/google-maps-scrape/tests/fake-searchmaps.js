#!/usr/bin/env node
/*
 * fake-searchmaps.js :: stand-in for scraper.tech's searchmaps.php, for tests.
 *
 * Runs as its OWN PROCESS on purpose. The tests drive scrape.js with execFileSync, which
 * blocks the Node event loop — an in-process server would never answer the child's
 * requests and the test deadlocks. (It did.)
 *
 * Usage: node fake-searchmaps.js <portfile> <logfile>
 *   Binds an ephemeral port and writes it to <portfile> once listening, so the caller
 *   never has to guess a free port (net.Server.listen(0) is async — address() is null
 *   until the 'listening' event, which a synchronous test cannot await).
 *
 * Behaviour, keyed on the `query` parameter:
 *   offset 0      -> a FULL page (limit records)  => the pager must keep going
 *   offset limit  -> a SHORT page (40 records)    => a short page is NOT the end
 *   beyond        -> empty array                  => exhausted
 * Query "FailOnce" returns status:"failed" on its page-2 request the FIRST time only,
 * then behaves normally — the intermittent deep-offset failure seen live on 2026-09-13.
 *
 * Two extra query shapes, for the zero-row blind spot (run-scrape.js --no-heal-zero):
 *   "Zero*"   -> status:"ok" with an EMPTY array at every offset. The endpoint handing back an
 *                empty page is exactly the failure the heal loop could not see.
 *   "Big<N>"  -> N records across pages (150, then the remainder, then empty) — the dense query
 *                at the same centre that proves the zero is not a real zero.
 *
 * Every request is appended to <logfile> as "query@offset" so tests can assert on paging.
 */
const http = require('http'), fs = require('fs');
const PORTFILE = process.argv[2];
const LOG = process.argv[3];
const PAGE = 150;

let failOnceArmed = true;

const recs = (tag, from, n) => Array.from({ length: n }, (_, i) => ({
  place_id: `${tag}-${from + i}`, business_id: `b-${tag}-${from + i}`, name: `${tag} biz ${from + i}`,
  types: ['Bank'], full_address: `${from + i} Test St, Lagos`, city: 'Lagos',
  latitude: 6.43, longitude: 3.42, website: '', phone_number: '+234',
  rating: 4, review_count: 3, is_claimed: true, verified: true,
}));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams.get('query');
  const off = Number(u.searchParams.get('offset') || 0);
  fs.appendFileSync(LOG, `${q}@${off}\n`);
  const send = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

  if (q === 'FailOnce' && off === PAGE && failOnceArmed) { failOnceArmed = false; return send({ status: 'failed', data: [] }); }
  if (/^Zero/.test(q)) return send({ status: 'ok', data: [] });          // ok, but 0 rows, forever
  const big = /^Big(\d+)$/.exec(q);
  if (big) return send({ status: 'ok', data: recs(q, off, Math.max(0, Math.min(PAGE, +big[1] - off))) });
  if (off === 0) return send({ status: 'ok', data: recs(q, 0, PAGE) });
  if (off === PAGE) return send({ status: 'ok', data: recs(q, PAGE, 40) });
  return send({ status: 'ok', data: [] });
}).listen(0, '127.0.0.1', function () { fs.writeFileSync(PORTFILE, String(this.address().port)); });
