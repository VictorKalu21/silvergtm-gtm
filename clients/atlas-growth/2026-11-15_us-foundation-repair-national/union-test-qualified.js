#!/usr/bin/env node
// Union main-qualified + generic-recovery keeps (excluding rows the NAME deny dropped) -> test/leads_qualified.csv
const fs=require('fs'),path=require('path');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const T=path.join(__dirname,'test');
const load=f=>{const rows=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const h=rows.shift();return {h,rows:rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))};};
const main=load(path.join(T,'leads_clean_qualified.csv')), rec=load(path.join(T,'recover','leads_clean_qualified.csv'));
const H=[...main.h.filter(k=>k!=='drop_reason'),'qualify_path'];const out=new Map();let skipped=0;
for(const r of main.rows) out.set(r.place_id,{...r,qualify_path:'main'});
for(const r of rec.rows){ if(r.drop_reason==='name_deny'){skipped++;continue;} if(!out.has(r.place_id)) out.set(r.place_id,{...r,qualify_path:'generic_recovery:'+r.drop_reason}); }
fs.writeFileSync(path.join(T,'leads_qualified.csv'),[H.map(esc).join(','),...[...out.values()].map(r=>H.map(k=>esc(r[k])).join(','))].join('\n')+'\n');
console.log(`main ${main.rows.length} + recovery ${rec.rows.length-skipped} (name_deny skipped ${skipped}) -> ${out.size}`);
