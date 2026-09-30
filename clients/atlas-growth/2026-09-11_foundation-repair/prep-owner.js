#!/usr/bin/env node
/* prep-owner.js :: build owner-extraction batches from site_text ALONE (no SERP, no API).
 * Tier 1 of owner finding: site text is already on disk and already paid for, so this is free.
 *
 * Page-priority, not regex windowing. fetch-sites.js already stores each page separately with
 * its URL, so the owner page can be SELECTED rather than hunted for in a concatenated blob.
 * (An earlier windowing version scored role-word spans and lost "Darren Crotchett President"
 * to top-of-page nav that matched the same regex — ranking spans is the wrong tool when the
 * page boundary is already known.) Homepage goes last: it is mostly nav and sales copy.
 *
 * Usage: node prep-owner.js --leads leads_icp.csv --site owner/site_text.jsonl \
 *                           --out owner/batches [--per 15] [--chars 1800]
 */
const fs=require('fs'),path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads','leads_icp.csv'), SITE=arg('site','owner/site_text.jsonl');
const OUT=arg('out','owner/batches'), PER=parseInt(arg('per','15'),10), CH=parseInt(arg('chars','2200'),10);

// URL-path priority: the more specific the owner signal in the path, the earlier we spend budget.
const PRIO=[
  [/meet[-_/]?the[-_/]?(owner|team|staff|crew)|meet[-_/]?our|our[-_/]?(owner|team|family|story)|leadership|management[-_/]?team/i, 0],
  [/\bowner|founder|principal|president/i, 1],
  [/about[-_/]?us|\babout\b|who[-_/]?we[-_/]?are|\bteam\b|\bstaff\b|our[-_/]?story|\bstory\b/i, 2],
  [/contact/i, 3],
];
function prio(url,label){
  const s=(url||'')+' '+(label||'');
  for(const [re,p] of PRIO) if(re.test(s)) return p;
  return 8;
}
/* Boilerplate stripping, keyword-free: a site's nav and footer are IDENTICAL on every page,
 * so the shared prefix/suffix across this lead's own pages IS the chrome. Keyword lists can't
 * catch nav made of service names ("Concrete Leveling Basement Floor Leveling Driveway ...")
 * which is exactly what buried "Darren Crotchett President" 1.4k chars into his own owner page. */
function commonPrefix(a,b){let i=0;const n=Math.min(a.length,b.length);while(i<n&&a[i]===b[i])i++;return i;}
function commonSuffix(a,b){let i=0;const n=Math.min(a.length,b.length);while(i<n&&a[a.length-1-i]===b[b.length-1-i])i++;return i;}
function stripChrome(texts){
  if(texts.length<2) return texts;
  let pre=texts[0].length, suf=texts[0].length;
  for(let i=1;i<texts.length;i++){ pre=Math.min(pre,commonPrefix(texts[0],texts[i])); suf=Math.min(suf,commonSuffix(texts[0],texts[i])); }
  if(pre<60) pre=0;                       // too short to be nav; leave it alone
  if(suf<60) suf=0;
  return texts.map(t=>{ const end=Math.max(pre,t.length-suf); return (pre<t.length? t.slice(pre,end):t).trim(); });
}
// strip the nav/chrome that leads every page so the budget buys prose, not menus
function denav(t){
  return (t||'')
    .replace(/\b(Skip to (main )?(content|navigation|footer)|Toggle (Navigation|Menu)|Open Menu|Close Menu|Use tab to navigate through the menu items\.?)\b/gi,' ')
    .replace(/&(amp|nbsp|rsquo|ldquo|rdquo|middot|times|mdash|ndash|rarr|x27|#x27|#x61);/gi,' ')
    .replace(/\s+/g,' ').trim();
}
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
 else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}
 if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}

const site=new Map();
for(const l of fs.readFileSync(SITE,'utf8').split('\n')){ if(!l.trim())continue;
  const o=JSON.parse(l); site.set(o.place_id,o); }
const rows=parseCsv(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));

fs.mkdirSync(OUT,{recursive:true});
let n=0,b=[],bi=0,withsig=0,ownerpage=0;
const flush=()=>{ if(!b.length)return;
  fs.writeFileSync(path.join(OUT,`owner_${String(bi).padStart(3,'0')}.jsonl`),b.map(x=>JSON.stringify(x)).join('\n')+'\n');
  bi++; b=[]; };
for(const l of leads){
  const s=site.get(l.place_id)||{};
  const pages=(s.pages||[]).map(p=>({...p,p:prio(p.url,p.label)}))
                           .sort((a,b)=>a.p-b.p||(b.text||'').length-(a.text||'').length);
  if(pages.length&&pages[0].p<=1) ownerpage++;
  const cleaned=stripChrome(pages.map(pg=>denav(pg.text)));
  let ev='',used=0;
  for(let pi=0;pi<pages.length;pi++){
    const pg=pages[pi];
    if(used>=CH) break;
    const t=cleaned[pi]; if(!t) continue;
    const head=`[${pg.p<=1?'OWNER-PAGE':pg.p===2?'ABOUT':'PAGE'} ${pg.url}] `;
    const piece=(head+t).slice(0,CH-used);
    ev+=(ev?'\n':'')+piece; used=ev.length;
  }
  if(!ev) ev=denav(s.text||'').slice(0,CH);
  if(ev) withsig++;
  b.push({place_id:l.place_id,name:l.name,city:l.city,full_address:l.full_address,
          website:l.website,brand_family:l.brand_family||'',
          emails:(s.emails||[]).slice(0,3),evidence:ev});
  n++; if(b.length>=PER) flush();
}
flush();
console.log(`${n} leads -> ${bi} batches of ${PER} in ${OUT}/`);
console.log(`  with evidence: ${withsig} | blank: ${n-withsig} | have a dedicated owner/team page: ${ownerpage}`);
