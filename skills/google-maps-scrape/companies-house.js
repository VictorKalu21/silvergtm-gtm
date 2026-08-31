#!/usr/bin/env node
/*
 * companies-house.js :: UK director lookup via the Companies House Public Data API (REST).
 * For each lead: search by name, pick the best-matching ACTIVE company (disambiguated on the
 * postcode parsed from `full_address`), then pull its ACTIVE directors. UK Ltd companies only.
 * Authoritative director names keyed by company number → no namesake noise (unlike the SERP cascade).
 * Director ≈ owner/MD for SMEs; emails still come from Clay's waterfall (name + domain).
 *
 * Usage: node companies-house.js --leads <qualified.csv> --out <dir> [--concurrency 4]
 * Reads COMPANIES_HOUSE_KEY from skill .env (REST/Public-Data key, HTTP Basic). Output: <dir>/companies_house.jsonl
 */
const fs=require('fs'),path=require('path'),https=require('https');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),OUT=arg('out','.'),CONC=parseInt(arg('concurrency','4'),10);
const ENVPATH=arg('env',path.join(__dirname,'.env'));
if(!LEADS){console.error('ERROR: --leads required');process.exit(1);}
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const KEY=loadEnv(ENVPATH).COMPANIES_HOUSE_KEY;
if(!KEY){console.error('ERROR: COMPANIES_HOUSE_KEY not in '+ENVPATH);process.exit(1);}
const AUTH='Basic '+Buffer.from(KEY+':').toString('base64');
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function api(p){return new Promise(res=>{const opts={host:'api.company-information.service.gov.uk',path:p,headers:{Authorization:AUTH},timeout:20000};const req=https.get(opts,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res({status:r.statusCode,ra:r.headers['retry-after'],json:JSON.parse(b||'{}')});}catch{res({status:r.statusCode,ra:r.headers['retry-after'],json:{}});}});});req.on('error',e=>res({status:0,json:{},err:e.message}));req.on('timeout',()=>{req.destroy();res({status:0,json:{}});});});}
// 429-aware retry: CH allows 600 req / 5 min and returns Retry-After on overrun
async function apiR(p){for(let a=0;a<5;a++){const r=await api(p);if(r.status===429||r.status>=500||r.status===0){await sleep(r.ra?Math.min(120000,(+r.ra||5)*1000):2000*(a+1));continue;}return r;}return api(p);}
function lastPostcode(addr){ // postcode sits at the END of a UK address; take the LAST match, compare space-insensitively
  if(!addr)return{full:'',outward:''};
  const re=/([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/gi;let m,last=null;while((m=re.exec(addr))!==null)last=m;
  return last?{full:(last[1]+last[2]).toUpperCase(),outward:last[1].toUpperCase()}:{full:'',outward:''};
}
const norm=s=>String(s||'').toLowerCase().replace(/\b(ltd|limited|llp|plc|the)\b/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function nameOverlap(a,b){const A=new Set(norm(a).split(' ').filter(Boolean)),B=new Set(norm(b).split(' ').filter(Boolean));if(!A.size||!B.size)return 0;let n=0;for(const t of A)if(B.has(t))n++;return n/Math.max(A.size,B.size);}
// decision-making officers: active directors + LLP members; drop secretaries, corporate (company-as-officer) and nominees
function keepOfficer(role){const r=(role||'').toLowerCase();if(!r)return false;if(/corporate|secretary|nominee/.test(r))return false;return /director|member/.test(r);}

(async()=>{
  const rows=parseCsv(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
  const H=rows.shift();const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
  fs.mkdirSync(OUT,{recursive:true});
  const outFile=path.join(OUT,'companies_house.jsonl');fs.writeFileSync(outFile,'');
  const queue=leads.slice();let done=0,matched=0,withDir=0;
  async function worker(){
    while(queue.length){
      const l=queue.shift();
      const {full,outward}=lastPostcode(l.full_address);
      const city=(l.city||'').trim().toLowerCase(); // fallback disambiguator when no postcode in the list
      await sleep(150);
      const s=await apiR('/search/companies?q='+encodeURIComponent(l.name)+'&items_per_page=20');
      const items=(s.json&&s.json.items)||[];
      let best=null,bestScore=0;
      for(const it of items){
        const ov=nameOverlap(l.name,it.title);
        if(ov<0.34)continue; // require a real name match
        const snipRaw=(it.address_snippet||'');
        const snip=snipRaw.toUpperCase().replace(/\s+/g,'');
        const active=it.company_status==='active';
        const pcMatch=!!full&&snip.includes(full),owMatch=!!outward&&snip.includes(outward);
        const cityMatch=city.length>2&&snipRaw.toLowerCase().includes(city);
        const sc=ov*2+(active?2:0)+(pcMatch?4:0)+(cityMatch?2:0)+(owMatch?1:0);
        if(sc>bestScore){bestScore=sc;best={it,active,pcMatch,cityMatch,ov};}
      }
      let rec={place_id:l.place_id,business_name:l.name,lead_postcode:full,matched:false};
      // accept only an ACTIVE company confirmed by postcode OR a near-exact name (precision over recall)
      const confident=best&&best.it.company_status==='active'&&(best.pcMatch||best.cityMatch||best.ov>=0.9);
      if(best&&confident){
        matched++;
        const num=best.it.company_number;
        await sleep(150);
        const o=await apiR('/company/'+num+'/officers?items_per_page=50');
        const bizLc=norm(l.name);
        const officers=(((o.json&&o.json.items)||[]).filter(x=>keepOfficer(x.officer_role)&&!x.resigned_on)).map(x=>{
          const surname=String(x.name||'').split(',')[0].trim().toLowerCase();
          return {name:x.name,role:x.officer_role,occupation:x.occupation||'',appointed_on:x.appointed_on,
                  likely_principal: surname.length>2 && bizLc.includes(surname)}; // surname in the business name => the owner
        });
        if(officers.length)withDir++;
        rec={place_id:l.place_id,business_name:l.name,lead_postcode:full,matched:true,
             ch_company:best.it.title,ch_number:num,ch_status:best.it.company_status,
             match_postcode:best.pcMatch,match_city:best.cityMatch,name_overlap:+best.ov.toFixed(2),officers};
      } else if(best){ // best candidate too weak — record why, don't assert it
        rec.reason='low_confidence';rec.candidate=best.it.title;rec.candidate_status=best.it.company_status;
        rec.name_overlap=+best.ov.toFixed(2);rec.match_postcode=best.pcMatch;rec.match_city=best.cityMatch;
      } else { rec.reason='no_name_match'; }
      fs.appendFileSync(outFile,JSON.stringify(rec)+'\n');done++;
    }
  }
  await Promise.all(Array.from({length:Math.min(CONC,leads.length)},worker));
  console.log('CH lookup -> '+outFile);
  console.log('  leads: '+leads.length+' | company matched: '+matched+' | with active director(s): '+withDir);
})();
