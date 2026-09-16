#!/usr/bin/env node
/* dedupe-ref.js :: SKILL STEP 5c (cross-run dedupe) for THIS run.  RUN-FOLDER ONE-OFF.
 *
 * WHY NOT build-netnew.js ALONE — the id-shape mismatch
 * -----------------------------------------------------
 * This client's dedupe memory is the 2026-09-16 export run's shipped deliverable:
 *   ../2026-09-16_uk-foundation-repair/deliverable/atlas_uk_foundation_repair_qualified.csv  (175 rows)
 * Its `place_id` column does NOT hold Google `ChIJ…` place ids. It holds the `0x…:0x…` hex
 * pair — which the scraper.tech Maps engine writes into a DIFFERENT column: `business_id`
 * (scrape.js:282 emits both `place_id` and `business_id`). build-netnew.js keys on
 * `place_id`-to-`place_id` only (build-netnew.js:30, :75), so ChIJ… vs 0x… never collides and
 * the primary key silently matches NOTHING. Every one of the 175 already-shipped firms would
 * come back looking net-new except where its website host happens to match.
 *
 * So this script does the id match the right way round, plus two independent fallbacks:
 *   1. id    — new.business_id  ==  ref.place_id      (also new.place_id, in case a future ref
 *                                                      ever carries ChIJ ids)
 *   2. host  — registrable website host, www-stripped, lowercased, `co.uk`-aware
 *              (shared-hosts.js::rootDomain), from ref `domain` or `website`
 *   3. phone — digits only, leading 00 dropped, leading 44 -> 0  (the ref mixes "07446888343"
 *              and "+447876803029" in the SAME column, so a raw string compare is useless)
 *
 * SHARED HOSTS ARE NEVER A KEY, on either side. One of the 175 ref rows lists a
 * checkatrade.com profile as its website; keying on that host would drop EVERY new lead whose
 * Maps "website" is a Checkatrade profile as "already contacted" (collapse-domains.js routes
 * exactly those rows to the STEP 5d recovery track, so they are real, wanted leads).
 * classifyWebsite() gates both sides — same one list, shared-hosts.js.
 *
 * `ref rows: 175` is printed on every run BY DESIGN: the memory file is gitignored, so a wrong
 * or moved path fails silently as "0 dropped, everything net-new". If that line does not say
 * 175, STOP — SKILL STEP 5c: a missing history means re-contacting leads already in a live
 * campaign.
 *
 * -------------------------------------------------------------------------------------------
 * AND build-netnew.js --client AFTERWARDS?  NO — checked, do not.  (probe, 2026-09-16:)
 *
 *     $ node skills/google-maps-scrape/build-netnew.js --new <probe.csv> \
 *           --client clients/atlas-growth --out <probe_netnew.csv>
 *     ref files used: 0 | prior place_ids: 0 | new: 1
 *     dropped: 0 (place_id) + 0 (website host) | NET-NEW kept: 1
 *
 * Its --client walk (build-netnew.js:54) only accepts filenames matching
 * /^clay.*\.csv$|_netnew\.csv$/i — SHIPPED FEEDS ONLY. Under clients/atlas-growth today:
 *   - deliverable/atlas_uk_foundation_repair_qualified.csv  -> NOT matched (the name is neither clay… nor …_netnew)
 *   - clients/atlas-growth/shards/shard-0..7.csv            -> NOT matched, and they are RUNSHEET
 *                                                              shards (cell_id,icp_type,query,…),
 *                                                              no place_id column, so refKeys()
 *                                                              would reject them anyway
 *   - 2026-09-11_foundation-repair/ (the US run)            -> holds no .csv at all on this machine
 *   - this run's own folder                                 -> skipped by build-netnew.js:56
 * So --client discovers ZERO refs, drops nothing, and prints `ref files used: 0` — which SKILL
 * STEP 5c defines as the STOP signal for a client that HAS history. Running it would either be a
 * pure no-op or (read literally) a false alarm. Run THIS script instead and skip --client.
 *
 * Forcing it with an explicit --ref at the deliverable is worse, not better:
 *   (a) its place_id key still matches nothing (the 0x/ChIJ mismatch above), so
 *   (b) the ONLY thing that would fire is its website-host key — which is full-host, not
 *       registrable (a `leeds.example.co.uk` branch site misses `example.co.uk`), and has NO
 *       shared-host guard, so the one checkatrade.com ref row nukes every Checkatrade-only UK
 *       lead in the new list. That is a real-lead loss with no id-match upside.
 * The US-host hazard to watch for LATER: if anyone ever drops a `clay*.csv` or `*_netnew.csv`
 * from the 2026-09-11 US run into clients/atlas-growth, --client WILL pick it up, and its
 * host key would then drop UK rows on a US host match — including, again, every shared host
 * present in that US feed. If that file appears, keep using dedupe-ref.js (explicit refs,
 * shared-host-guarded) rather than --client.
 * -------------------------------------------------------------------------------------------
 *
 * Usage:
 *   node dedupe-ref.js --in <run>/leads_clean_qualified_infootprint.csv
 *                      [--ref <memory.csv>] [--out <run>/leads_netnew.csv]
 *                      [--report <run>/dedupe_report.json] [--expect-ref-rows 175]
 */
const fs = require('fs'), path = require('path');
const { rootDomain, classifyWebsite } = require('../../../skills/google-maps-scrape/shared-hosts');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const RUN = __dirname;
const IN = arg('in', path.join(RUN, 'leads_clean_qualified_infootprint.csv'));
const REF = arg('ref', path.join(RUN, '..', '2026-09-16_uk-foundation-repair', 'deliverable', 'atlas_uk_foundation_repair_qualified.csv'));
const OUT = arg('out', path.join(RUN, 'leads_netnew.csv'));
const REPORT = arg('report', path.join(RUN, 'dedupe_report.json'));
const EXPECT = Number(arg('expect-ref-rows', 175));

function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function load(f) {
  if (!fs.existsSync(f)) { console.error('ERROR: file not found: ' + f); process.exit(1); }
  const R = pc(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')).filter(r => r.length > 1);
  const H = R.shift();
  return { H, rows: R.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] == null ? '' : r[i]]))) };
}

const normId = v => String(v || '').trim().toLowerCase();
// registrable host, www-stripped, lowercased — '' for empty AND for shared hosts (never a key)
const normHost = v => { const s = String(v || '').trim(); if (!s) return ''; if (classifyWebsite(s) !== 'site') return ''; return rootDomain(s); };
// UK phone: digits only, drop a leading 00, leading 44 -> 0. Too-short strings are not a key.
function normPhone(v) {
  let d = String(v || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44') && d.length >= 11) d = '0' + d.slice(2);
  return d.length >= 9 ? d : '';
}

// ---------------- memory ----------------
const ref = load(REF);
const refIds = new Set(), refHosts = new Set(), refPhones = new Set();
let refSharedHosts = 0;
for (const r of ref.rows) {
  for (const v of [r.place_id, r.business_id]) { const k = normId(v); if (k) refIds.add(k); }
  const web = r.domain || r.website;
  const h = normHost(web);
  if (h) refHosts.add(h); else if (String(web || '').trim()) refSharedHosts++;
  const p = normPhone(r.phone_number || r.phone);
  if (p) refPhones.add(p);
}
console.log(`ref rows: ${ref.rows.length}`);
console.log(`ref path: ${path.resolve(REF)}`);
console.log(`ref keys: ${refIds.size} ids | ${refHosts.size} hosts (${refSharedHosts} shared-host website(s) ignored) | ${refPhones.size} phones`);
if (!ref.rows.length) { console.error('ERROR: the memory file has 0 rows — refusing (STEP 5c: no history = re-contacting live leads)'); process.exit(1); }
if (EXPECT && ref.rows.length !== EXPECT) console.error(`WARN: expected ${EXPECT} ref rows, got ${ref.rows.length} — is this the right memory file?`);

// ---------------- the new list ----------------
const nw = load(IN);
const keep = [], hits = { id: [], host: [], phone: [] };
for (const r of nw.rows) {
  const ids = [normId(r.business_id), normId(r.place_id)].filter(Boolean);
  const idHit = ids.find(k => refIds.has(k));
  if (idHit) { hits.id.push({ name: r.name, key: idHit, place_id: r.place_id, business_id: r.business_id }); continue; }
  const h = normHost(r.website);
  if (h && refHosts.has(h)) { hits.host.push({ name: r.name, key: h, place_id: r.place_id }); continue; }
  const p = normPhone(r.phone_number);
  if (p && refPhones.has(p)) { hits.phone.push({ name: r.name, key: p, place_id: r.place_id }); continue; }
  keep.push(r);
}

fs.writeFileSync(OUT, [nw.H.map(esc).join(','), ...keep.map(r => nw.H.map(h => esc(r[h])).join(','))].join('\n') + '\n');
const report = {
  ref_file: path.resolve(REF), ref_rows: ref.rows.length,
  ref_keys: { ids: refIds.size, hosts: refHosts.size, phones: refPhones.size, shared_host_websites_ignored: refSharedHosts },
  in_file: path.resolve(IN), in_rows: nw.rows.length,
  matched: { id: hits.id.length, host: hits.host.length, phone: hits.phone.length, total: hits.id.length + hits.host.length + hits.phone.length },
  net_new: keep.length,
  examples: { id: hits.id.slice(0, 10), host: hits.host.slice(0, 10), phone: hits.phone.slice(0, 10) },
  note: 'id = new.business_id vs ref.place_id (the 0x…:0x… form). build-netnew.js --client discovers 0 refs here and must NOT be relied on — see the header comment.',
};
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

console.log(`in rows:  ${nw.rows.length}`);
console.log(`dropped:  ${report.matched.total} (${hits.id.length} id + ${hits.host.length} host + ${hits.phone.length} phone)`);
console.log(`NET-NEW:  ${keep.length} -> ${OUT}`);
for (const k of ['id', 'host', 'phone']) {
  if (!hits[k].length) continue;
  console.log(`  ${k} matches (first 5): ` + hits[k].slice(0, 5).map(x => `${x.name} [${x.key}]`).join(' ; '));
}
console.log(`report -> ${REPORT}`);
