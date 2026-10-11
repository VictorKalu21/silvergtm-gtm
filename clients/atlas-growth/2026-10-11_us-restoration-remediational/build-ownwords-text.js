#!/usr/bin/env node
/* build-ownwords-text.js — job-side: turn the directory's own profile description (own_words column, written by the
 * business on its Google profile) into a site_text-shaped jsonl so prep-classify.js (--site2) can classify rows whose
 * website fetch failed or that have no website at all. Rows WITH fetched site text are untouched (prep-classify
 * prefers --site over --site2 by load order: --site2 only fills place_ids --site lacks).
 * Usage: node build-ownwords-text.js --leads <leads_annotated.csv> --out <owner/ownwords_text.jsonl> */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),OUT=arg('out'); if(!LEADS||!OUT){console.error('--leads --out required');process.exit(1);}
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
const rows=parseCsv(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
let n=0;const out=[];
for(const r of rows){const t=(r[ix.own_words]||'').trim();if(t.length<40)continue;
  out.push(JSON.stringify({place_id:r[ix.place_id],status:'ok',source:'directory_profile',text:'[Google profile description, written by the business] '+t,pages:[{label:'home',url:r[ix.directory_url]||'',text:'[Google profile description, written by the business] '+t}]}));n++;}
fs.writeFileSync(OUT,out.join('\n')+'\n');console.log(`ownwords_text.jsonl: ${n} rows with a profile description -> ${OUT}`);
