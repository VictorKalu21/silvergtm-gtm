#!/usr/bin/env node
/*
 * paginate.test.js :: offset-pagination loop (paginate.js)
 *
 * Scenarios (all against an injected fake `call`, no network, no host seam):
 *   A: paginate off          -> exactly ONE call at offset 0 (legacy behaviour preserved)
 *   B: offset steps by LIMIT -> never by records returned
 *   C: SHORT PAGE MID-SEQUENCE does not terminate   <-- the regression that matters
 *   D: empty array terminates
 *   E: empty page 0 costs no terminator call
 *   F: max_pages guard caps a non-terminating result set
 *   G: a failing page stops the loop AND makes allOk false (roll-up must report not-ok)
 *   H: allOk true when every page is ok
 *
 * C is drawn from real measured API behaviour at limit=20 on VI core / "Law firm":
 *   offset=260 -> 14 records, offset=280 -> 19, offset=300 -> 9, offset=320 -> 0.
 * A "short page means we're done" rule would have stopped at 14 and silently dropped 28.
 */
const { pageTile } = require(require('path').join(__dirname, '..', 'paginate.js'));

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const recs = n => Array.from({ length: n }, (_, i) => ({ place_id: 'p' + i }));
// Build a fake API from a list of per-page responses; records the offsets it was asked for.
function fake(pages) {
  const seen = [];
  const call = async off => { seen.push(off); return pages[seen.length - 1] || { status: 'ok', data: [] }; };
  return { call, seen };
}
const ok = n => ({ status: 'ok', data: recs(n) });

(async () => {
  // A — paginate off: one call, offset 0, legacy path untouched
  {
    const f = fake([ok(150), ok(150)]);
    const r = await pageTile({ call: f.call, limit: 150, paginate: false });
    check('A: paginate off makes exactly one call', f.seen.length === 1);
    check('A: that call is at offset 0', f.seen[0] === 0);
    check('A: returns only page 0 records', r.records.length === 150);
  }

  // B — offset steps by LIMIT even when a page returns fewer than LIMIT
  {
    const f = fake([ok(20), ok(14), ok(19), ok(0)]);
    await pageTile({ call: f.call, limit: 20, paginate: true });
    check('B: offsets step by limit (0,20,40,60)', JSON.stringify(f.seen) === JSON.stringify([0, 20, 40, 60]));
  }

  // C — THE REGRESSION: a short page mid-sequence must not terminate
  {
    const f = fake([ok(20), ok(14), ok(19), ok(9), ok(0)]);
    const r = await pageTile({ call: f.call, limit: 20, paginate: true });
    check('C: short page mid-sequence does NOT stop the loop', f.seen.length === 5);
    check('C: all records past the short page are kept (20+14+19+9)', r.records.length === 62);
  }

  // D — empty array terminates
  {
    const f = fake([ok(20), ok(0), ok(20)]);
    const r = await pageTile({ call: f.call, limit: 20, paginate: true });
    check('D: empty page terminates', f.seen.length === 2);
    check('D: records stop at the empty page', r.records.length === 20);
  }

  // E — empty page 0: no wasted terminator call on a sparse tile
  {
    const f = fake([ok(0)]);
    const r = await pageTile({ call: f.call, limit: 150, paginate: true });
    check('E: empty page 0 costs exactly one call', f.seen.length === 1);
    check('E: empty page 0 still counts as ok', r.allOk === true && r.records.length === 0);
  }

  // F — max_pages guard
  {
    const f = fake(Array.from({ length: 20 }, () => ok(150)));
    const r = await pageTile({ call: f.call, limit: 150, paginate: true, maxPages: 3 });
    check('F: max_pages caps the loop', f.seen.length === 3 && r.pages === 3);
  }

  // G — a failed page stops paging and poisons allOk (so the roll-up reports not-ok
  //     and run-scrape.js heals the tile instead of scoring it healthy)
  {
    const f = fake([ok(150), { status: 'timeout', data: [] }, ok(150)]);
    const r = await pageTile({ call: f.call, limit: 150, paginate: true });
    check('G: failed page stops the loop', f.seen.length === 2);
    check('G: allOk is false', r.allOk === false);
    check('G: badStatus surfaces the failure', r.badStatus === 'timeout');
  }

  // H — clean run reports ok
  {
    const f = fake([ok(150), ok(40), ok(0)]);
    const r = await pageTile({ call: f.call, limit: 150, paginate: true });
    check('H: allOk true when every page ok', r.allOk === true);
    check('H: records summed across pages', r.records.length === 190);
  }

  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
