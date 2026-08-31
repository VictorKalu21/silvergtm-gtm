#!/usr/bin/env node
/* backfill-city.js :: guarantee every lead has city as "City, ST".
 * If `city` is blank, parse it from `full_address` ("..., Phoenix, AZ 85001, USA").
 * Usage: node backfill-city.js --in <leads.csv> --out <leads_city.csv>
 */
const fs = require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), OUT=arg('out');
if(!IN||!OUT){console.error('ERROR: --in and --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
// "123 Main St, Phoenix, AZ 85001, USA" -> "Phoenix, AZ"
function cityFromAddr(addr){
  const m=String(addr||'').match(/,\s*([^,]+),\s*([A-Z]{2})\s*\d{5}/);
  if(m) return m[1].trim()+', '+m[2];
  const m2=String(addr||'').match(/,\s*([^,]+),\s*([A-Z]{2})\b/); // no ZIP
  return m2 ? m2[1].trim()+', '+m2[2] : '';
}
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);
const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
if(ix.city==null){H.push('city');ix.city=H.length-1;}
let filled=0, blank=0;
const out=[H.map(esc).join(',')];
for(const r of rows){
  while(r.length<H.length)r.push('');
  if(!String(r[ix.city]||'').trim()){
    const c=cityFromAddr(r[ix.full_address!=null?ix.full_address:-1]);
    if(c){r[ix.city]=c;filled++;}else blank++;
  }
  out.push(r.map(esc).join(','));
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`rows: ${rows.length} | city backfilled: ${filled} | STILL blank: ${blank}`);
console.log(`-> ${OUT}`);
