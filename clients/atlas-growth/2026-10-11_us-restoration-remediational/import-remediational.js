#!/usr/bin/env node
/* import-remediational.js — job-side IMPORT ONLY (no engine logic): turn the remediational.com merged CSV
 * (Tier 0 places.json + Tier 1 listing JSON-LD, built by the web-scrape-triage run in the session scratchpad)
 * into the google-maps-scrape leads_clean.csv column set so STEP 5b onward runs through the engine unchanged.
 * Usage: node import-remediational.js --in <remediational_merged.csv> --out <run>/leads_clean.csv
 * Columns written = scrape.js cleanCols. place_id = 'cid:<Google Maps CID>' (stable Google id; falls back to
 * 'rmd:<path>'). google_types = the 12 directory tags mapped to pseudo categories (bit order of places.json tags[]),
 * primary = first tag present. icp_type = 'dir:<primary tag>'. city = 'City, ST' (geo.region_from_city). */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in'),OUT=arg('out'); if(!IN||!OUT){console.error('--in --out required');process.exit(1);}
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
const cell=s=>{s=s==null?'':String(s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const TYPE={water:'water damage restoration service',mold:'mold remediation service',testing:'mold inspection and testing service',
  fire:'fire damage restoration service',sewage:'sewage cleanup service',biohazard:'biohazard cleanup service',hoarding:'hoarding cleanup service',
  asbestos:'asbestos abatement service',lead:'lead paint abatement service',storm:'storm damage restoration service',odor:'odor removal service',contents:'contents cleaning service'};
const COLS=['place_id','business_id','name','icp_type','google_types','full_address','city','zip','neighborhood','latitude','longitude','website','phone_number','rating','review_count','is_claimed','verified','hours','place_link','metro','pct_5star','own_words','directory_url'];
const rows=parseCsv(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
const need=['name','metro','city','state','zip','street','phone','website','services','rating','reviews','pct_5star','open_24_7','lat','lng','gmaps_cid','own_words','url'];
for(const n of need) if(ix[n]==null){console.error('missing input column '+n);process.exit(1);}
const out=[COLS.join(',')];let noCid=0,noWeb=0;
for(const r of rows){const g=v=>r[ix[v]]||'';
  const tags=g('services').split('|').filter(Boolean);const types=tags.map(t=>TYPE[t]||t).join('|');
  const cid=g('gmaps_cid');if(!cid)noCid++;if(!g('website'))noWeb++;
  const pid=cid?'cid:'+cid:'rmd:'+g('url').replace(/^https?:\/\/remediational\.com/,'');
  const city=g('city')+', '+g('state');
  const addr=[g('street'),g('city')+', '+g('state')+' '+g('zip')].filter(Boolean).join(', ');
  out.push([pid,cid,g('name'),'dir:'+(tags[0]||'none'),types,addr,city,g('zip'),'',g('lat'),g('lng'),g('website'),g('phone'),g('rating'),g('reviews'),'','',
    g('open_24_7')==='1'?'Open 24 hours':'',cid?'https://www.google.com/maps?cid='+cid:'',g('metro'),g('pct_5star'),g('own_words'),g('url')].map(cell).join(','));}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`leads_clean.csv: ${out.length-1} rows | no CID: ${noCid} | no website: ${noWeb} -> ${OUT}`);
