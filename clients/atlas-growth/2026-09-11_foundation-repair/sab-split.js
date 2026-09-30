#!/usr/bin/env node
/* Split the 10-state in-footprint list into rows the region gate COULD judge and address-less
 * service-area businesses it could not.
 *
 * WHY this exists. Foundation repair is full of SABs: businesses that serve a metro from a home base
 * and publish no address, so Maps returns empty `city` AND empty `full_address`. footprint-gate step 3
 * reads the state token only out of those two fields, so it keeps such rows unjudged — and pass 1 runs
 * with the hub gate OFF (correct for sparse KS/MS), so nothing geographic has gated them at all. They
 * do carry lat/lng, so the fix is a third pass: the SAME engine gate, hub gate ON, against our own
 * runsheet tiles. No new gating logic, and no edit to the engine's backfill-city-nearest-metro.js,
 * whose hub list is hardcoded to a different client's 47 metros.
 *
 * Usage: node sab-split.js --in <infootprint_10state.csv> --out <dir>
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), OUT=arg('out','.');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const ST=/,\s*([A-Z]{2})\b/;
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1); const H=rows.shift();
const iC=H.indexOf('city'), iA=H.indexOf('full_address');
const judged=[], sab=[];
for(const r of rows) (((r[iC]||'').match(ST)||(r[iA]||'').match(ST)) ? judged : sab).push(r);
const w=(f,rws)=>fs.writeFileSync(path.join(OUT,f),[H.map(esc).join(','),...rws.map(r=>r.map(esc).join(','))].join('\n')+'\n');
w('has_state.csv',judged); w('sab_nostate.csv',sab);
console.log(`${rows.length} rows -> ${judged.length} region-judged + ${sab.length} address-less SABs (need the hub-distance pass)`);
