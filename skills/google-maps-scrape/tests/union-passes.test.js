#!/usr/bin/env node
/*
 * union-passes.test.js :: N-pass union, cross-cycle memory, delta and detectors.
 *
 * Scenarios:
 *   A: pass_hits counts the passes a place appears in
 *   B: icp_type / google_types UNION across passes; other fields prefer first NON-EMPTY
 *   C: confirmation — >= min-hits this cycle goes to confirmed, single-hit goes to PENDING
 *   D: pending is DEFERRED, not dropped — it promotes next cycle on cumulative hits
 *   E: an already-delivered place is never re-emitted
 *   F: relocation detected on a stable place_id (the event the place_id delta is blind to)
 *   G: rename / claim-flip / website-appeared flags
 *   H: co-tenancy — street key strips plus code + name prefix, needs a street number
 *   I: guard — a pass dir whose coverage is not COMPLETE is refused
 *   J: guard — a clay*.csv inside a pass dir is refused
 *   K: brand_key collapses branches of one operator to one account
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

const SCRIPT = path.join(__dirname, '..', 'union-passes.js');
const COLS = ['place_id','business_id','name','icp_type','google_types','full_address','city','zip',
              'neighborhood','latitude','longitude','website','phone_number','rating','review_count',
              'is_claimed','verified','hours','place_link'];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'union-'));
const cell = s => { s = s == null ? '' : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

function mkPass(name, rows, { complete = true, clay = false } = {}) {
  const d = path.join(dir, name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'leads_clean.csv'),
    [COLS.join(','), ...rows.map(r => COLS.map(c => cell(r[c])).join(','))].join('\n') + '\n');
  fs.writeFileSync(path.join(d, 'coverage_report.json'), JSON.stringify({ status: complete ? 'COMPLETE' : 'INCOMPLETE' }));
  if (clay) fs.writeFileSync(path.join(d, 'clay.csv'), 'place_id\nx\n');
  return d;
}
function run(passes, out, extra = []) {
  return execFileSync(process.execPath, [SCRIPT, ...passes.flatMap(p => ['--pass', p]), '--out', out, ...extra],
    { stdio: 'pipe' }).toString();
}
const readCsv = f => {
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  const H = lines.shift().split(',');
  return lines.filter(Boolean).map(l => {
    const c = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"') { if (l[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; }
    c.push(cur);
    return Object.fromEntries(H.map((h, i) => [h, c[i] == null ? '' : c[i]]));
  });
};
const base = o => ({ latitude: '6.43', longitude: '3.42', city: 'Lagos', is_claimed: 'true', ...o });

// ---- A/B/C: union, field merge, confirmation ----
const p1 = mkPass('p1', [
  base({ place_id: 'x1', name: 'Fidelity Bank Ikoyi', icp_type: 'financial', google_types: 'Bank', full_address: 'CCH6+RWH Fidelity Bank Ikoyi, 7 Ibiyinka Olorunbe, Victoria Island, Lagos', website: '' }),
  base({ place_id: 'x2', name: 'Solo Shortlet', icp_type: 'hospitality', google_types: 'Short term apartment rental agency', full_address: 'Solo Shortlet, 7 Ibiyinka Olorunbe, Victoria Island, Lagos' }),
]);
const p2 = mkPass('p2', [
  base({ place_id: 'x1', name: 'Fidelity Bank Ikoyi', icp_type: 'corporate', google_types: 'Bank|ATM', full_address: 'CCH6+RWH Fidelity Bank Ikoyi, 7 Ibiyinka Olorunbe, Victoria Island, Lagos', website: 'fidelitybank.ng' }),
  base({ place_id: 'x3', name: 'Fidelity Bank Lekki', icp_type: 'financial', google_types: 'Bank', full_address: 'Fidelity Bank Lekki, 12 Admiralty Way, Lekki, Lagos' }),
]);
const o1 = path.join(dir, 'out1');
run([p1, p2], o1, ['--cycle', 'C1']);
const u1 = readCsv(path.join(o1, 'leads_clean_union.csv'));
const g = id => u1.find(r => r.place_id === id);

check('A: place in both passes has pass_hits 2', g('x1').pass_hits === '2');
check('A: place in one pass has pass_hits 1', g('x3').pass_hits === '1');
check('B: icp_type unions across passes', ['financial|corporate','corporate|financial'].includes(g('x1').icp_type));
check('B: google_types unions across passes', g('x1').google_types.includes('Bank') && g('x1').google_types.includes('ATM'));
check('B: empty field filled from the later, richer pass', g('x1').website === 'fidelitybank.ng');

const conf1 = readCsv(path.join(o1, 'leads_delta_confirmed.csv')).map(r => r.place_id);
const pend1 = readCsv(path.join(o1, 'leads_delta_pending.csv')).map(r => r.place_id);
check('C: 2-hit place is confirmed', conf1.includes('x1'));
check('C: single-hit places are PENDING, not dropped', pend1.includes('x2') && pend1.includes('x3'));
check('C: single-hit places are absent from confirmed', !conf1.includes('x2') && !conf1.includes('x3'));

// ---- H/K: co-tenancy + brand key ----
check('H: street key strips plus code and name prefix', g('x1').street_key === g('x2').street_key && g('x1').street_key.includes('ibiyinka'));
check('H: co-tenant count reflects the shared building', g('x1').co_tenant_count === '2');
check('H: a different street is a different building', g('x3').co_tenant_count === '1');
check('K: branches of one operator share a brand_key', g('x1').brand_key === g('x3').brand_key && g('x1').brand_key === 'fidelity bank');

// ---- D/E/F/G: second cycle against the prior union ----
const priorUnion = path.join(o1, 'leads_clean_union.csv');
const p3 = mkPass('p3', [
  // x3 was pending with 1 hit; one more hit makes cumulative 2 -> promote
  base({ place_id: 'x3', name: 'Fidelity Bank Lekki', icp_type: 'financial', google_types: 'Bank', full_address: 'Fidelity Bank Lekki, 12 Admiralty Way, Lekki, Lagos' }),
  // x1 already delivered -> must not reappear
  base({ place_id: 'x1', name: 'Fidelity Bank Ikoyi', icp_type: 'financial', google_types: 'Bank', full_address: 'CCH6+RWH Fidelity Bank Ikoyi, 7 Ibiyinka Olorunbe, Victoria Island, Lagos', website: 'fidelitybank.ng' }),
  // x2 MOVED (~1.1km) and was renamed, claimed and gained a website
  base({ place_id: 'x2', name: 'Solo Serviced Apartments', icp_type: 'hospitality', google_types: 'Short term apartment rental agency',
         full_address: 'Solo Serviced Apartments, 12 Admiralty Way, Lekki, Lagos', latitude: '6.4400', longitude: '3.4200',
         website: 'solo.ng', is_claimed: 'true' }),
]);
const o2 = path.join(dir, 'out2');
run([p3], o2, ['--cycle', 'C2', '--prior', priorUnion, '--min-hits', '2']);
const conf2 = readCsv(path.join(o2, 'leads_delta_confirmed.csv')).map(r => r.place_id);
const u2 = readCsv(path.join(o2, 'leads_clean_union.csv'));
const g2 = id => u2.find(r => r.place_id === id);
const changed = readCsv(path.join(o2, 'leads_changed.csv'));

check('D: pending place promotes on cumulative hits next cycle', conf2.includes('x3'));
check('D: promoted place keeps its original first_seen_cycle', g2('x3').first_seen_cycle === 'C1');
check('E: an already-delivered place is not re-emitted', !conf2.includes('x1'));
check('F: relocation detected on a stable place_id', (g2('x2').change_flags || '').includes('relocated'));
check('F: relocated row is written to leads_changed.csv', changed.some(r => r.place_id === 'x2'));
check('G: rename detected', (g2('x2').change_flags || '').includes('renamed'));
check('G: website_appeared detected', (g2('x2').change_flags || '').includes('website_appeared'));
check('F: a place that did not move carries no relocation flag', !(g2('x1').change_flags || '').includes('relocated'));

// ---- I/J: guards ----
const bad = mkPass('bad', [base({ place_id: 'y1', name: 'X', google_types: 'Bank', full_address: 'X, 1 A St, Lagos' })], { complete: false });
let refusedIncomplete = false;
try { run([bad], path.join(dir, 'out3')); } catch (e) { refusedIncomplete = /not COMPLETE/.test(String(e.stderr)); }
check('I: a pass dir with INCOMPLETE coverage is refused', refusedIncomplete);

const clayDir = mkPass('clayd', [base({ place_id: 'y2', name: 'X', google_types: 'Bank', full_address: 'X, 1 A St, Lagos' })], { clay: true });
let refusedClay = false;
try { run([clayDir], path.join(dir, 'out4')); } catch (e) { refusedClay = /shipped-feed filename/.test(String(e.stderr)); }
check('J: a clay*.csv inside a pass dir is refused', refusedClay);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
