#!/usr/bin/env node
/* RUN-PLAN 4.3 pass 2 prep: isolate the TN/FL rows and build the border-metro runsheet.
 *
 * WHY two passes. The footprint is 10 states PLUS three border metros (Memphis, Chattanooga,
 * Jacksonville) that serve it from outside. Adding TN and FL to --regions is the only way the gate
 * will keep those rows, but that single flag also admits ALL of Tennessee and ALL of Florida —
 * Nashville, Miami, Tampa, Orlando. So pass 1 keeps 12 states with the hub gate OFF (foundation
 * service-area businesses legitimately sit far from anchors in KS/MS), then this script peels off
 * the TN/FL subset and pass 2 re-gates ONLY those rows with the hub gate ON at 1.0 deg against ONLY
 * the three border tiles. Net effect: the 10 states keep everything in-state; TN/FL keep only what
 * is genuinely in a border metro.
 *
 * Usage: node split-tnfl.js --in <leads_clean_qualified_infootprint.csv> --runsheet <runsheet.csv> --out <dir>
 */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const IN = arg('in'), RUNSHEET = arg('runsheet'), OUT = arg('out', __dirname);
if (!IN || !RUNSHEET) { console.error('ERROR: --in and --runsheet required'); process.exit(1); }
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const BORDER = new Set(['tn-memphis','tn-chattanooga','fl-jacksonville','tn-memphis-bartlett','fl-jax-orange-park']);
const STATE = /,\s*([A-Z]{2})\b/;

const rows = pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1); const H = rows.shift();
const iCity = H.indexOf('city'), iAddr = H.indexOf('full_address');
const stOf = r => { const m = (r[iCity]||'').match(STATE) || (r[iAddr]||'').match(STATE); return m ? m[1].toUpperCase() : ''; };
const tnfl = [], rest = [], noState = [];
for (const r of rows) { const st = stOf(r); if (st==='TN'||st==='FL') tnfl.push(r); else { rest.push(r); if(!st) noState.push(r); } }

// border runsheet = only the tiles whose cell_id starts with a border slug (pass-2 hubs)
const rs = pc(fs.readFileSync(RUNSHEET,'utf8')).filter(r=>r.length>1); const RH = rs.shift();
const iCell = RH.indexOf('cell_id');
const seen = new Set(); const border = [];
for (const r of rs) { const slug = (r[iCell]||'').replace(/-q\d+$/,''); if (BORDER.has(slug) && !seen.has(slug)) { seen.add(slug); border.push(r); } }
if (!border.length) { console.error('ERROR: no border tiles matched — check BORDER slugs against the runsheet'); process.exit(1); }

fs.mkdirSync(OUT,{recursive:true});
const w=(f,rws)=>fs.writeFileSync(path.join(OUT,f),[H.map(esc).join(','),...rws.map(r=>r.map(esc).join(','))].join('\n')+'\n');
w('tnfl.csv', tnfl);
w('infootprint_10state.csv', rest);
fs.writeFileSync(path.join(OUT,'border-runsheet.csv'),[RH.join(','),...border.map(r=>r.join(','))].join('\n')+'\n');
console.log(`split: ${rows.length} rows -> ${rest.length} in the 10 states + ${tnfl.length} TN/FL (pass-2 candidates)`);
console.log(`border runsheet: ${border.length} tile(s) -> ${[...seen].join(', ')}`);
console.log(`rows with NO parseable state token: ${noState.length}${noState.length>rows.length*0.02?'  <-- >2% : run backfill-city.js first (RUN-PLAN 4.3)':' (under the 2% threshold, kept)'}`);
