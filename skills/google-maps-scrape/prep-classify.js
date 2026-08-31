#!/usr/bin/env node
/* prep-classify.js :: build classify batches (services-preferred ~2.5k slice per lead).
 * Usage: node prep-classify.js --leads <leads_recovered.csv> --site <owner/site_text.jsonl> \
 *          --site2 <owner_recovered/site_text.jsonl> --serp <owner/serp_text.jsonl> --out <classify_dir> [--batch 60] [--cap 2500]
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),SITE=arg('site'),SITE2=arg('site2'),SERP=arg('serp'),OUT=arg('out'),BATCH=parseInt(arg('batch','60'),10),CAP=parseInt(arg('cap','2500'),10);
if(!LEADS||!OUT){console.error('ERROR: --leads --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
function loadSite(f,m){if(!f||!fs.existsSync(f))return;for(const ln of fs.readFileSync(f,'utf8').trim().split(/\r?\n/).filter(Boolean)){try{const o=JSON.parse(ln);if(o.text)m.set(o.place_id,o);}catch{}}}
function sliceFor(rec,cap){
  if(!rec)return '';
  const pages=rec.pages||[];
  const svc=pages.find(p=>/serv|solution|what-we-do|capab|industr|commercial/i.test((p.label||'')+' '+(p.url||'')));
  const home=pages.find(p=>p.label==='home');
  let txt='';
  if(svc) txt+=svc.text+'\n';
  if(home) txt+=home.text+'\n';
  if(!txt) txt=rec.text||'';
  return txt.replace(/\s+/g,' ').trim().slice(0,cap);
}
const site=new Map(); loadSite(SITE,site); loadSite(SITE2,site);
const serp=new Map(); if(SERP&&fs.existsSync(SERP))for(const ln of fs.readFileSync(SERP,'utf8').trim().split(/\r?\n/).filter(Boolean)){try{const o=JSON.parse(ln);serp.set(o.place_id,(o.biased_text||'').replace(/\s+/g,' ').slice(0,1200));}catch{}}

const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
fs.mkdirSync(OUT,{recursive:true});
const recs=rows.map(r=>{
  const pid=r[ix.place_id];
  let text=sliceFor(site.get(pid),CAP);
  let from='site';
  if(!text){text=serp.get(pid)||'';from='serp';}
  return {place_id:pid, name:r[ix.name], city:String(r[ix.city]||''), google_types:r[ix.google_types]||'', source:from, text};
});
let bi=0;
for(let i=0;i<recs.length;i+=BATCH){fs.writeFileSync(path.join(OUT,`batch_${String(bi).padStart(3,'0')}.jsonl`),recs.slice(i,i+BATCH).map(o=>JSON.stringify(o)).join('\n')+'\n');bi++;}
const noText=recs.filter(r=>!r.text).length;
console.log(`leads: ${recs.length} | batches: ${bi} | from site: ${recs.filter(r=>r.source==='site').length} | from serp: ${recs.filter(r=>r.source==='serp').length} | NO text: ${noText}`);
console.log(`-> ${OUT}`);
