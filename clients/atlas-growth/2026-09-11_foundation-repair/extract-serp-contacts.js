#!/usr/bin/env node
/* extract-serp-contacts.js :: turn serp_text.jsonl into scored contact candidates.
 *
 * WHY deterministic first: this endpoint returns TITLES ONLY (url always empty, description on
 * ~2-3 of 9 results). LinkedIn titles are shaped "Name - Title at Employer" / "Name - Employer",
 * which is parseable, and the employer token is what replaces the missing url for entity-matching.
 * So the cheap pass can do the bulk and only genuinely ambiguous rows need reading.
 *
 * Scoring, highest first:
 *   +100  employer token in the title matches THIS lead's business name  (entity-matched)
 *   + 40  role is in the KEEP set for this offer (owner/president/GM/marketing/sales)
 *   -100  'former', 'ex-', 'retired'  -> never output a departed exec
 *   - 60  title names a DIFFERENT company than the lead  -> the same-name bleed
 *
 * Emits: owner/serp_contacts.jsonl (accepted) and owner/serp_review.jsonl (needs a human/model read)
 * Usage: node extract-serp-contacts.js --serp owner/serp/serp_text.jsonl --leads leads_icp.csv
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const SERP=arg('serp','owner/serp/serp_text.jsonl'), LEADS=arg('leads','leads_icp.csv');
const OUT=arg('out','owner/serp_contacts.jsonl'), REVIEW=arg('review','owner/serp_review.jsonl');

const KEEP={owner:'owner_or_partner','co-owner':'owner_or_partner','co owner':'owner_or_partner',
  founder:'owner_or_partner','co-founder':'owner_or_partner',president:'owner_or_partner',
  proprietor:'owner_or_partner',principal:'owner_or_partner',partner:'owner_or_partner',
  ceo:'owner_or_partner',coo:'gm','general manager':'gm','gm':'gm','vice president':'gm',
  'operations manager':'gm','branch manager':'gm',
  'marketing manager':'marketing','marketing director':'marketing','director of marketing':'marketing',
  'sales manager':'sales_manager','director of sales':'sales_manager','office manager':'office_manager'};
const EXCLUDE=/\b(estimator|technician|installer|foreman|crew|laborer|apprentice|inspector|coordinator|receptionist|assistant|specialist|advisor|representative|rep\b|intern|driver|scheduler|dispatcher|recruiter|controller|accountant|bookkeeper)\b/i;
const FORMER=/\b(former|ex-|retired|previously|past)\b/i;
const NAME=/^([A-Z][a-z]{1,15}(?:\s+[A-Z]\.?)?\s+(?:O'|Mc|Mac|De |Van |Von |St\. )?[A-Z][a-z'\-]{1,18})(?:,\s*(?:MBA|PE|P\.E\.|CPA|LEED)[A-Za-z.\s]*)?$/;

const STOP=new Set(['foundation','repair','company','llc','inc','the','and','of','services','service','solutions','systems','basement','waterproofing','concrete','crawl','space','group','co','corp','contractors','contractor','construction','texas','tx']);
const toks=s=>(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
function employerMatch(emp,biz){
  const a=new Set(toks(emp)), b=toks(biz);
  if(!a.size||!b.length) return 0;
  const hit=b.filter(w=>a.has(w)).length;
  return hit/b.length;                        // fraction of the business's distinctive tokens present
}
function parseTitleLine(line){
  // strip the leading "N. " result index the engine's bundle() adds
  let s=line.replace(/^\s*\d+\.\s*/,'').trim();
  if(!s||/^Search query/.test(s)) return null;
  // "Name - Role at Employer" | "Name - Role" | "Name - Employer" | "Role at Employer - Name"
  let m=s.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  if(!m) return null;
  const left=m[1].trim(), right=m[2].trim();
  const nm=left.match(NAME);
  if(!nm) return null;
  let role=right, emp='';
  const at=right.match(/^(.*?)\s+at\s+(.+)$/i);
  if(at){ role=at[1].trim(); emp=at[2].trim(); } else { role=right; emp=right; }
  return {name:nm[1].trim(), roleText:role, employer:emp, raw:s};
}
function roleBucket(t){
  const l=(t||'').toLowerCase();
  for(const k of Object.keys(KEEP).sort((a,b)=>b.length-a.length)) if(l.includes(k)) return {bucket:KEEP[k],matched:k};
  return {bucket:'',matched:''};
}

const leads=new Map();
{ const t=fs.readFileSync(LEADS,'utf8'); const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
    else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  const H=rows.shift(); for(const r of rows){const o=Object.fromEntries(H.map((h,i)=>[h,r[i]])); if(o.place_id) leads.set(o.place_id,o);} }

const acc=[],rev=[];
for(const line of fs.readFileSync(SERP,'utf8').split('\n')){
  if(!line.trim()) continue;
  const r=JSON.parse(line);
  if(r.status!=='ok') continue;
  const lead=leads.get(r.place_id)||{};
  const biz=r.business_name||lead.name||'';
  const seen=new Map();
  for(const blob of [r.linkedin_text,r.biased_text,r.broad_text]){
    for(const ln of (blob||'').split('\n')){
      const p=parseTitleLine(ln); if(!p) continue;
      const {bucket,matched}=roleBucket(p.roleText);
      const em=employerMatch(p.employer,biz);
      let score=0; const why=[];
      if(em>=0.5){score+=100;why.push(`employer_match ${em.toFixed(2)}`);}
      else if(em>0){score+=40;why.push(`employer_partial ${em.toFixed(2)}`);}
      else {score-=60;why.push('employer_mismatch');}
      if(bucket){score+=40;why.push('keep_role:'+matched);}
      if(EXCLUDE.test(p.roleText)){score-=50;why.push('excluded_role');}
      if(FORMER.test(p.raw)){score-=100;why.push('FORMER');}
      const prev=seen.get(p.name);
      if(!prev||score>prev.score) seen.set(p.name,{...p,bucket,score,why});
    }
  }
  const cands=[...seen.values()].sort((a,b)=>b.score-a.score);
  const good=cands.filter(c=>c.score>=100&&c.bucket);
  const maybe=cands.filter(c=>!good.includes(c)&&c.score>=40);
  const rec={place_id:r.place_id,business_name:biz,city:r.city||lead.city||'',
             state:lead.state||'',review_count:lead.review_count||'',brand_family:lead.brand_family||''};
  if(good.length) acc.push({...rec,contacts:good.map(c=>({name:c.name,first_name:c.name.split(/\s+/)[0],
      title:c.roleText,role_bucket:c.bucket,is_likely_owner:c.bucket==='owner_or_partner',
      evidence:c.raw,source:'serp',email:'',score:c.score,why:c.why}))});
  else if(maybe.length) rev.push({...rec,candidates:maybe.slice(0,5)});
}
fs.writeFileSync(OUT,acc.map(o=>JSON.stringify(o)).join('\n')+(acc.length?'\n':''));
fs.writeFileSync(REVIEW,rev.map(o=>JSON.stringify(o)).join('\n')+(rev.length?'\n':''));
console.log(`accepted: ${acc.length} leads (${acc.reduce((s,o)=>s+o.contacts.length,0)} contacts) -> ${OUT}`);
console.log(`needs review: ${rev.length} leads -> ${REVIEW}`);
