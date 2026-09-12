// assemble.mjs — Stage 8 (+folds in stage 9). Build the final B2B-verified prospect list:
//   - merge all LLM verdicts (llmb/*-out.json, BOM-safe) keyed by domain
//   - merge re-match verdicts (rematch/*-out.json, keyed by company) for wrong-domain rows
//   - keep rows whose b2b_verdict is in config.keep_verdicts AND brand_match != "no"
//   - JOIN the prospect person back in via reactor headline -> config.reactor_export
//   - SUBTRACT config.vendor_customers domains
// Writes <run>/<config.output_csv>. Run: node assemble.mjs
import fs from "node:fs";
const CFG=JSON.parse(fs.readFileSync(process.env.CONFIG||"config.json","utf8"));
function parseCSV(t){const rows=[];let f=[],cur="",q=false;for(let i=0;i<t.length;i++){const c=t[i];const Q='"';if(q){if(c===Q){if(t[i+1]===Q){cur+=Q;i++;}else q=false;}else cur+=c;}else{if(c===Q){q=true;}else if(c===","){f.push(cur);cur="";}else if(c==="\n"){f.push(cur);rows.push(f);f=[];cur="";}else if(c==="\r"){}else cur+=c;}}if(cur!==""||f.length){f.push(cur);rows.push(f);}return rows;}
const esc=v=>{v=(v==null?"":String(v));return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const jread=p=>JSON.parse(fs.readFileSync(p,"utf8").replace(/^﻿/,""));
const norm=s=>(s||"").toLowerCase().replace(/\s+/g," ").trim();
const dl=d=>(d||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"");

// 1. merge domain verdicts
const A={};
if(fs.existsSync("llmb"))for(const f of fs.readdirSync("llmb"))if(/-out\.json$/.test(f))Object.assign(A,jread("llmb/"+f));
// 2. merge rematch (company -> {domain,b2b_verdict,confidence})
const RM={};
if(fs.existsSync("rematch"))for(const f of fs.readdirSync("rematch"))if(/-out\.json$/.test(f))Object.assign(RM,jread("rematch/"+f));

// 3. person index by headline
const PC=CFG.person_cols; const RQ=parseCSV(fs.readFileSync(CFG.reactor_export,"utf8"));const rh=RQ.shift();const ri=Object.fromEntries(rh.map((h,i)=>[h,i]));
const byHead={};for(const r of RQ){const h=norm(r[ri[PC.headline]]);if(h&&!byHead[h])byHead[h]=r;}
const person=headline=>{const p=byHead[norm(headline)];if(!p)return{};return{first_name:p[ri[PC.first_name]],last_name:p[ri[PC.last_name]],linkedin_url:p[ri[PC.linkedin_url]],position:p[ri[PC.position]],location:p[ri[PC.location]],is_founder:p[ri[PC.is_founder]]};};

// 4. vendor customers
const cust=new Set();
if(CFG.vendor_customers&&fs.existsSync(CFG.vendor_customers)){const C=parseCSV(fs.readFileSync(CFG.vendor_customers,"utf8"));C.shift();for(const r of C)if(r[0])cust.add(dl(r[0]));}

// 5. walk prospects
const KEEP=new Set(CFG.keep_verdicts||["b2b_operator","unclear"]);
const P=parseCSV(fs.readFileSync(CFG.prospects_csv,"utf8"));const ph=P.shift();const pi=Object.fromEntries(ph.map((h,i)=>[h,i]));
const rows=P.filter(r=>r[0]&&r[0].trim());
const out=[];let dropped_cust=0,keep=0,rematched=0,dropV=0,dropBrand=0,noV=0;
const OUTH=["domain","company","b2b_verdict","brand_match","confidence","source","first_name","last_name","position","linkedin_url","reactor_headline","location","is_founder"];
for(const r of rows){
  let dom=dl(r[pi[CFG.domain_col]]);const company=r[pi[CFG.company_col]];const headline=r[pi[CFG.headline_col]]||"";const src=r[pi[CFG.source_col]]||"";
  if(cust.has(dom)){dropped_cust++;continue;}
  const pr=person(headline);const pos=r[pi[CFG.position_col]]||pr.position||"";
  const emit=(dom,verdict,brand,conf,source)=>out.push([dom,company,verdict,brand,conf,source,pr.first_name||"",pr.last_name||"",pos,pr.linkedin_url||"",headline,pr.location||"",pr.is_founder||""]);
  const a=A[dom];
  if(a&&a.brand_match==="no"){ // stage-9 rematch
    const m=RM[company];
    if(m&&m.domain&&KEEP.has(m.b2b_verdict)){emit(dl(m.domain),m.b2b_verdict,"rematched",m.confidence||"","rematch");rematched++;keep++;}
    else dropBrand++;
    continue;
  }
  if(!a){noV++;continue;}
  if(KEEP.has(a.b2b_verdict)){emit(dom,a.b2b_verdict,a.brand_match||"",a.confidence||"",src);keep++;}
  else dropV++;
}
fs.writeFileSync(CFG.output_csv,[OUTH.join(",")].concat(out.map(r=>r.map(esc).join(","))).join("\n")+"\n");
console.log("=== ASSEMBLE ===");
console.log("prospects in:",rows.length);
console.log("KEEP (B2B-verified):",keep,"(incl",rematched,"re-matched) ->",CFG.output_csv);
console.log("dropped current-customers:",dropped_cust,"| wrong-type:",dropV,"| brand-mismatch unresolved:",dropBrand,"| no verdict:",noV);
