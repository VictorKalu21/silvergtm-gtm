#!/usr/bin/env node
/*
 * build-clay-csv.js :: assemble the Clay-ready owner-finding feed (cascade format).
 * Spine = the QUALIFIED leads file (so off-ICP/chains excluded even if SERP/site
 * data exists for them). Joins site_text.jsonl + serp_text.jsonl by place_id.
 * Emits site_text + serp_text (linkedin-first: strongest source) PLUS the full
 * lead identity (full_address, zip, neighborhood, phone, website) so the Clay
 * extraction can ENTITY-MATCH the person to THIS business. Cells kept < Clay's 8KB.
 *
 * Usage: node build-clay-csv.js --leads <qualified.csv> --dir <owner out dir> --out <csv path> [--no-prompt-ok]
 *
 * GATE: refuses to build unless a per-vertical owner-prompt.md sits next to the output
 * clay.csv (SKILL STEP 6a). The owner prompt is what makes the Clay extraction target the
 * RIGHT decision-maker for the trade; without it a list is un-actionable. Bypass with
 * --no-prompt-ok only for a deliberate prompt-less build.
 */
const fs = require('fs');
const path = require('path');
function arg(n, d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const has=n=>process.argv.includes('--'+n);
const LEADS=arg('leads'), DIR=arg('dir'), OUT=arg('out');
if(!LEADS||!DIR||!OUT){console.error('ERROR: --leads, --dir and --out required');process.exit(1);}

// --- per-vertical owner-prompt gate (SKILL STEP 6a) ---
const PROMPT_PATH=path.join(path.dirname(path.resolve(OUT)),'owner-prompt.md');
if(!has('no-prompt-ok') && !fs.existsSync(PROMPT_PATH)){
  console.error('\nERROR: per-vertical owner-prompt.md required before building clay.csv.');
  console.error('  expected at: '+PROMPT_PATH);
  console.error('  REUSE FIRST: if <client>/owner-prompts/<vertical>.md exists, copy it here');
  console.error('    cp <client>/owner-prompts/<vertical>.md '+PROMPT_PATH);
  console.error('  ELSE build it once from owner-prompt.template.md (SKILL STEP 6a): reason the');
  console.error('  KEEP/EXCLUDE roles for THIS trade, run the PER-VERTICAL CHECKLIST, save to');
  console.error('  BOTH the library and here. A wrong owner is worse than no owner.');
  console.error('  (Deliberate prompt-less build: pass --no-prompt-ok.)\n');
  process.exit(1);
}
const J=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
// UTF-8-safe byte cap — trimSite/combineSerp cap by CHARS/partial-bytes, but multi-byte text can still
// exceed Clay's 8KB per-cell limit. Hard-cap every text cell < 8192B so uploads never truncate/fail.
const CELL_CAP=8000;
function capBytes(str,max){let b=Buffer.from(str||'','utf8');if(b.length<=max)return str||'';b=b.slice(0,max);let s=b.toString('utf8');if(s.endsWith('�'))s=s.slice(0,-1);return s;}

const CUE=/(owner|founder|principal|president|\bceo\b|general manager|\bgm\b|managing|partner|proprietor|meet (the|our)|our team|our staff|office manager|sales manager|marketing|founded|established\s*\d{4}|since\s*\d{4}|family.owned|family.run)/i;
function trimSite(rec){
  let full='';
  if(Array.isArray(rec.pages)&&rec.pages.length){
    const nonHome=rec.pages.filter(p=>p.label!=='home').map(p=>p.text).join('\n');
    const home=(rec.pages.find(p=>p.label==='home')||{}).text||'';
    full=(nonHome+'\n'+home).trim();
  } else full=(rec.text||'').trim();
  if(!full)return '';
  const lines=[...new Set(full.split('\n').map(s=>s.trim()).filter(Boolean))];
  let st=lines.filter(l=>CUE.test(l)).join('\n').slice(0,4500);
  if(st.length<6500)st+='\n--- more ---\n'+full.slice(0,6500-st.length);
  return st.slice(0,7200).trim()||full.slice(0,7200);
}

const site=new Map(J(path.join(DIR,'site_text.jsonl')).map(s=>[s.place_id,s]));
const serp=new Map(J(path.join(DIR,'serp_text.jsonl')).map(s=>[s.place_id,s]));
const ch=new Map(J(path.join(DIR,'companies_house.jsonl')).map(s=>[s.place_id,s])); // authoritative UK directors (optional source)

// build combined serp_text: linkedin (strongest) -> biased -> broad, capped < 8KB
function combineSerp(s){
  if(!s)return '';
  const parts=[];
  if((s.linkedin_text||'').trim())parts.push('=== LINKEDIN ===\n'+s.linkedin_text.trim());
  if((s.biased_text||'').trim())parts.push('=== WEB (owner/GM biased) ===\n'+s.biased_text.trim());
  if((s.broad_text||'').trim())parts.push('=== WEB (broad) ===\n'+s.broad_text.trim());
  let out='';for(const p of parts){if(Buffer.byteLength(out+'\n\n'+p,'utf8')>7800)break;out+=(out?'\n\n':'')+p;}
  return out;
}

const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);const H=rows.shift();
const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
// identity + outreach/personalisation metadata + enrichment text. review_count/rating/google_types
// are carried for personalisation ({{review_count}}) and segmentation; text blobs stay last (8KB cap).
const cols=['place_id','business_name','icp_type','google_types','full_address','zip','neighborhood','city','phone','website','emails','rating','review_count','place_link','ch_company','ch_directors','site_text','serp_text'];
const out=[cols.join(',')];
let maxSite=0,maxSerp=0,withSerp=0,withSite=0;
for(const l of leads){
  const s=site.get(l.place_id), sp=serp.get(l.place_id);
  const st=capBytes(s?trimSite(s):'',CELL_CAP);
  const spt=capBytes(combineSerp(sp),CELL_CAP);
  if(st)withSite++; if(spt)withSerp++;
  maxSite=Math.max(maxSite,Buffer.byteLength(st,'utf8'));maxSerp=Math.max(maxSerp,Buffer.byteLength(spt,'utf8'));
  const c=ch.get(l.place_id);
  const chOff=(c&&c.matched&&Array.isArray(c.officers))?c.officers:[];
  const chDirectors=chOff.map(d=>d.name+' ('+d.role+(d.likely_principal?', principal':'')+(d.occupation?('; '+d.occupation):'')+')').join('; ');
  const chCompany=(c&&c.matched)?(c.ch_company||''):'';
  const row={place_id:l.place_id,business_name:l.name,icp_type:l.icp_type,google_types:l.google_types,full_address:l.full_address,zip:l.zip,neighborhood:l.neighborhood,city:l.city,phone:l.phone_number,website:l.website,emails:(s&&s.emails?(Array.isArray(s.emails)?s.emails.join('; '):s.emails):''),rating:l.rating,review_count:l.review_count,place_link:l.place_link,ch_company:chCompany,ch_directors:chDirectors,site_text:st,serp_text:spt};
  out.push(cols.map(c=>esc(row[c])).join(','));
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`wrote ${leads.length} rows -> ${OUT}`);
console.log(`  with site_text: ${withSite} | with serp_text: ${withSerp}`);
console.log(`  max site_text ${maxSite}B | max serp_text ${maxSerp}B (hard-capped < ${CELL_CAP}B for Clay 8KB limit)`);
