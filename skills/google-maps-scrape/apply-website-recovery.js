#!/usr/bin/env node
/* apply-website-recovery.js :: merge website_final = website || emaildomain || llm_pick; drop siteless.
 * Usage: node apply-website-recovery.js --leads <leads_city.csv> --emaildomain <recovery/resolved_emaildomain.csv> \
 *          --llm-out <recovery/out> --out <leads_recovered.csv> --dropped <dropped_no_site.csv>
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),ED=arg('emaildomain'),LLM=arg('llm-out'),OUT=arg('out'),DROP=arg('dropped');
if(!LEADS||!OUT){console.error('ERROR: --leads --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const norm=h=>h?('https://'+String(h).replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'')):'';
const rec=new Map(), src=new Map();
if(ED&&fs.existsSync(ED)){const rows=pc(fs.readFileSync(ED,'utf8')).filter(r=>r.length>1);const h=rows.shift();const i=Object.fromEntries(h.map((x,j)=>[x,j]));for(const r of rows){if(r[i.place_id]&&r[i.website]){rec.set(r[i.place_id],norm(r[i.website]));src.set(r[i.place_id],'emaildomain');}}}
if(LLM&&fs.existsSync(LLM))for(const f of fs.readdirSync(LLM).filter(f=>f.endsWith('.json'))){try{for(const o of JSON.parse(fs.readFileSync(path.join(LLM,f),'utf8').replace(/^﻿/,'').trim())){if(o.website&&!rec.has(o.place_id)){rec.set(o.place_id,norm(o.website));src.set(o.place_id,'llm');}}}catch(e){console.error('WARN bad json '+f);}}

const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
const OH=[...H,'website_final','website_source'];
const kept=[OH.map(esc).join(',')], dropped=[OH.map(esc).join(',')];
let hadSite=0, recov=0, drop=0;
for(const r of rows){
  while(r.length<H.length)r.push('');
  const cur=String(r[ix.website]||'').trim();
  let wf=cur, s='maps';
  if(cur){hadSite++;}
  else if(rec.has(r[ix.place_id])){wf=rec.get(r[ix.place_id]);s=src.get(r[ix.place_id]);recov++;}
  else {wf='';s='';}
  const row=[...r,wf,s];
  if(wf) kept.push(row.map(esc).join(','));
  else {dropped.push(row.map(esc).join(','));drop++;}
}
fs.writeFileSync(OUT,kept.join('\n')+'\n');
if(DROP)fs.writeFileSync(DROP,dropped.join('\n')+'\n');
console.log(`kept: ${kept.length-1} (had Maps site: ${hadSite}, recovered: ${recov}) | DROPPED no site: ${drop}`);
console.log(`-> ${OUT}${DROP?'  + '+DROP:''}`);
