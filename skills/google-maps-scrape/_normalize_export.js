#!/usr/bin/env node
/* one-off: map an arbitrary business export -> the leads format the cascade expects, deduped by domain.
 * Usage: node _normalize_export.js --in <export.csv> --out <leads.csv> --icp <icp_type> [--country UK] */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'),OUT=arg('out'),ICP=arg('icp','lead'),COUNTRY=arg('country','UK');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
function host(u){try{return new URL(u).host.replace(/^www\./,'').toLowerCase();}catch{return '';}}
const seen=new Set();const out=[];
const COLS=['place_id','name','icp_type','full_address','zip','neighborhood','city','phone_number','website'];
for(const r of rows){
  const name=(r[ix.name_for_emails]||'').trim();
  const website=(r[ix.website]||'').trim();
  let domain=(r[ix.domain]||'').trim().toLowerCase()||host(website);
  const city=(r[ix.city]||'').trim();
  const key=domain||(name.toLowerCase()+'|'+city.toLowerCase());
  if(!name||!key||seen.has(key))continue; seen.add(key);
  out.push({place_id:domain||key.replace(/[^a-z0-9]+/g,'_'),name,icp_type:ICP,
    full_address:city?city+', '+COUNTRY:COUNTRY,zip:'',neighborhood:'',city,
    phone_number:(r[ix.contact_phone]||'').trim(),website});
}
fs.writeFileSync(OUT,[COLS.join(',')].concat(out.map(o=>COLS.map(c=>esc(o[c])).join(','))).join('\n')+'\n');
console.log('rows in: '+rows.length+' | unique businesses out: '+out.length+' -> '+OUT);
