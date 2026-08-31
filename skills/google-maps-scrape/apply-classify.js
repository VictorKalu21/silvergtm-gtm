#!/usr/bin/env node
/* apply-classify.js :: merge business_type onto recovered leads.
 * Usage: node apply-classify.js --leads <leads_recovered.csv> --llm-out <classify/out> --out <leads_classified.csv>
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),LLM=arg('llm-out'),OUT=arg('out');
if(!LEADS||!LLM||!OUT){console.error('ERROR: --leads --llm-out --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const bt=new Map(), conf=new Map();
for(const f of fs.readdirSync(LLM).filter(f=>f.endsWith('.json'))){try{for(const o of JSON.parse(fs.readFileSync(path.join(LLM,f),'utf8').replace(/^﻿/,'').trim())){if(o.place_id&&o.business_type){bt.set(o.place_id,o.business_type);conf.set(o.place_id,o.confidence||'');}}}catch(e){console.error('WARN bad json '+f);}}
const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
const OH=[...H,'business_type','business_type_confidence'];
const out=[OH.map(esc).join(',')]; let labeled=0, miss=0;
for(const r of rows){
  while(r.length<H.length)r.push('');
  const pid=r[ix.place_id];
  const v=bt.get(pid)||'commercial security company'; if(bt.has(pid))labeled++;else miss++;
  out.push([...r,v,conf.get(pid)||(bt.has(pid)?'':'fallback')].map(esc).join(','));
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`rows: ${rows.length} | labeled by LLM: ${labeled} | fallback-generic: ${miss}`);
console.log(`-> ${OUT}`);
