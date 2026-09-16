#!/usr/bin/env node
/* bank-missed.js :: bank owners recovered from site text that the earlier passes never persisted.
 * Input lines: <index into missed_site_owners.json>|<name>|<title>|<role_bucket>|<evidence>
 * Index -> place_id, so no id is hand-typed. */
const fs=require('fs');
const M=JSON.parse(fs.readFileSync('owner/missed_site_owners.json','utf8'));
const OUT='owner/site_recovered.jsonl';
const B=new Set(['owner_or_partner','gm','marketing','sales_manager','office_manager','other']);
let buf='';process.stdin.on('data',d=>buf+=d).on('end',()=>{
  const by=new Map();let bad=0;
  for(const line of buf.split('\n')){
    const s=line.trim(); if(!s||s.startsWith('#'))continue;
    const p=s.split('|').map(x=>x.trim()); const i=parseInt(p[0],10)-1;
    if(!(i>=0&&i<M.length)){console.error('BAD INDEX: '+s);bad++;continue;}
    if(!B.has(p[3])){console.error('BAD BUCKET: '+s);bad++;continue;}
    const l=M[i];
    if(!by.has(l.place_id)) by.set(l.place_id,{place_id:l.place_id,business_name:l.name,city:l.city,contacts:[]});
    by.get(l.place_id).contacts.push({name:p[1],first_name:p[1].split(/\s+/)[0],title:p[2],
      role_bucket:p[3],is_likely_owner:p[3]==='owner_or_partner',evidence:(p[4]||'').slice(0,200),
      source:'website_sitetext',email:''});
  }
  const r=[...by.values()];
  fs.appendFileSync(OUT,r.map(o=>JSON.stringify(o)).join('\n')+'\n');
  console.log(`recovered ${r.length} leads / ${r.reduce((s,o)=>s+o.contacts.length,0)} contacts -> ${OUT} | bad: ${bad}`);
});
