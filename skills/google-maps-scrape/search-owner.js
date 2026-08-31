#!/usr/bin/env node
/*
 * search-owner.js :: owner-finding SERP cascade (deterministic step, no AI).
 * For each lead runs, per the ICP's owner_query config:
 *   1. BIASED  : "<name> <area> <ST> (\"owner\" OR \"general manager\" OR ...)" -> surfaces BBB / staff-dirs / reviews / LinkedIn when it ranks
 *   2. LINKEDIN: "site:linkedin.com <name> <area> <ST>"                         -> personal profiles naming owner/GM/manager (strongest source)
 *   3. BROAD   : "<name> <area> <ST>"  (only if 1 & 2 both empty)               -> generic email/phone fallback
 *   <ST> = region token; pulled per-lead from `city` via geo.region_from_city (e.g. US "City, ST"),
 *          with geo.region_default as fallback; empty for regionless geos (e.g. UK).
 * Emits ONE record per lead bundling all three result texts PLUS the full lead
 * identity (name, full_address, zip, neighborhood, phone, website) so the
 * downstream AI extraction can ENTITY-MATCH the person to THIS business and
 * reject same-name namesakes from other cities.
 *
 * Query stays lean (name+area) for recall; identity goes to the matcher, not the query.
 *
 * Usage: node search-owner.js --leads <leads.csv> --config <config.json> --out <dir> [--resume] [--concurrency 6]
 * Reads SCRAPER_TECH_SEARCH_KEY from skill .env. Output: <dir>/serp_text.jsonl
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
function arg(n, d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'), CFG=arg('config'), OUT=arg('out','.');
const ENVPATH=arg('env', path.join(__dirname,'.env'));
const CONC=parseInt(arg('concurrency','6'),10);
const RESUME=process.argv.includes('--resume');
const LIMIT=10, RESULT_CAP=10, TEXT_CAP=5500, CALL_TIMEOUT=25000, DELAY=250;
if(!LEADS){console.error('ERROR: --leads required');process.exit(1);}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}

const KEY=loadEnv(ENVPATH).SCRAPER_TECH_SEARCH_KEY;
if(!KEY){console.error('ERROR: SCRAPER_TECH_SEARCH_KEY not in '+ENVPATH);process.exit(1);}
const cfg=CFG&&fs.existsSync(CFG)?JSON.parse(fs.readFileSync(CFG,'utf8')):{};
const GEO=cfg.geo||{};
const OQ=cfg.owner_query||{};
const BIAS_TERMS=OQ.bias_terms||['owner','general manager'];
const USE_LI=OQ.use_linkedin!==false;
const SERP_COUNTRY=(OQ.country||GEO.country||'US').toUpperCase(); // localize Google results; picks up geo.country (e.g. "gb"->"GB")
const REGION_RE=GEO.region_from_city?new RegExp(GEO.region_from_city):null; // pull region/state from `city`; null => no region token (e.g. UK)
const REGION_DEFAULT=GEO.region_default||OQ.state||''; // fallback region token when city has none
const biasGroup='('+BIAS_TERMS.map(t=>'"'+t+'"').join(' OR ')+')';

function search(query){
  const qs=new URLSearchParams({query,country:SERP_COUNTRY,limit:LIMIT,page:0,start:0,hl:'en'}).toString();
  const opts={host:'google-search.scraper.tech',path:'/google-search?'+qs,headers:{'scraper-key':KEY},timeout:CALL_TIMEOUT};
  return new Promise(res=>{const req=https.get(opts,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res(JSON.parse(b));}catch{res({status:'parse_error',results:[]});}});});req.on('error',e=>res({status:'error',results:[],err:e.message}));req.on('timeout',()=>{req.destroy();res({status:'timeout',results:[]});});});
}
// one retry only on a clear network transient (NOT on quota/api fail — retrying that just burns quota)
async function searchRetry(q){let r=await search(q);if(r.status!=='ok'&&/timeout|error|parse/i.test(r.status||'')){await sleep(DELAY*4);r=await search(q);}return r;}
function bundle(query,r){const rs=Array.isArray(r.results)?r.results.slice(0,RESULT_CAP):[];return (`Search query: "${query}"\n\n`+rs.map((x,i)=>`${i+1}. ${x.title||''}\n   ${(x.description||'').trim()}\n   ${x.url||''}`).join('\n')).slice(0,TEXT_CAP);}
function n(r){return Array.isArray(r.results)?r.results.length:0;}
function failed(r){return r.status!=='ok';}

(async()=>{
  const rows=parseCsv(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
  const H=rows.shift();const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
  fs.mkdirSync(OUT,{recursive:true});
  const outFile=path.join(OUT,'serp_text.jsonl');
  let doneIds=new Set();
  if(RESUME&&fs.existsSync(outFile)){
    const prev=fs.readFileSync(outFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const keep=prev.filter(p=>p.status==='ok'||p.status==='no_results');
    doneIds=new Set(keep.map(p=>p.place_id));
    fs.writeFileSync(outFile,keep.map(p=>JSON.stringify(p)).join('\n')+(keep.length?'\n':''));
  } else fs.writeFileSync(outFile,'');
  let targets=leads.filter(l=>!doneIds.has(l.place_id));
  let done=0, hadName=0, recentFails=0, abort=false;
  const queue=targets.slice();
  async function worker(){
    while(queue.length&&!abort){
      const l=queue.shift();
      let st='';
      if(REGION_RE){const m=(l.city||'').match(REGION_RE);st=(m&&(m[1]||m[0]))||'';}
      if(!st)st=REGION_DEFAULT; // region/state token; configurable via geo.region_from_city (+ geo.region_default fallback)
      let hood=(l.neighborhood||l.city||'').replace(/\s*\(.*?\)/,'');
      if(REGION_RE)hood=hood.replace(new RegExp(REGION_RE.source,'i'),'');
      hood=hood.replace(/,\s*$/,'').trim();
      const base=`${l.name} ${hood} ${st}`.replace(/\s+/g,' ').trim();
      await sleep(DELAY);
      const rb=await searchRetry(`${base} ${biasGroup}`);
      let rl={status:'skipped',results:[]};
      if(USE_LI){await sleep(DELAY);rl=await searchRetry(`site:linkedin.com ${base}`.replace(/\s+/g,' ').trim());}
      let rbr={status:'not_needed',results:[]};
      if(n(rb)===0 && n(rl)===0){await sleep(DELAY);rbr=await searchRetry(base);} // broad only as last resort
      const anyOk = n(rb)>0 || n(rl)>0 || n(rbr)>0;
      const allFailed = failed(rb) && (!USE_LI||failed(rl)) && (rbr.status==='not_needed'||failed(rbr));
      const status = allFailed ? ('search_failed:'+(rb.status||'unknown')) : (anyOk?'ok':'no_results');
      fs.appendFileSync(outFile, JSON.stringify({
        place_id:l.place_id, business_name:l.name, icp_type:l.icp_type||'',
        full_address:l.full_address||'', zip:l.zip||'', neighborhood:l.neighborhood||'', city:l.city||'',
        phone:l.phone_number||'', website:l.website||'',
        biased_query:`${base} ${biasGroup}`, biased_text:bundle(`${base} ${biasGroup}`,rb),
        linkedin_text:USE_LI?bundle(`site:linkedin.com ${base}`,rl):'',
        broad_text:n(rbr)>0?bundle(base,rbr):'',
        results_count:n(rb)+n(rl)+n(rbr), status
      })+'\n');
      done++; if(anyOk) hadName++;
      if(status.startsWith('search_failed')){if(++recentFails>=30)abort=true;}else recentFails=0;
      if(done%50===0)process.stderr.write(`. ${done}/${targets.length} (${hadName} with results)\n`);
    }
  }
  await Promise.all(Array.from({length:Math.min(CONC,targets.length)},worker));
  console.log(`\n${abort?'STOPPED early (quota/API failing — re-run with --resume)':'DONE'}: ${done} leads this run -> ${outFile}`);
  console.log(`  with results: ${hadName} | empty: ${done-hadName}`);
})();
