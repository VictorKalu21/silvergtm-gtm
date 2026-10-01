#!/usr/bin/env node
/* Give surviving address-less SABs a "Metro, ST" city from the NEAREST tile in THIS run's runsheet.
 * An SAB serves a whole metro, so metro granularity is the honest level of precision. Uses our own
 * runsheet (not the engine's hardcoded 47-metro list, which is another client's footprint) so a
 * Houston SAB can never be labelled Phoenix. Marks the value so it is never mistaken for a real
 * Google address: `city` = "<Metro>, <ST>" and a new column `city_source` = "nearest_tile".
 * Usage: node sab-backfill-city.js --in <csv> --runsheet <runsheet.csv> --out <csv>
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'), RS=arg('runsheet'), OUT=arg('out'), MAXDEG=parseFloat(arg('maxdeg','1.5'));
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const TITLE=s=>s.split('-').map(w=>w.length<=2?w.toUpperCase():w[0].toUpperCase()+w.slice(1)).join(' ');
const rs=pc(fs.readFileSync(RS,'utf8')).filter(r=>r.length>1); const RH=rs.shift();
const iCell=RH.indexOf('cell_id'), iLat=RH.indexOf('lat'), iLng=RH.indexOf('lng');
const hubs=new Map();
for(const r of rs){ const slug=(r[iCell]||'').replace(/-q\d+$/,''); if(hubs.has(slug))continue;
  const m=slug.match(/^([a-z]{2})-(.+)$/); if(!m)continue;
  hubs.set(slug,{lat:+r[iLat],lng:+r[iLng],label:TITLE(m[2])+', '+m[1].toUpperCase()}); }
const hl=[...hubs.values()];
const rows=pc(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1); const H=rows.shift();
const iC=H.indexOf('city'), iLa=H.indexOf('latitude'), iLo=H.indexOf('longitude');
const OH=[...H,'city_source']; let n=0, far=0;
const out=rows.map(r=>{
  const la=parseFloat(r[iLa]), lo=parseFloat(r[iLo]);
  if(!(r[iC]||'').trim() && isFinite(la) && isFinite(lo)){
    let best=null,bd=Infinity;
    for(const h of hl){const d=(h.lat-la)**2+(h.lng-lo)**2; if(d<bd){bd=d;best=h;}}
    // Guard added when the client chose to KEEP out-of-footprint US rows: an SAB far from every
    // tile must NOT be labelled with a distant metro (the documented 'Seattle firm anchored to
    // Spokane competitors' failure). Beyond --maxdeg, leave city empty and say so.
    if(best && Math.sqrt(bd)<=MAXDEG){r=[...r]; r[iC]=best.label; n++; return [...r,'nearest_tile'];}
    if(best){far++; return [...r,'too_far_to_infer'];}
  }
  return [...r,'google'];
});
fs.writeFileSync(OUT,[OH.map(esc).join(','),...out.map(r=>r.map(esc).join(','))].join('\n')+'\n');
console.log(`backfilled city on ${n}/${rows.length} address-less SABs from the nearest runsheet tile`+(far?` | ${far} left blank: >${MAXDEG}deg from every tile (city_source=too_far_to_infer)`:''));
