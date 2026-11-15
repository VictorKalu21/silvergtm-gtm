#!/usr/bin/env node
// Aggregates for the national run (no lead rows printed). Usage: node report-full.js [--dir full]
// Joins: leads_domains_classified.csv (verdict per root_domain) -> fanned to every leads_annotated row of that domain;
// classify/out lead_gen (model) + leadgen_flags.csv (deterministic) -> lead-gen tier per domain:
//   strong = shared_phone | shared_text | homoglyph_text (with or without the model flag) ; soft = model flag only.
const fs=require('fs'),path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const D=path.resolve(__dirname,arg('dir','full'));
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const csv=f=>{const R=pc(fs.readFileSync(path.join(D,f),'utf8')).filter(r=>r.length>1);const H=R.shift();return R.map(r=>Object.fromEntries(H.map((k,i)=>[k,r[i]??''])));};
const cls=csv('leads_domains_classified.csv'),ann=csv('leads_annotated.csv'),nows=csv('leads_nowebsite.csv');
const verdict=new Map(),conf=new Map();for(const r of cls){verdict.set(r.root_domain,r.business_type);conf.set(r.root_domain,r.business_type_confidence);}
const model=new Map();for(const f of fs.readdirSync(path.join(D,'classify/out')))for(const o of JSON.parse(fs.readFileSync(path.join(D,'classify/out',f),'utf8')))model.set(o.place_id,o);
const repDom=new Map(cls.map(r=>[r.place_id,r.root_domain]));
const mlg=new Set(),oob=new Set();for(const [pid,o] of model){const d=repDom.get(pid);if(!d)continue;if(o.lead_gen)mlg.add(d);if(o.out_of_business)oob.add(d);}
const det=new Map();for(const r of csv('leadgen_flags.csv'))det.set(r.root_domain,r.leadgen_flags);
const strong=d=>/shared_phone|shared_text|homoglyph_text/.test(det.get(d)||'');
const tier=d=>strong(d)?'strong':mlg.has(d)?'soft':'';
// state: from the street address; service-area rows (no address) take the state of the nearest runsheet anchor
const SHEET=path.resolve(__dirname,'../atlas-growth-foundation-us-runsheet.csv');
const anchors=[];{const seen=new Set();for(const r of pc(fs.readFileSync(SHEET,'utf8')).slice(1)){if(r.length<5)continue;const k=r[0].replace(/-q\d+$/,'');if(seen.has(k))continue;seen.add(k);anchors.push([k.slice(0,2).toUpperCase(),+r[3],+r[4]]);}}
let byAnchor=0;
const st=r=>{const m=(r.full_address||'').match(/,\s*([A-Z]{2})\s+\d{5}/);if(m)return m[1];const la=+r.latitude,lo=+r.longitude;if(!la||!lo)return '??';
  let b=null,bd=1e9;for(const [s,a,o] of anchors){const d=(a-la)**2+((o-lo)*Math.cos(la*Math.PI/180))**2;if(d<bd){bd=d;b=s;}}byAnchor++;return b;};
const band=n=>{n=+n||0;return n>=30?'30+':n>=5?'5-29':n>=1?'1-4':'0';};
const inc=(o,k,n=1)=>{o[k]=(o[k]||0)+n;};
// domain level
const V={},T={strong:0,soft:0},fitT={strong:0,soft:0,none:0};
for(const [d,v] of verdict){inc(V,v);const t=tier(d);if(t)T[t]++;if(v==='residential_foundation')fitT[t||'none']++;}
// row level (website rows fanned by domain)
const rowsFit=ann.filter(r=>r.root_domain&&verdict.get(r.root_domain)==='residential_foundation');
const fitDomains=new Set(rowsFit.map(r=>r.root_domain));
const byState={};for(const r of rowsFit)inc(byState,st(r));
const coByState={};{const seen=new Set();for(const r of rowsFit){const s0=st(r);const k=r.root_domain+'|'+s0;if(!seen.has(k)){seen.add(k);inc(coByState,s0);}}}
const bandFit={},bandAll={};for(const r of ann)if(r.root_domain&&verdict.has(r.root_domain)){const b=band(r.review_count);inc(bandAll,b);if(verdict.get(r.root_domain)==='residential_foundation')inc(bandFit,b);}
const pathFit={},pathAll={};for(const r of cls){const p=(r.qualify_path||'').split(':')[0];inc(pathAll,p);if(r.business_type==='residential_foundation')inc(pathFit,p);}
const brandFit={};for(const r of cls)if(r.brand_family&&r.business_type==='residential_foundation')inc(brandFit,r.brand_family);
const fallback=cls.filter(r=>r.business_type_confidence==='fallback').length;
const rep={
  domains_read:verdict.size,fallback_unclassified:fallback,verdicts:V,
  fit_domains:fitDomains.size,fit_rows_incl_branches:rowsFit.length,
  fit_out_of_business_flag:[...fitDomains].filter(d=>oob.has(d)).length,
  leadgen_domains:T,fit_domains_by_leadgen_tier:fitT,
  fit_clean_domains:fitT.none,
  no_website_rows:nows.length,
  fit_rate_by_review_band:Object.fromEntries(Object.keys(bandAll).map(b=>[b,`${bandFit[b]||0}/${bandAll[b]} (${Math.round(100*(bandFit[b]||0)/bandAll[b])}%)`])),
  fit_rate_by_qualify_path:Object.fromEntries(Object.keys(pathAll).map(p=>[p,`${pathFit[p]||0}/${pathAll[p]} (${Math.round(100*(pathFit[p]||0)/pathAll[p])}%)`])),
  fit_brand_family_domains:brandFit,
  state_from_nearest_anchor_lookups:byAnchor,
  fit_rows_by_state:Object.fromEntries(Object.entries(byState).sort((a,b)=>b[1]-a[1])),
  fit_companies_by_state:Object.fromEntries(Object.entries(coByState).sort((a,b)=>b[1]-a[1])),
};
fs.writeFileSync(path.join(D,'report.json'),JSON.stringify(rep,null,1));
console.log(JSON.stringify(rep,null,1));
