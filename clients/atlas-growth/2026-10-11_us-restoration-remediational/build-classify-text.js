#!/usr/bin/env node
/* build-classify-text.js — job-side: one text record per representative for prep-classify.js.
 * Site text wins when it is real (>= 200 chars after whitespace collapse); otherwise the directory profile description
 * (ownwords_text.jsonl) stands in, tagged source 'directory_profile'. Thin pages (bot-check shells, 'Just a moment',
 * empty SPA) would otherwise reach the reader as a 40-char string and come back 'unclear' when a description exists.
 * Usage: node build-classify-text.js --site <owner/site_text.jsonl> --ownwords <ownwords_text.jsonl> --out <classify/text.jsonl> [--min 200] */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const SITE=arg('site'),OWN=arg('ownwords'),OUT=arg('out'),MIN=parseInt(arg('min','200'),10);
if(!SITE||!OWN||!OUT){console.error('--site --ownwords --out required');process.exit(1);}
const load=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean):[];
const own=new Map(load(OWN).map(o=>[o.place_id,o]));
const out=[];let site=0,prof=0,none=0;
for(const r of load(SITE)){
  const len=((r.text||'').replace(/\s+/g,' ').trim()).length;
  if(r.status==='ok'&&len>=MIN){out.push(JSON.stringify(r));site++;continue;}
  const o=own.get(r.place_id);
  if(o){out.push(JSON.stringify({...o,site_status:r.status,site_text_len:len}));prof++;}else none++;
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`classify text: ${out.length} records (site ${site} · directory profile ${prof}) | no text at all: ${none} -> ${OUT}`);
