#!/usr/bin/env node
/* flag-leadgen.js :: FLAG (never drop) likely lead-gen / rank-and-rent listings. $0, deterministic joins only.
 * Signals, each across DISTINCT root domains (a brand's own branches share one domain and never trip them):
 *   shared_phone   — the same 10-digit phone on >= 2 root domains (call-tracking / referral networks)
 *   shared_text    — >= 2 root domains whose site text shares >= 40% of its 8-word shingles (one template, many sites)
 * Usage: node flag-leadgen.js --leads <leads_annotated.csv> --site <owner/site_text.jsonl> --out <dir>
 * Writes <dir>/leadgen_flags.csv (place_id, root_domain, leadgen_flags, leadgen_cluster) + leadgen_report.json.
 * The model-read half (referral-service language) lives in classify-prompt.md (`lead_gen` field).
 */
const fs=require('fs'),path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),SITE=arg('site'),OUT=arg('out');
if(!LEADS||!SITE||!OUT){console.error('--leads --site --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);const H=rows.shift();
const L=rows.map(r=>Object.fromEntries(H.map((k,i)=>[k,r[i]??''])));
const dom=r=>r.root_domain||'';
// phone -> set of domains
const byPhone=new Map();
for(const r of L){const p=(r.phone_number||'').replace(/\D/g,'').slice(-10);const d=dom(r);if(p.length===10&&d){if(!byPhone.has(p))byPhone.set(p,new Set());byPhone.get(p).add(d);}}
// site text shingles per domain (representative text)
const text=new Map();
for(const ln of fs.readFileSync(SITE,'utf8').split('\n')){if(!ln.trim())continue;try{const o=JSON.parse(ln);if(o.status==='ok'&&o.text){const r=L.find(x=>x.place_id===o.place_id);if(r&&dom(r))text.set(dom(r),o.text);}}catch{}}
const sh=new Map();
for(const [d,t] of text){const w=t.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(Boolean);const s=new Set();for(let i=0;i+8<=w.length;i+=2)s.add(w.slice(i,i+8).join(' '));if(s.size>=30)sh.set(d,s);}
// inverted index shingle -> domains, skip boilerplate shared by very many (cookie banners, widgets)
const inv=new Map();for(const [d,s] of sh)for(const x of s){if(!inv.has(x))inv.set(x,[]);inv.get(x).push(d);}
const pair=new Map();
for(const ds of inv.values()){if(ds.length<2||ds.length>40)continue;for(let i=0;i<ds.length;i++)for(let j=i+1;j<ds.length;j++){const k=ds[i]<ds[j]?ds[i]+'|'+ds[j]:ds[j]+'|'+ds[i];pair.set(k,(pair.get(k)||0)+1);}}
const textMates=new Map();
for(const [k,n] of pair){const [a,b]=k.split('|');const sim=n/Math.min(sh.get(a).size,sh.get(b).size);if(sim>=0.4){for(const [x,y] of [[a,b],[b,a]]){if(!textMates.has(x))textMates.set(x,new Set());textMates.get(x).add(y);}}}
// union-find clusters over both signals
const par=new Map();const f=x=>{while(par.get(x)!==x){par.set(x,par.get(par.get(x)));x=par.get(x);}return x;};const u=(a,b)=>{for(const z of [a,b])if(!par.has(z))par.set(z,z);par.set(f(a),f(b));};
const flags=new Map();const add=(d,t)=>{if(!flags.has(d))flags.set(d,new Set());flags.get(d).add(t);};
// name per domain (normalised, legal suffixes stripped) and brand per domain
const nm=new Map(),brand=new Map();
const norm=x=>(x||'').toLowerCase().replace(/\b(llc|inc|co|corp|company|ltd)\b|[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
for(const r of L){const d=dom(r);if(!d)continue;if(!nm.has(d))nm.set(d,norm(r.name));if(r.brand_family)brand.set(d,r.brand_family);}
for(const ds of byPhone.values())if(ds.size>=2){const a=[...ds];const sameName=new Set(a.map(d=>nm.get(d))).size===1;
  a.forEach(d=>add(d,sameName?'same_business_multi_domain':'shared_phone'));if(!sameName)for(let i=1;i<a.length;i++)u(a[0],a[i]);}
// dealer networks (brand_families) publish one template per dealer by design: exempt from shared_text
for(const [d,m] of textMates){if(brand.has(d))continue;const mates=[...m].filter(y=>!brand.has(y));if(!mates.length)continue;add(d,'shared_text');for(const y of mates)u(d,y);}
// a row is a lead-gen SUSPECT only on shared_phone or shared_text; same_business_multi_domain is a dedupe hint
const out=[['place_id','root_domain','leadgen_flags','leadgen_cluster','leadgen_cluster_size']];
const csize=new Map();for(const d of flags.keys())if(!(flags.get(d).size===1&&flags.get(d).has('same_business_multi_domain'))){const c=f(d);csize.set(c,(csize.get(c)||0)+1);}
let flaggedRows=0;
for(const r of L){const d=dom(r);const fl=flags.get(d);if(fl){flaggedRows++;out.push([r.place_id,d,[...fl].sort().join('|'),csize.has(f(d))?f(d):'',csize.get(f(d))||'']);}}
fs.writeFileSync(path.join(OUT,'leadgen_flags.csv'),out.map(r=>r.map(esc).join(',')).join('\n')+'\n');
const rep={domains_flagged:flags.size,leadgen_suspect_domains:[...flags.values()].filter(s=>s.has('shared_phone')||s.has('shared_text')).length,same_business_multi_domain:[...flags.values()].filter(s=>s.has('same_business_multi_domain')).length,rows_flagged:flaggedRows,shared_phone_domains:[...flags.values()].filter(s=>s.has('shared_phone')).length,shared_text_domains:[...flags.values()].filter(s=>s.has('shared_text')).length,clusters:csize.size,largest_clusters:[...csize.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)};
fs.writeFileSync(path.join(OUT,'leadgen_report.json'),JSON.stringify(rep,null,2));console.log(JSON.stringify(rep));
