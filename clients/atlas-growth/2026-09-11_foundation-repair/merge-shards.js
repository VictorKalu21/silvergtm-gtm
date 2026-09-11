#!/usr/bin/env node
/* Merge the 8 shard outputs into one run-level list.
 * Round-robin sharding puts the same business in several shards (different category queries hit it),
 * so cross-shard overlap is expected and removed here on place_id — unioning google_types and
 * icp_type across every cell that hit the record, exactly as scrape.js does within a shard.
 * Also rolls the per-shard coverage_report.json up into one coverage_summary.json: that file, not a
 * row count, is the source of truth for whether the footprint was actually covered.
 */
const fs = require('fs'), path = require('path');
const RUN = __dirname, N = 8;
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
// MUST rejoin with '|' — scrape.js:196 joins google_types/icp_type with '|', and qualify-leads.js
// derives the PRIMARY type as google_types.split('|')[0]. Rejoining with any other separator makes
// that split return the WHOLE string, silently converting the primary-only `deny` into an any-match
// deny and dropping real ICP firms that carry an off-ICP secondary tag. Cost a full re-qualify once.
const SEP='|';
const uniq=s=>[...new Set(String(s||'').split(/\s*[;|]\s*/).filter(Boolean))];

let HEAD=null; const rows=new Map(); const perShard=[]; let dupes=0;
for(let i=0;i<N;i++){
  const f=path.join(RUN,`shard-${i}`,'leads_clean.csv');
  if(!fs.existsSync(f)){perShard.push({shard:i,rows:0,missing:true});continue;}
  const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1); const H=R.shift();
  if(!HEAD)HEAD=H;
  let n=0;
  for(const r of R){
    const o=Object.fromEntries(HEAD.map((h,j)=>[h,r[j]==null?'':r[j]]));
    const pid=(o.place_id||'').trim(); if(!pid)continue; n++;
    const prev=rows.get(pid);
    if(!prev){rows.set(pid,o);}
    else{ dupes++;
      prev.google_types=uniq(prev.google_types+SEP+o.google_types).join(SEP);
      prev.icp_type   =uniq(prev.icp_type   +SEP+o.icp_type   ).join(SEP);
      if(!prev.website&&o.website)prev.website=o.website;           // keep the richer record
      if(!prev.phone_number&&o.phone_number)prev.phone_number=o.phone_number;
    }
  }
  const cov=path.join(RUN,`shard-${i}`,'coverage_report.json');
  perShard.push({shard:i,rows:n,coverage:fs.existsSync(cov)?JSON.parse(fs.readFileSync(cov,'utf8')):null});
}
if(!HEAD){console.error('ERROR: no shard produced leads_clean.csv');process.exit(1);}
const out=[HEAD.map(esc).join(','),...[...rows.values()].map(o=>HEAD.map(h=>esc(o[h])).join(','))];
fs.writeFileSync(path.join(RUN,'leads_clean.csv'),out.join('\n')+'\n');

// excluded.csv concat (closed / out-of-footprint from the scrape stage)
let exHead=null; const exRows=[];
for(let i=0;i<N;i++){const f=path.join(RUN,`shard-${i}`,'excluded.csv');if(!fs.existsSync(f))continue;
  const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();if(!exHead)exHead=H;exRows.push(...R);}
if(exHead)fs.writeFileSync(path.join(RUN,'excluded.csv'),[exHead.map(esc).join(','),...exRows.map(r=>r.map(esc).join(','))].join('\n')+'\n');

const incomplete=perShard.filter(s=>s.missing||!s.coverage||s.coverage.status!=='COMPLETE');
const summary={shards:perShard.map(s=>({shard:s.shard,rows:s.rows,status:s.missing?'MISSING':(s.coverage&&s.coverage.status)||'UNKNOWN'})),
  raw_rows:perShard.reduce((a,s)=>a+(s.rows||0),0),unique_place_ids:rows.size,cross_shard_dupes:dupes,
  incomplete_shards:incomplete.map(s=>s.shard),all_complete:incomplete.length===0};
fs.writeFileSync(path.join(RUN,'coverage_summary.json'),JSON.stringify(summary,null,2));
console.log(`merged ${summary.raw_rows} shard rows -> ${rows.size} unique place_ids (${dupes} cross-shard dupes removed)`);
console.log(`shards: ${summary.shards.map(s=>s.shard+'='+s.status+'('+s.rows+')').join(' ')}`);
console.log(summary.all_complete?'ALL SHARDS COMPLETE':`INCOMPLETE SHARDS: ${summary.incomplete_shards.join(',')} — do not proceed`);
