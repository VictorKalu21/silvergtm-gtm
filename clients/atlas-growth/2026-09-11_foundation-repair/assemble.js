#!/usr/bin/env node
/* Reassemble the three geo-gate tracks into one in-footprint list.
 *   has_state.csv        region-judged rows inside the 10 states            (pass 1)
 *   border/...           TN/FL rows within 1.0 deg of a border metro         (pass 2)
 *   sab/sab_final.csv    address-less SABs within 1.0 deg of ANY tile,
 *                        city backfilled from the nearest tile               (pass 3)
 * city_source distinguishes a real Google city from a nearest-tile inference, so nothing downstream
 * mistakes an inferred metro for a verified address.
 */
const fs=require('fs'), path=require('path');
const R=__dirname;
function pc(t){const A=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);A.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);A.push(r);}return A;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const L=f=>{const A=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=A.shift();return {H,rows:A.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])))};};
const parts=[['has_state.csv','pass1_region'],[path.join('border','leads_clean_qualified_infootprint.csv'),'pass2_border'],[path.join('sab','sab_final.csv'),'pass3_sab']];
let OH=null; const out=[]; const seen=new Set(); const counts={};
for(const [f,tag] of parts){
  const p=path.join(R,f); if(!fs.existsSync(p)){counts[tag]=0;continue;}
  const {H,rows}=L(p);
  if(!OH) OH=[...H.filter(h=>h!=='city_source'),'city_source','geo_pass'];
  let n=0;
  for(const o of rows){ const pid=o.place_id; if(!pid||seen.has(pid))continue; seen.add(pid);
    out.push(OH.map(h=> h==='geo_pass'?tag : h==='city_source'?(o.city_source||'google') : (o[h]||''))); n++; }
  counts[tag]=n;
}
fs.writeFileSync(path.join(R,'leads_infootprint_final.csv'),[OH.map(esc).join(','),...out.map(r=>r.map(esc).join(','))].join('\n')+'\n');
console.log(`assembled ${out.length} in-footprint rows: ${Object.entries(counts).map(([k,v])=>k+'='+v).join(' ')}`);
