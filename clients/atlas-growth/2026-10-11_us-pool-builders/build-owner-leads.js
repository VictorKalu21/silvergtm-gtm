#!/usr/bin/env node
/* build-owner-leads.js :: STEP 6 inputs for the Qualified set. Reads deliverable/pool_builders_qualified.csv
 * (the deduped Qualified rows) + leads_annotated.csv (neighborhood) + owner/site_text.jsonl + domain_siblings.json.
 * Writes owner/leads_icp.csv (prep-owner-batches / prep-sweep-batches / combine-owner-contacts shape) and
 * owner/read-src/site_text.jsonl (site text for exactly those leads, branch rows fanned from their brand site),
 * STREAMED — the full fanned file is too large for a single V8 string. Also streams the full
 * owner/site_text_fanned.jsonl for prep-classify. Usage: node build-owner-leads.js [--only-new <contacts_final.jsonl>] */
const fs = require('fs'), path = require('path'), readline = require('readline');
const R = __dirname, O = path.join(R, 'owner');
function pc(t) { const RR = []; let r = [], c = '', q = false; t = t.replace(/^﻿/, ''); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); RR.push(r); r = []; c = ''; } else if (ch === '\r') { } else c += ch; } } if (c !== '' || r.length) { r.push(c); RR.push(r); } return RR; }
const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function table(f) { const rows = pc(fs.readFileSync(f, 'utf8')).filter(r => r.length > 1); const H = rows.shift(); return rows.map(r => Object.fromEntries(H.map((h, i) => [h, r[i] ?? '']))); }
const qual = table(path.join(R, 'deliverable', 'pool_builders_qualified.csv'));
const ann = new Map(table(path.join(R, 'leads_annotated.csv')).map(r => [r.place_id, r]));
const H = ['place_id', 'name', 'full_address', 'city', 'state', 'zip', 'neighborhood', 'website', 'phone_number', 'brand_family', 'root_domain', 'rep_place_id'];
const out = [H.join(',')];
const want = new Set();
for (const q of qual) { const a = ann.get(q.place_id) || {}; want.add(q.place_id);
  out.push([q.place_id, q.company_name, q.full_address, q.city, q.state, q.zip, a.neighborhood || '', q.website, q.phone || a.phone_number || '', q.brand_family, a.root_domain || '', a.rep_place_id || ''].map(esc).join(',')); }
fs.writeFileSync(path.join(O, 'leads_icp.csv'), out.join('\n') + '\n');
console.log('leads_icp.csv:', qual.length, 'Qualified leads');
// siblings: sibling place_id -> representative place_id
const sj = JSON.parse(fs.readFileSync(path.join(R, 'domain_siblings.json'), 'utf8')); const sib = new Map();
if (sj.reps) { for (const [rep, v] of Object.entries(sj.reps)) for (const s of (v.siblings || [])) sib.set(s, rep); } else for (const [s, rep] of Object.entries(sj)) sib.set(s, rep);
const needRep = new Map(); // rep -> [sibling ids we want]
for (const pid of want) { const rep = sib.get(pid); if (rep && rep !== pid) { if (!needRep.has(rep)) needRep.set(rep, []); needRep.get(rep).push(pid); } }
(async () => {
  fs.mkdirSync(path.join(O, 'read-src'), { recursive: true });
  const wRead = fs.createWriteStream(path.join(O, 'read-src', 'site_text.jsonl'));
  const wFan = fs.createWriteStream(path.join(O, 'site_text_fanned.jsonl'));
  const seen = new Set(); let n = 0, direct = 0, fanned = 0, fanAll = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(O, 'site_text.jsonl')), crlfDelay: Infinity });
  const fanTargets = new Map(); // rep -> all siblings (for the full fanned file)
  for (const [s, rep] of sib) { if (!fanTargets.has(rep)) fanTargets.set(rep, []); fanTargets.get(rep).push(s); }
  const pending = []; // lines for full fan file need to know which ids exist first: do two passes
  const exists = new Set();
  for await (const l of rl) { if (!l.trim()) continue; let o; try { o = JSON.parse(l); } catch { continue; } exists.add(o.place_id); n++;
    if (want.has(o.place_id)) { wRead.write(l + '\n'); seen.add(o.place_id); direct++; }
    for (const s of (needRep.get(o.place_id) || [])) { if (!seen.has(s) && !exists.has(s)) { wRead.write(JSON.stringify({ ...o, place_id: s, fanned_from: o.place_id }) + '\n'); seen.add(s); fanned++; } }
  }
  // second pass for the full fanned file (prep-classify wave 2): copy every record, then fan to siblings not present
  const rl2 = readline.createInterface({ input: fs.createReadStream(path.join(O, 'site_text.jsonl')), crlfDelay: Infinity });
  for await (const l of rl2) { if (!l.trim()) continue; let o; try { o = JSON.parse(l); } catch { continue; } wFan.write(l + '\n');
    for (const s of (fanTargets.get(o.place_id) || [])) if (!exists.has(s)) { wFan.write(JSON.stringify({ ...o, place_id: s, fanned_from: o.place_id }) + '\n'); fanAll++; } }
  await new Promise(r => wRead.end(r)); await new Promise(r => wFan.end(r));
  // the sibling rows whose representative is also wanted may have been written before the rep line was seen: fine (set-guarded).
  console.log(`site_text.jsonl ${n} records | read-src: ${direct} direct + ${fanned} fanned = ${seen.size} of ${want.size} Qualified have text | site_text_fanned.jsonl: +${fanAll} fanned`);
})();
