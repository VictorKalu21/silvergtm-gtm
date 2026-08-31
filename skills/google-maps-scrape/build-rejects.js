#!/usr/bin/env node
/* Filter a leads CSV to the rows the Companies House pass did NOT confidently match
 * (so the SERP cascade only spends credits on the long tail).
 * Usage: node build-rejects.js --ch <companies_house.jsonl> --leads <leads.csv> --out <rejects.csv> */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const CH=arg('ch'),LEADS=arg('leads'),OUT=arg('out');
if(!CH||!LEADS||!OUT){console.error('ERROR: --ch --leads --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const matched=new Set(fs.readFileSync(CH,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.matched).map(r=>r.place_id));
const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=H.indexOf('place_id');
const keep=rows.filter(r=>!matched.has(r[ix]));
fs.writeFileSync(OUT,[H,...keep].map(r=>r.map(esc).join(',')).join('\n')+'\n');
console.log('CH-matched: '+matched.size+' | rejects (-> SERP): '+keep.length+' -> '+OUT);
