/*
 * paginate.js :: offset-pagination loop for searchmaps.php. Pure + injectable.
 *
 * WHY THIS EXISTS. runbook.md claimed (June 2026) that `offset` pagination was broken
 * (`status:"failed"`). Re-tested live 2026-09-13: it WORKS. offset=0/20/40/100 all return
 * status:"ok" with ZERO place_id overlap between pages, and the result set ends with an
 * empty data array. One viewport ("Law firm", VI core, zoom 14) paginated to 348 unique
 * businesses vs the ~100 the runbook calls a hard per-viewport cap. scrape.js hardcoded
 * offset:0 and never paged, so it under-collected the long tail on every dense tile.
 *
 * This is a separate module (not an export from scrape.js) because scrape.js exits at
 * load time when --runsheet/--config are absent, so it cannot be require()d from a test.
 *
 * TWO TERMINATION RULES, BOTH FROM MEASURED BEHAVIOUR — do not "simplify" either:
 *
 *  1. Step the offset by LIMIT, NEVER by records returned. Measured at limit=20:
 *     offset=260 -> 14 records, offset=280 -> 19, offset=300 -> 9, offset=320 -> 0.
 *     The window is fixed-width with sparse tails; stepping by the returned count
 *     desynchronises the paging and silently skips records.
 *
 *  2. A SHORT PAGE IS NOT THE LAST PAGE. The 14-then-19 above is mid-sequence. Break
 *     only on a genuinely empty array. (A zero-length page mid-sequence is theoretically
 *     possible for the same reason a 9-length one is; the 3-pass union in
 *     processes/05-new-premises-delta.md is the mitigation, not a second terminator call
 *     on every row.)
 *
 * An empty page 0 breaks immediately, so sparse tiles never pay a wasted terminator call.
 */

const isOk = s => s === 'ok' || s === 'OK';

/**
 * Page one viewport to exhaustion.
 *
 * @param {object}   o
 * @param {function} o.call     async (offset) => API response ({status, data:[]}). Injected
 *                              so this is testable with no network and no host seam.
 * @param {number}   o.limit    page width; also the offset step.
 * @param {boolean}  o.paginate false => single call at offset 0 (legacy behaviour).
 * @param {number}   o.maxPages hard guard against a non-terminating result set.
 * @param {function} [o.delay]  awaited before every call (politeness gap).
 * @returns {Promise<{records:Array, pages:number, statuses:Array, allOk:boolean, badStatus:(string|undefined)}>}
 */
async function pageTile(o) {
  const { call, limit, paginate = false, maxPages = 8, delay } = o;
  const records = [];
  const statuses = [];
  let pages = 0;
  let offset = 0;

  for (;;) {
    if (delay) await delay();
    const r = await call(offset);
    pages++;
    const recs = r && Array.isArray(r.data) ? r.data : [];
    const status = r ? r.status : undefined;
    statuses.push(status);
    for (const rec of recs) records.push(rec);

    if (!paginate) break;              // legacy: one call, offset 0
    if (recs.length === 0) break;      // exhausted (an empty page 0 costs no extra call)
    if (!isOk(status)) break;          // never keep paging a tile that is already failing
    if (pages >= maxPages) break;      // guard
    offset += limit;                   // RULE 1: step by limit, not by recs.length
  }

  return {
    records,
    pages,
    statuses,
    allOk: statuses.every(isOk),
    badStatus: statuses.find(s => !isOk(s)),
  };
}

module.exports = { pageTile, isOk };
