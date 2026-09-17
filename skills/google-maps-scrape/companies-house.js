#!/usr/bin/env node
/*
 * companies-house.js :: UK director lookup via the Companies House Public Data API (REST).
 * For each lead: search by name, pick the best-matching ACTIVE company (disambiguated on the
 * postcode parsed from `full_address`), then pull its ACTIVE directors. UK Ltd companies only.
 * Authoritative director names keyed by company number → no namesake noise (unlike the SERP cascade).
 * Director ≈ owner/MD for SMEs; emails still come from Clay's waterfall (name + domain).
 *
 * Usage: node companies-house.js --leads <qualified.csv> --out <dir> [--concurrency 4] [--town city]
 *        --town <column>  lead column holding the town/city (default `city`) — used for the city
 *                         disambiguator and for the no-postcode fallback below.
 * Reads COMPANIES_HOUSE_KEY from skill .env (REST/Public-Data key, HTTP Basic). Output: <dir>/companies_house.jsonl
 *
 * ACCEPTANCE (see IMPROVEMENTS.md, the two 2026-09-17 companies-house entries). An ACTIVE company is
 * accepted, and the record says on WHICH basis (`match_basis`) and how far to trust it (`confidence`):
 *   normalised title == normalised lead name   → matched          (exact_title)   ← tested BEFORE the overlap score
 *   full postcode in the office snippet        → matched          (postcode)
 *   name overlap >= 0.9                        → matched          (name_overlap)
 *   lead has NO postcode, the title carries every core token of the lead name AND the registered
 *   office town == the lead town               → matched          (title_contains+town)
 *   town/city name only                        → low_confidence   (city_only) + demoted_reason
 * The city-only path measured ~21% wrong over 119 accepts on the Atlas Growth 2026-09-16 UK run, and
 * `matched` is what tells the reader NOT to judge it. So it is LABELLED, never dropped: `matched`
 * stays true and the officers are still written, but `confidence: low_confidence` +
 * `demoted_reason: city_only` make the reader apply the owner-prompt's registry rule to it.
 * Normalisation maps `&`→`and` (both for the title equality and inside the overlap tokeniser), so
 * "Welba Construction Ltd." / "WELBA CONSTRUCTION LTD" and "… and Renovations Limited" /
 * "… & RENOVATIONS LIMITED" are matches rather than sub-threshold overlaps.
 */
const fs=require('fs'),path=require('path'),https=require('https');

// ---- pure: parsing + matching (exported; unit-tested in tests/companies-house.test.js, no network)
const HIGH_OVERLAP=0.9;   // near-exact-name acceptance, measured 0% wrong
const MIN_OVERLAP=0.34;   // below this a candidate is not even considered
// core tokens = normalised tokens minus the words that carry no identity in a UK trade name
const CORE_STOP=new Set(['and','co','uk','company','services','service','group']);
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
function lastPostcode(addr){ // postcode sits at the END of a UK address; take the LAST match, compare space-insensitively
  if(!addr)return{full:'',outward:''};
  const re=/([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/gi;let m,last=null;while((m=re.exec(addr))!==null)last=m;
  return last?{full:(last[1]+last[2]).toUpperCase(),outward:last[1].toUpperCase()}:{full:'',outward:''};
}
// `&`→and BEFORE punctuation is stripped, so "A & B" and "A and B" tokenise identically
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\b(ltd|limited|llp|plc|the)\b/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
// normalised-title equality: the accept that runs BEFORE the overlap score
function titleEqual(a,b){const A=norm(a),B=norm(b);return !!A&&A===B;}
function nameOverlap(a,b){const A=new Set(norm(a).split(' ').filter(Boolean)),B=new Set(norm(b).split(' ').filter(Boolean));if(!A.size||!B.size)return 0;let n=0;for(const t of A)if(B.has(t))n++;return n/Math.max(A.size,B.size);}
const coreTokens=s=>norm(s).split(' ').filter(t=>t&&!CORE_STOP.has(t));
// decision-making officers: active directors + LLP members; drop secretaries, corporate (company-as-officer) and nominees
function keepOfficer(role){const r=(role||'').toLowerCase();if(!r)return false;if(/corporate|secretary|nominee/.test(r))return false;return /director|member/.test(r);}
function mapOfficers(items,businessName){
  const bizLc=norm(businessName);
  return (items||[]).filter(x=>keepOfficer(x.officer_role)&&!x.resigned_on).map(x=>{
    const surname=String(x.name||'').split(',')[0].trim().toLowerCase();
    return {name:x.name,role:x.officer_role,occupation:x.occupation||'',appointed_on:x.appointed_on,
            likely_principal: surname.length>2 && bizLc.includes(surname)}; // surname in the business name => the owner
  });
}
// Rank the search hits and describe the winner's evidence. Pure: `items` is the API's items array.
function pickBest(lead,items,opts){
  opts=opts||{};const field=opts.townField||'city';
  const {full,outward}=lastPostcode(lead.full_address);
  const town=String(lead[field]||'').trim().toLowerCase(); // fallback disambiguator when no postcode in the list
  const leadCore=coreTokens(lead.name);
  let best=null,bestScore=0;
  for(const it of (items||[])){
    const ov=nameOverlap(lead.name,it.title);
    const titleEq=titleEqual(lead.name,it.title);
    if(ov<MIN_OVERLAP&&!titleEq)continue; // require a real name match
    const snipRaw=(it.address_snippet||'');
    const snip=snipRaw.toUpperCase().replace(/\s+/g,'');
    const active=it.company_status==='active';
    const pcMatch=!!full&&snip.includes(full),owMatch=!!outward&&snip.includes(outward);
    const cityMatch=town.length>2&&snipRaw.toLowerCase().includes(town);
    // --town fallback: ONLY for a lead with no postcode of its own — registered-office town equality
    // plus "the title carries every core token of the lead name" (the job-side pass-2 rule).
    const officeTown=String((it.address||{}).locality||'').trim().toLowerCase();
    const townMatch=!full&&town.length>2&&officeTown===town;
    const tTok=new Set(coreTokens(it.title));
    const containsAll=leadCore.length>0&&leadCore.every(t=>tTok.has(t));
    const sc=ov*2+(active?2:0)+(titleEq?5:0)+(pcMatch?4:0)+(cityMatch?2:0)+(owMatch?1:0)+((townMatch&&containsAll)?2:0);
    if(sc>bestScore){bestScore=sc;best={it,active,pcMatch,cityMatch,owMatch,titleEq,townMatch,containsAll,ov,score:sc};}
  }
  return best;
}
// What the winner is worth. Every basis the old engine accepted still accepts; the city-only one is
// relabelled, not dropped (precision over recall stays, but the reader gets to judge it).
function classify(best){
  if(!best||!best.active)return{accept:false,reason:'low_confidence'};
  if(best.titleEq)return{accept:true,confidence:'matched',basis:'exact_title'};
  if(best.pcMatch)return{accept:true,confidence:'matched',basis:'postcode'};
  if(best.ov>=HIGH_OVERLAP)return{accept:true,confidence:'matched',basis:'name_overlap'};
  if(best.townMatch&&best.containsAll)return{accept:true,confidence:'matched',basis:'title_contains+town'};
  if(best.cityMatch)return{accept:true,confidence:'low_confidence',basis:'city_only',demoted_reason:'city_only'};
  return{accept:false,reason:'low_confidence'};
}
// The output record for one lead, minus `officers` (that needs a second API call).
function matchRecord(lead,items,opts){
  const best=pickBest(lead,items,opts);
  const {full}=lastPostcode(lead.full_address);
  const rec={place_id:lead.place_id,business_name:lead.name,lead_postcode:full,matched:false};
  if(!best){rec.reason='no_name_match';return{rec,best:null,decision:{accept:false,reason:'no_name_match'}};}
  const d=classify(best);
  if(d.accept){
    Object.assign(rec,{matched:true,ch_company:best.it.title,ch_number:best.it.company_number,ch_status:best.it.company_status,
      match_postcode:best.pcMatch,match_city:best.cityMatch,match_title:best.titleEq,match_town:!!(best.townMatch&&best.containsAll),
      name_overlap:+best.ov.toFixed(2),confidence:d.confidence,match_basis:d.basis});
    if(d.demoted_reason)rec.demoted_reason=d.demoted_reason;
  } else { // best candidate too weak — record why, don't assert it
    rec.reason='low_confidence';rec.candidate=best.it.title;rec.candidate_status=best.it.company_status;
    rec.name_overlap=+best.ov.toFixed(2);rec.match_postcode=best.pcMatch;rec.match_city=best.cityMatch;rec.match_title=best.titleEq;
  }
  return{rec,best,decision:d};
}

module.exports={HIGH_OVERLAP,MIN_OVERLAP,parseCsv,lastPostcode,norm,titleEqual,nameOverlap,coreTokens,keepOfficer,mapOfficers,pickBest,classify,matchRecord};
if(require.main!==module)return;   // required by a test: nothing below runs (argv parse, .env read, API calls)

// ---- run path ------------------------------------------------------------------------------------
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),OUT=arg('out','.'),CONC=parseInt(arg('concurrency','4'),10),TOWN=arg('town','city');
const ENVPATH=arg('env',path.join(__dirname,'.env'));
if(!LEADS){console.error('ERROR: --leads required');process.exit(1);}
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const KEY=loadEnv(ENVPATH).COMPANIES_HOUSE_KEY;
if(!KEY){console.error('ERROR: COMPANIES_HOUSE_KEY not in '+ENVPATH);process.exit(1);}
const AUTH='Basic '+Buffer.from(KEY+':').toString('base64');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function api(p){return new Promise(res=>{const opts={host:'api.company-information.service.gov.uk',path:p,headers:{Authorization:AUTH},timeout:20000};const req=https.get(opts,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res({status:r.statusCode,ra:r.headers['retry-after'],json:JSON.parse(b||'{}')});}catch{res({status:r.statusCode,ra:r.headers['retry-after'],json:{}});}});});req.on('error',e=>res({status:0,json:{},err:e.message}));req.on('timeout',()=>{req.destroy();res({status:0,json:{}});});});}
// 429-aware retry: CH allows 600 req / 5 min and returns Retry-After on overrun
async function apiR(p){for(let a=0;a<5;a++){const r=await api(p);if(r.status===429||r.status>=500||r.status===0){await sleep(r.ra?Math.min(120000,(+r.ra||5)*1000):2000*(a+1));continue;}return r;}return api(p);}

(async()=>{
  const rows=parseCsv(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
  const H=rows.shift();const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
  fs.mkdirSync(OUT,{recursive:true});
  const outFile=path.join(OUT,'companies_house.jsonl');fs.writeFileSync(outFile,'');
  const queue=leads.slice();let done=0,matched=0,withDir=0,demoted=0;const byBasis={};
  async function worker(){
    while(queue.length){
      const l=queue.shift();
      await sleep(150);
      const s=await apiR('/search/companies?q='+encodeURIComponent(l.name)+'&items_per_page=20');
      const items=(s.json&&s.json.items)||[];
      const {rec,decision}=matchRecord(l,items,{townField:TOWN});
      if(rec.matched){
        matched++;byBasis[decision.basis]=(byBasis[decision.basis]||0)+1;
        if(rec.confidence==='low_confidence')demoted++;
        await sleep(150);
        const o=await apiR('/company/'+rec.ch_number+'/officers?items_per_page=50');
        const officers=mapOfficers((o.json&&o.json.items)||[],l.name);
        if(officers.length)withDir++;
        rec.officers=officers;
      }
      fs.appendFileSync(outFile,JSON.stringify(rec)+'\n');done++;
    }
  }
  await Promise.all(Array.from({length:Math.min(CONC,leads.length)},worker));
  console.log('CH lookup -> '+outFile);
  console.log('  leads: '+leads.length+' | company matched: '+matched+' | with active director(s): '+withDir);
  console.log('  basis: '+Object.entries(byBasis).map(([k,v])=>k+' '+v).join(' | ')+' || DEMOTED to low_confidence (city_only): '+demoted);
})();
