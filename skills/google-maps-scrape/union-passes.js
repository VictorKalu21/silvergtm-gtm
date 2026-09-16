#!/usr/bin/env node
/*
 * union-passes.js :: N-pass union + cross-cycle memory + delta, for repeat-scrape
 * ("new premises") jobs. See processes/05-new-premises-delta.md.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT build-netnew.js.
 * searchmaps.php is NON-DETERMINISTIC: measured 2026-09-13, two full paginated passes of
 * one viewport minutes apart returned 314 and 308 unique with a union of 354 — a single
 * pass captures only ~86%, and 12.7% of a baseline resurfaces as "net-new" between runs
 * when nothing has opened. Unioning repeated passes converges at 3 (pass2 +13.2%,
 * pass3 +0.9%). Without that, a monthly place_id delta is majority noise.
 *
 * build-netnew.js cannot be used for this job, for two reasons confirmed in its source:
 *   1. `--client` ref discovery matches only /^clay.*\.csv$|_netnew\.csv$/i
 *      (build-netnew.js:54), so THE DELTA OUTPUT IS THE MEMORY. Filter the delta and those
 *      places vanish from memory, then return next cycle as fake-new — the exact failure
 *      the confirmation rule is meant to prevent.
 *   2. It drops rows sharing a website host (build-netnew.js:77-78). Every branch of a
 *      multi-site operator shares one domain, so it would delete every new bank branch —
 *      the highest-repeat segment there is.
 * So memory here is the PRE-QUALIFY union file, passed explicitly via --prior, and the
 * confirmed delta is written to a filename that deliberately does NOT match that regex.
 *
 * Usage:
 *   node union-passes.js --pass <dir> [--pass <dir> ...] --out <dir>
 *                        [--prior <union.csv> ...] [--cycle <label>]
 *                        [--relocation-m 150] [--min-hits 2] [--allow-incomplete]
 *
 * Outputs into --out:
 *   leads_clean_union.csv     THE CANONICAL MEMORY. Pre-qualify, every place including
 *                             single-hit ones. Feed it back as --prior next cycle.
 *   leads_delta_confirmed.csv New places confirmed this cycle. The outbound list.
 *   leads_delta_pending.csv   New places seen in only one pass — DEFERRED, not dropped.
 *   leads_changed.csv         Relocations / renames / category changes / claim flips.
 *   union_report.json         Per-pass contribution and capture %, per query and per tile.
 */
const fs = require('fs');
const path = require('path');

function args(name) { const o = []; process.argv.forEach((a, i) => { if (a === '--' + name) o.push(process.argv[i + 1]); }); return o; }
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }

const PASSES = args('pass');
const PRIORS = args('prior');
const OUT = arg('out');
const CYCLE = arg('cycle', new Date().toISOString().slice(0, 10));
const RELOC_M = Number(arg('relocation-m', 150));
const MIN_HITS = Number(arg('min-hits', 2));
const ALLOW_INCOMPLETE = process.argv.includes('--allow-incomplete');

if (!PASSES.length || !OUT) {
  console.error('ERROR: at least one --pass <dir> and --out <dir> are required');
  process.exit(2);
}
if (PASSES.length < MIN_HITS) {
  console.error(`WARN: ${PASSES.length} pass(es) but --min-hits ${MIN_HITS} — no place can be confirmed on hits`);
  console.error('      alone this cycle, so everything new lands in leads_delta_pending.csv. That is correct for a');
  console.error('      single-pass run; for a real cycle give 3 passes (convergence knee measured 2026-09-13).');
}

// CSV dialect: the quote-aware one from qualify-leads.js:35-36. NOT the line-based
// mergeLeads() in run-scrape.js:94-108, which assumes place_id is column 0 with no
// quoting and is first-wins with no field merge.
function parseCsv(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const csvCell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvRow = a => a.map(csvCell).join(',');

function readCsv(file) {
  if (!fs.existsSync(file)) return { H: [], rows: [] };
  const rows = parseCsv(fs.readFileSync(file, 'utf8')).filter(r => r.length > 1);
  if (!rows.length) return { H: [], rows: [] };
  const H = rows.shift();
  return { H, rows: rows.map(r => Object.fromEntries(H.map((h, i) => [h, (r[i] == null ? '' : r[i])]))) };
}

// ---------- guards ----------
// A pass that exited INCOMPLETE still leaves a populated leads_clean.csv, because
// run-scrape.js:120 merges before the exit-1 decision at :166. run-batch.js:42-47 then
// skip-guards on row count alone and marks such a job 'done' on a resumed cycle. Unioning
// that hole into the baseline silently manufactures next cycle's fake-new.
for (const d of PASSES) {
  const cov = path.join(d, 'coverage_report.json');
  if (!fs.existsSync(cov)) {
    if (ALLOW_INCOMPLETE) { console.error(`WARN: ${d} has no coverage_report.json (--allow-incomplete)`); continue; }
    console.error(`ERROR: ${d} has no coverage_report.json — it was not run through run-scrape.js. Refusing.`);
    process.exit(1);
  }
  const status = (JSON.parse(fs.readFileSync(cov, 'utf8')).status || '').toUpperCase();
  if (status !== 'COMPLETE') {
    if (ALLOW_INCOMPLETE) { console.error(`WARN: ${d} coverage is ${status} (--allow-incomplete)`); continue; }
    console.error(`ERROR: ${d} coverage is ${status}, not COMPLETE. Unioning an incomplete pass puts a hole in the`);
    console.error('       baseline, and every place it missed returns next cycle looking like a new premises.');
    console.error('       Re-run that pass. Override with --allow-incomplete only if you accept that.');
    process.exit(1);
  }
  // Shipped-feed filenames inside a pass dir would be picked up as "prior" refs by
  // build-netnew.js:54-56 elsewhere in the pipeline, and the run would dedupe itself away.
  for (const f of fs.readdirSync(d)) {
    if (/^clay.*\.csv$/i.test(f) || /_netnew\.csv$/i.test(f)) {
      console.error(`ERROR: ${path.join(d, f)} is a shipped-feed filename inside a pass dir.`);
      console.error('       Pass dirs must hold scrape outputs only; the union, qualify and delta live at the run root.');
      process.exit(1);
    }
  }
}

// ---------- helpers ----------
const LEGAL = /\b(ltd|limited|plc|inc|llc|nig|nigeria|ng|company|co|enterprises|ventures|int'l|international|group)\b/g;
// Footprint place names are stripped so branches of one brand collapse to one account.
const PLACES = /\b(victoria island|vi|ikoyi|lekki|phase [12]|ajah|sangotedo|oniru|ikate|agungi|osapa|chevron|vgc|ikota|banana island|parkview|marina|obalende|adeola odeku|ozumba mbadiwe|awolowo|admiralty|adetokunbo ademola|ahmadu bello|akin adesola|eko atlantic|lagos|branch|head office|hq|annex|main)\b/g;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s'&-]/g, ' ').replace(/\s+/g, ' ').trim();

// Parent-brand key: three new Fidelity branches should be ONE account conversation with
// evidence, not three cold calls. Heuristic — first two significant tokens once legal
// suffixes and footprint place names are removed.
function brandKey(name) {
  const t = norm(name).replace(LEGAL, ' ').replace(PLACES, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return t.slice(0, 2).join(' ') || norm(name);
}

// Street key for co-tenancy. scraper.tech prepends a Google plus code and/or the business
// name to full_address (80% of pilot rows start with the name, 288 with a plus code), so a
// naive key yields all singletons.
function streetKey(addr, name) {
  let a = String(addr || '');
  a = a.replace(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*/, '');            // plus code
  const n = String(name || '').trim();
  if (n && a.toLowerCase().startsWith(n.toLowerCase())) a = a.slice(n.length);
  a = a.replace(/^[\s,]+/, '');
  a = norm(a)
    .replace(/\b(suite|ste|unit|shop|floor|flr|rm|room|block|wing)\s*[a-z0-9-]*/g, ' ')  // unit-level detail
    .replace(/\b\d{6}\b/g, ' ')                                                          // postcode
    .replace(/\b(lagos|nigeria|eti-osa|eti osa)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  // Require a street number. Without it the key degenerates to a bare area or avenue name
  // ("victoria island" clustered 37 unrelated rows in the pilot), which is not a building
  // and would inflate co_tenant_count into a meaningless deal-band signal.
  if (!/\d/.test(a)) return '';
  return a;
}
const floorOf = addr => {
  const m = String(addr || '').toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s*floor/);
  return m ? Number(m[1]) : null;
};
function haversineM(la1, ln1, la2, ln2) {
  const R = 6371000, r = d => d * Math.PI / 180;
  const dLa = r(la2 - la1), dLn = r(ln2 - ln1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------- read passes and union ----------
const merged = new Map();       // place_id -> row (first non-empty wins per field)
const hits = new Map();         // place_id -> count of passes containing it
const perPass = [];
let baseHeader = null;

PASSES.forEach((dir, idx) => {
  const { H, rows } = readCsv(path.join(dir, 'leads_clean.csv'));
  if (!H.length) { console.error(`ERROR: ${dir}/leads_clean.csv is empty or missing`); process.exit(1); }
  if (!baseHeader) baseHeader = H.slice();
  const ids = new Set();
  for (const r of rows) {
    const id = (r.place_id || '').trim();
    if (!id) continue;
    ids.add(id);
    if (!merged.has(id)) { merged.set(id, { ...r }); }
    else {
      const m = merged.get(id);
      for (const k of Object.keys(r)) {
        // icp_type / google_types accumulate as a set union, mirroring scrape.js:176-177.
        if (k === 'icp_type' || k === 'google_types') {
          const s = new Set([...(m[k] || '').split('|'), ...(r[k] || '').split('|')].map(x => x.trim()).filter(Boolean));
          m[k] = [...s].join('|');
        } else if (!String(m[k] || '').trim() && String(r[k] || '').trim()) {
          m[k] = r[k];   // prefer first NON-EMPTY, not first row — a later pass may be richer
        }
      }
    }
  }
  for (const id of ids) hits.set(id, (hits.get(id) || 0) + 1);
  perPass.push({ dir, unique: ids.size, ids });
});

// ---------- priors (cross-cycle memory) ----------
const prior = new Map();
for (const f of PRIORS) {
  const { rows } = readCsv(f);
  for (const r of rows) {
    const id = (r.place_id || '').trim();
    if (!id) continue;
    const cum = Number(r.cumulative_hits || 0) || 0;
    const ex = prior.get(id);
    prior.set(id, {
      first_seen_cycle: (ex && ex.first_seen_cycle) || r.first_seen_cycle || '',
      cumulative_hits: Math.max(ex ? ex.cumulative_hits : 0, cum),
      // A prior row without the column predates this script: treat as already delivered so
      // an established baseline is never re-blasted as "new".
      delivered: (ex && ex.delivered) || String(r.delivered || 'true').toLowerCase() === 'true',
      latitude: r.latitude, longitude: r.longitude, name: r.name,
      google_types: r.google_types, is_claimed: r.is_claimed, website: r.website,
    });
  }
}
const isBaselineRun = PRIORS.length === 0;

// ---------- co-tenancy ----------
const byStreet = new Map();
for (const [id, r] of merged) {
  const k = streetKey(r.full_address, r.name);
  if (!k) continue;
  if (!byStreet.has(k)) byStreet.set(k, []);
  byStreet.get(k).push(id);
}
const hubStreets = new Set();
for (const [k, ids] of byStreet) {
  for (const id of ids) {
    const t = (merged.get(id).google_types || '').toLowerCase();
    if (t.includes('coworking') || t.includes('office space rental')) { hubStreets.add(k); break; }
  }
}
const floorsByStreet = new Map();
for (const [k, ids] of byStreet) {
  let mx = null;
  for (const id of ids) { const f = floorOf(merged.get(id).full_address); if (f != null) mx = Math.max(mx == null ? f : mx, f); }
  if (mx != null) floorsByStreet.set(k, mx);
}

// ---------- classify ----------
const EXTRA = ['pass_hits', 'first_seen_cycle', 'cumulative_hits', 'delivered', 'brand_key',
               'street_key', 'co_tenant_count', 'floors_hint', 'at_coworking_hub', 'angle', 'change_flags'];
const outCols = [...baseHeader.filter(c => !EXTRA.includes(c)), ...EXTRA];

const unionRows = [], confirmed = [], pending = [], changed = [];
let newCount = 0;

for (const [id, r] of merged) {
  const h = hits.get(id) || 0;
  const p = prior.get(id);
  const isNew = !p;
  const cum = (p ? p.cumulative_hits : 0) + h;

  // Change detectors — only meaningful against a prior cycle.
  const flags = [];
  if (p) {
    const la1 = parseFloat(p.latitude), ln1 = parseFloat(p.longitude);
    const la2 = parseFloat(r.latitude), ln2 = parseFloat(r.longitude);
    if ([la1, ln1, la2, ln2].every(v => !isNaN(v))) {
      const d = haversineM(la1, ln1, la2, ln2);
      // A firm that MOVES keeps its place_id and edits the address, so the place_id delta
      // is blind to relocations — and "corporations moving to a new office" is a primary
      // trigger. This is the only detector that sees them.
      if (d > RELOC_M) flags.push(`relocated_${Math.round(d)}m`);
    }
    if (norm(p.name) && norm(p.name) !== norm(r.name)) flags.push('renamed');
    const pt = x => (x || '').split('|')[0].trim().toLowerCase();
    if (pt(p.google_types) && pt(p.google_types) !== pt(r.google_types)) flags.push('category_changed');
    const cl = x => String(x || '').toLowerCase() === 'true';
    if (!cl(p.is_claimed) && cl(r.is_claimed)) flags.push('claim_flipped');
    if (!String(p.website || '').trim() && String(r.website || '').trim()) flags.push('website_appeared');
  }

  // Confirmation. A single-hit new place is DEFERRED, never dropped: excluding it from the
  // delta AND absorbing it into the baseline would mean it is never surfaced at all — and
  // flicker-prone listings (low prominence, no reviews, unclaimed) are exactly the
  // new-premises profile, so the loss would concentrate on the target.
  const alreadyDelivered = p ? p.delivered : false;
  const confirmedNow = !alreadyDelivered && (h >= MIN_HITS || cum >= MIN_HITS);

  const k = streetKey(r.full_address, r.name);
  const row = {
    ...r,
    pass_hits: h,
    first_seen_cycle: (p && p.first_seen_cycle) || CYCLE,
    cumulative_hits: cum,
    delivered: String(alreadyDelivered || confirmedNow),
    brand_key: brandKey(r.name),
    street_key: k,
    co_tenant_count: k ? (byStreet.get(k) || []).length : 0,
    floors_hint: k && floorsByStreet.has(k) ? floorsByStreet.get(k) : '',
    at_coworking_hub: String(!!(k && hubStreets.has(k))),
    angle: flags.length ? 'relocation_or_change' : (isNew ? 'new_premises' : 'baseline'),
    change_flags: flags.join('|'),
  };
  unionRows.push(row);
  if (isNew) newCount++;
  if (!alreadyDelivered) (confirmedNow ? confirmed : pending).push(row);
  if (flags.length) changed.push(row);
}

// ---------- report ----------
const unionSize = merged.size;
const capture = perPass.map(p => ({ dir: path.basename(p.dir), unique: p.unique, capture_pct: +(p.unique / unionSize * 100).toFixed(1) }));
const marginal = [];
{
  const seen = new Set();
  for (const p of perPass) {
    const before = seen.size;
    for (const id of p.ids) seen.add(id);
    marginal.push({ dir: path.basename(p.dir), union_after: seen.size, added: seen.size - before,
                    growth_pct: +((seen.size - before) / Math.max(seen.size, 1) * 100).toFixed(1) });
  }
}
// Per-query and per-tile capture: aggregate capture hides segment drift, and the 3-pass
// convergence figure was measured on ONE query in ONE viewport.
const byQuery = {}, byTile = {};
for (const [id, r] of merged) {
  const h = hits.get(id) || 0;
  for (const t of (r.icp_type || '').split('|').filter(Boolean)) {
    byQuery[t] = byQuery[t] || { places: 0, single_hit: 0 };
    byQuery[t].places++; if (h === 1) byQuery[t].single_hit++;
  }
  const city = (r.neighborhood || r.city || '?').trim();
  byTile[city] = byTile[city] || { places: 0, single_hit: 0 };
  byTile[city].places++; if (h === 1) byTile[city].single_hit++;
}
const pct = o => Object.fromEntries(Object.entries(o).map(([k, v]) =>
  [k, { places: v.places, single_hit: v.single_hit, single_hit_pct: +(v.single_hit / v.places * 100).toFixed(1) }]));

fs.mkdirSync(OUT, { recursive: true });
const write = (file, rows) => fs.writeFileSync(path.join(OUT, file),
  [csvRow(outCols), ...rows.map(r => csvRow(outCols.map(c => r[c])))].join('\n') + '\n');

write('leads_clean_union.csv', unionRows);
write('leads_delta_confirmed.csv', confirmed);
write('leads_delta_pending.csv', pending);
write('leads_changed.csv', changed);

const report = {
  cycle: CYCLE,
  baseline_run: isBaselineRun,
  passes: PASSES.length,
  union_unique: unionSize,
  per_pass: capture,
  marginal_contribution: marginal,
  single_pass_capture_pct: capture.length ? +(capture.reduce((a, c) => a + c.capture_pct, 0) / capture.length).toFixed(1) : null,
  new_place_ids: newCount,
  delta_confirmed: confirmed.length,
  delta_pending: pending.length,
  changed_places: changed.length,
  change_flag_counts: changed.reduce((a, r) => { for (const f of r.change_flags.split('|')) { const k = f.replace(/_\d+m$/, '_Nm'); a[k] = (a[k] || 0) + 1; } return a; }, {}),
  by_query: pct(byQuery),
  by_tile: pct(byTile),
  note: isBaselineRun
    ? 'BASELINE RUN (no --prior): every place is new by construction, so leads_delta_confirmed.csv is the initial list, NOT newly-opened premises. Treat the first two cycles as baseline-building.'
    : 'Delta is vs the supplied --prior union files. Feed leads_clean_union.csv forward as next cycle\'s --prior.',
};
fs.writeFileSync(path.join(OUT, 'union_report.json'), JSON.stringify(report, null, 2));

console.log('UNION -> ' + OUT);
console.log(`  passes:            ${PASSES.length}`);
capture.forEach(c => console.log(`    ${c.dir}: ${c.unique} unique (${c.capture_pct}% of union)`));
marginal.forEach(m => console.log(`    +${m.dir}: union ${m.union_after} (added ${m.added}, ${m.growth_pct}%)`));
console.log(`  union unique:      ${unionSize}`);
console.log(`  new place_ids:     ${newCount}${isBaselineRun ? '  (BASELINE RUN — all places are new by construction)' : ''}`);
console.log(`  delta confirmed:   ${confirmed.length}  (>= ${MIN_HITS} hits this cycle, or cumulative)`);
console.log(`  delta pending:     ${pending.length}  (single-hit — deferred to next cycle, NOT dropped)`);
console.log(`  changed places:    ${changed.length}  ${JSON.stringify(report.change_flag_counts)}`);
