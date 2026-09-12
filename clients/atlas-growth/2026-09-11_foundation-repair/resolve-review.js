#!/usr/bin/env node
/* resolve-review.js :: resolve a SERP candidate's ROLE from data already on disk.
 *
 * The review queue is people the SERP entity-matched to the right business but whose title did
 * not parse -- the LinkedIn title was "Name - Employer" with no role, or it was truncated
 * ("Robby Brown - Pinnacle Foundation Repair | P"). The role is often recoverable for free:
 *   1. the lead's own site text (already fetched) names them next to a role
 *   2. their surname is in the business name  -> owner signal, per the engine's own guardrail
 *   3. the truncated title tail still disambiguates (| P -> President)
 * Costs nothing: no SERP call, no search, no API.
 *
 * Usage: node resolve-review.js --review owner/serp_review.jsonl --site owner/site_text.jsonl
 *                               --pages owner/owner_pages.jsonl --out owner/serp_resolved.jsonl
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const REVIEW=arg('review','owner/serp_review.jsonl'), SITE=arg('site','owner/site_text.jsonl');
const PAGES=arg('pages','owner/owner_pages.jsonl'), OUT=arg('out','owner/serp_resolved.jsonl');
const STILL=arg('still','owner/serp_unresolved.jsonl');

const ROLE_MAP=[
  [/\b(co-?owner)\b/i,'owner_or_partner','Co-Owner'],
  [/\b(owner|proprietor)\b/i,'owner_or_partner','Owner'],
  [/\b(co-?founder)\b/i,'owner_or_partner','Co-Founder'],
  [/\b(founder)\b/i,'owner_or_partner','Founder'],
  [/\b(president)\b/i,'owner_or_partner','President'],
  [/\b(ceo|chief executive)\b/i,'owner_or_partner','CEO'],
  [/\b(principal|partner)\b/i,'owner_or_partner','Principal'],
  [/\b(vice president|vp)\b/i,'gm','Vice President'],
  [/\b(general manager)\b/i,'gm','General Manager'],
  [/\b(operations manager)\b/i,'gm','Operations Manager'],
  [/\b(director of marketing|marketing director|marketing manager)\b/i,'marketing','Marketing Director'],
  [/\b(director of sales|sales manager)\b/i,'sales_manager','Sales Manager'],
  [/\b(office manager)\b/i,'office_manager','Office Manager'],
];
const FORMER=/\b(former|ex-|retired|previously|past)\b/i;

function load(f,key){const m=new Map();if(!fs.existsSync(f))return m;
  for(const l of fs.readFileSync(f,'utf8').split('\n')){if(!l.trim())continue;
    const o=JSON.parse(l);m.set(o[key],o);}return m;}
const site=load(SITE,'place_id'), pages=load(PAGES,'place_id');

// surname in the business name = owner signal (engine guardrail: "Varadi Zoltan DDS" -> that person)
function surnameInBiz(name,biz){
  const parts=name.split(/\s+/); const sur=parts[parts.length-1].toLowerCase();
  if(sur.length<4) return false;
  return new RegExp('\\b'+sur.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(biz||'');
}
function roleNear(text,name){
  if(!text) return null;
  const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(esc,'gi'); let m;
  while((m=re.exec(text))){
    const win=text.slice(Math.max(0,m.index-90), m.index+name.length+90);
    if(FORMER.test(win)) continue;               // do not resolve a departed exec
    for(const [rx,bucket,label] of ROLE_MAP) if(rx.test(win)) return {bucket,label,win:win.replace(/\s+/g,' ').trim()};
  }
  return null;
}
const res=[],still=[];
for(const l of fs.readFileSync(REVIEW,'utf8').split('\n')){
  if(!l.trim()) continue;
  const o=JSON.parse(l);
  const s=site.get(o.place_id), p=pages.get(o.place_id);
  const corpus=[(p&&p.status==='ok')?p.text:'', s?s.text:''].filter(Boolean).join('\n');
  const got=[];
  for(const c of o.candidates){
    if(FORMER.test(c.raw||'')) continue;
    // 1) role from the truncated title tail, 2) role from our own site text, 3) surname signal
    let r=null; for(const [rx,bucket,label] of ROLE_MAP) if(rx.test(c.roleText||'')){r={bucket,label,win:c.raw};break;}
    if(!r) r=roleNear(corpus,c.name);
    if(!r && surnameInBiz(c.name,o.business_name)) r={bucket:'owner_or_partner',label:'Owner (surname matches business name)',win:o.business_name};
    if(r) got.push({name:c.name,first_name:c.name.split(/\s+/)[0],title:r.label,role_bucket:r.bucket,
                    is_likely_owner:r.bucket==='owner_or_partner',evidence:(r.win||'').slice(0,220),
                    source:'serp+site',email:''});
  }
  const seen=new Set(); const ded=got.filter(c=>!seen.has(c.name)&&seen.add(c.name));
  if(ded.length) res.push({place_id:o.place_id,business_name:o.business_name,city:o.city,state:o.state,
                           review_count:o.review_count,brand_family:o.brand_family,contacts:ded});
  else still.push(o);
}
fs.writeFileSync(OUT,res.map(o=>JSON.stringify(o)).join('\n')+(res.length?'\n':''));
fs.writeFileSync(STILL,still.map(o=>JSON.stringify(o)).join('\n')+(still.length?'\n':''));
console.log(`resolved: ${res.length} leads (${res.reduce((s,o)=>s+o.contacts.length,0)} contacts) -> ${OUT}`);
console.log(`still unresolved: ${still.length} -> ${STILL}`);
