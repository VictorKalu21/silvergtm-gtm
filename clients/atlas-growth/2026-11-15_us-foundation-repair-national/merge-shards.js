#!/usr/bin/env node
// Merge <shards>/out-*/leads_clean.csv  (usage: node merge-test-shards.js [--shards test-shards --out test])
// on place_id (first seen wins; keeps the union of icp_type/query tags).
const fs=require('fs'),path=require('path');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const dir=path.resolve(__dirname,arg('shards','test-shards'));const OUTD=path.resolve(__dirname,arg('out','test'));let H=null;const seen=new Map();let n=0;
for(const d of fs.readdirSync(dir).filter(d=>d.startsWith('out-')).sort()){
  const cov=JSON.parse(fs.readFileSync(path.join(dir,d,'coverage_report.json'),'utf8'));if(!/COMPLETE/.test(JSON.stringify(cov))||/INCOMPLETE/.test(JSON.stringify(cov)))throw new Error('shard not COMPLETE: '+d);
  const rows=pc(fs.readFileSync(path.join(dir,d,'leads_clean.csv'),'utf8')).filter(r=>r.length>1);const h=rows.shift();
  if(!H)H=h; else if(h.join()!==H.join()) throw new Error('header mismatch '+d);
  const pi=H.indexOf('place_id');for(const r of rows){n++;if(!seen.has(r[pi]))seen.set(r[pi],r);}
}
fs.mkdirSync(OUTD,{recursive:true});
fs.writeFileSync(path.join(OUTD,'leads_clean.csv'),[H,...seen.values()].map(r=>r.map(esc).join(',')).join('\n')+'\n');
console.log(`rows in ${n} -> unique place_id ${seen.size}`);
