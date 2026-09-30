#!/usr/bin/env node
/* bank-sweep.js :: append contacts found by the parallel WebSearch sweep.
 * Input on stdin, one line per contact, pipe-delimited:
 *   <queue_index>|<full name>|<title>|<role_bucket>|<evidence>
 * A line with name "-" records the lead as swept-but-empty so it is not retried blindly.
 * Resolves queue_index -> place_id from owner/sweep_queue.csv so no place_id is ever hand-typed
 * (a fabricated id was a real bug earlier in this run).
 * Usage: node bank-sweep.js [--queue owner/sweep_queue.csv] [--out owner/sweep.jsonl]
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const Q=arg('queue','owner/sweep_queue.csv'), OUT=arg('out','owner/sweep.jsonl');
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
 else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}
 if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
const rows=parseCsv(fs.readFileSync(Q,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
const BUCKETS=new Set(['owner_or_partner','gm','marketing','sales_manager','office_manager','other']);
let buf='';process.stdin.on('data',d=>buf+=d).on('end',()=>{
  const byLead=new Map(); let empty=0,bad=0;
  for(const line of buf.split('\n')){
    const s=line.trim(); if(!s||s.startsWith('#')) continue;
    const p=s.split('|').map(x=>x.trim());
    const idx=parseInt(p[0],10)-1;
    if(!(idx>=0&&idx<leads.length)){console.error('BAD INDEX: '+s);bad++;continue;}
    const l=leads[idx];
    if(!byLead.has(l.place_id)) byLead.set(l.place_id,{place_id:l.place_id,business_name:l.name,
      city:l.city,state:l.state,review_count:l.review_count,brand_family:l.brand_family,contacts:[]});
    if(p[1]==='-'){empty++;continue;}
    if(!BUCKETS.has(p[3])){console.error('BAD BUCKET "'+p[3]+'": '+s);bad++;continue;}
    byLead.get(l.place_id).contacts.push({name:p[1],first_name:p[1].split(/\s+/)[0],title:p[2],
      role_bucket:p[3],is_likely_owner:p[3]==='owner_or_partner',evidence:(p[4]||'').slice(0,240),
      source:'websearch_bbb',email:''});
  }
  const recs=[...byLead.values()];
  fs.appendFileSync(OUT,recs.map(o=>JSON.stringify(o)).join('\n')+'\n');
  const withc=recs.filter(o=>o.contacts.length).length;
  console.log(`banked ${recs.length} leads (${withc} with contacts, ${recs.length-withc} empty) | ${recs.reduce((s,o)=>s+o.contacts.length,0)} contacts | bad lines: ${bad}`);
  const tot=fs.readFileSync(OUT,'utf8').split('\n').filter(Boolean).length;
  console.log(`sweep.jsonl now holds ${tot} leads`);
});
