#!/usr/bin/env node
/* Concat the main qualify pass and the generic-contractor recovery pass, dedupe on place_id.
 * Split out of the shell chain so rerun-chain.sh stays declarative and this is unit-testable. */
const fs=require('fs'), path=require('path'); const R=__dirname;
function pc(t){const A=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);A.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);A.push(r);}return A;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const A=pc(fs.readFileSync(path.join(R,'leads_clean_qualified.csv'),'utf8')).filter(r=>r.length>1); const H=A.shift();
const B=pc(fs.readFileSync(path.join(R,'recover','leads_clean_qualified.csv'),'utf8')).filter(r=>r.length>1); const HB=B.shift();
const ip=H.indexOf('place_id'), ipb=HB.indexOf('place_id');
const seen=new Set(A.map(r=>r[ip])); let added=0;
for(const r of B){ if(seen.has(r[ipb]))continue; seen.add(r[ipb]); A.push(H.map(h=>{const j=HB.indexOf(h);return j>-1?r[j]:'';})); added++; }
fs.writeFileSync(path.join(R,'leads_qualified_all.csv'),[H.map(esc).join(','),...A.map(r=>r.map(esc).join(','))].join('\n')+'\n');
console.log(`qualified total: ${A.length} (main + ${added} recovered)`);
