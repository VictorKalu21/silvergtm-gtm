#!/usr/bin/env node
/* prep-website-recovery.js :: cascade prep for no-website leads.
 *  (1) email-domain inference (deterministic)  (2) gather SERP candidate URLs
 *  (3) dedicated "<name> <city> <ST>" search for thin-SERP leads  (4) emit LLM batches.
 * Usage: node prep-website-recovery.js --leads <leads_city.csv> --serp <owner/serp_text.jsonl> \
 *          --site <owner/site_text.jsonl> --config <config.json> --out <recovery_dir> [--batch 80]
 * Reads SCRAPER_TECH_SEARCH_KEY from <SKILL>/.env.
 */
const fs=require('fs'), path=require('path'), https=require('https');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'),SERP=arg('serp'),SITE=arg('site'),CFG=arg('config'),OUT=arg('out'),BATCH=parseInt(arg('batch','80'),10);
const ENV=arg('env',path.join(__dirname,'.env'));
if(!LEADS||!SERP||!OUT){console.error('ERROR: --leads --serp --out required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function loadEnv(f){const o={};if(fs.existsSync(f))for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const KEY=loadEnv(ENV).SCRAPER_TECH_SEARCH_KEY;
const cfg=CFG&&fs.existsSync(CFG)?JSON.parse(fs.readFileSync(CFG,'utf8')):{};
const REGION_RE=cfg.geo&&cfg.geo.region_from_city?new RegExp(cfg.geo.region_from_city):null;
const REGION_DEFAULT=(cfg.geo&&cfg.geo.region_default)||'';
const FREE_MAIL=/@(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn|protonmail)\./i;
const DIR=/(facebook|instagram|yelp|google|bbb\.org|mapquest|linkedin|nextdoor|angi|thumbtack|houzz|tripadvisor|youtube|tiktok|birdeye|chamberofcommerce|manta|zoominfo|indeed|wikipedia|amazon|pinterest|glassdoor|crunchbase|dnb\.com|buzzfile|opencorporates|yellowpages|superpages|expertise\.com|wheree\.com|localsearch|sbcglobal\.net|comcast\.net|att\.net|aol\.com|verizon\.net|\.gov|\.edu|\.[a-z]{2}\.us$)/i;
const host=u=>{try{return new URL(u).host.replace(/^www\./,'').toLowerCase();}catch{return '';}};
const {isSharedHost}=require('./shared-hosts'); // one shared-host list across the engine; DIR above stays as the SERP-text directory superset
const urlsIn=t=>[...new Set((String(t||'').match(/https?:\/\/[^\s)"']+/g)||[]).map(host).filter(h=>h&&h.includes('.')&&!DIR.test(h)&&!isSharedHost(h)))];
// generic/industry stopwords dropped when tokenizing a business name for the entity-match guard
const NAME_STOP=new Set(['security','services','service','school','schools','dental','clinic','clinics','group','ltd','llc','inc','co','company','the','and','of','protection','protective','patrol','alarm','alarms','guard','guards','guarding','systems','system','solutions','solution','agency','agencies','associates','enterprises','enterprise','corp','corporation','international','national','professional','plc','pllc','llp']);
const nameTokens=name=>String(name||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=4&&!NAME_STOP.has(w));
// host stem = the part before the TLD (dots removed), e.g. finestprotectionsecurity from finestprotectionsecurity.com
const hostStem=domain=>String(domain||'').toLowerCase().replace(/\.[a-z]{2,}$/,'').replace(/\./g,'');
// accept only if a distinctive (len>=4) business-name token is a substring of the host stem (or vice-versa)
const nameMatchesDomain=(name,domain)=>{const stem=hostStem(domain);if(!stem)return false;return nameTokens(name).some(t=>stem.includes(t)||t.includes(stem));};
const emailDomain=(t,name)=>{const e=(String(t||'').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[]).filter(x=>!FREE_MAIL.test(x)&&!/\.(png|jpe?g|gif|webp)$/i.test(x));for(const x of e){const d=x.split('@')[1].toLowerCase();if(DIR.test(d)||isSharedHost(d))continue;if(nameMatchesDomain(name,d))return d;}return '';};

function search(query){
  const qs=new URLSearchParams({query,country:(cfg.geo&&cfg.geo.country||'US').toUpperCase(),limit:10,page:0,start:0,hl:'en'}).toString();
  const opts={host:'google-search.scraper.tech',path:'/google-search?'+qs,headers:{'scraper-key':KEY},timeout:25000};
  return new Promise(res=>{const req=https.get(opts,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res(JSON.parse(b));}catch{res({results:[]});}});});req.on('error',()=>res({results:[]}));req.on('timeout',()=>{req.destroy();res({results:[]});});});
}

(async()=>{
  const serp=new Map();
  for(const ln of fs.readFileSync(SERP,'utf8').trim().split(/\r?\n/).filter(Boolean)){try{const o=JSON.parse(ln);serp.set(o.place_id,o);}catch{}}
  const siteEmail=new Map();
  if(SITE&&fs.existsSync(SITE))for(const ln of fs.readFileSync(SITE,'utf8').trim().split(/\r?\n/).filter(Boolean)){try{const o=JSON.parse(ln);siteEmail.set(o.place_id,(o.emails||[]).join(' '));}catch{}}

  const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);
  const H=rows.shift(); const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
  const noSite=rows.filter(r=>!String(r[ix.website]||'').trim());
  console.error(`leads: ${rows.length} | no Maps website: ${noSite.length}`);

  fs.mkdirSync(OUT,{recursive:true});
  const resolved=[['place_id','website','source']];
  const forLLM=[];
  let viaEmail=0, viaSearch=0;
  for(const r of noSite){
    const pid=r[ix.place_id], name=r[ix.name], city=String(r[ix.city]||'');
    const s=serp.get(pid)||{};
    const blob=[s.biased_text,s.linkedin_text,s.broad_text,siteEmail.get(pid)].join(' ');
    const ed=emailDomain(blob,name);
    if(ed && !DIR.test(ed)){resolved.push([pid,'https://'+ed,'emaildomain']);viaEmail++;continue;}
    let cands=urlsIn([s.biased_text,s.linkedin_text,s.broad_text].join(' '));
    if(cands.length<3 && KEY){
      const m=city.match(REGION_RE||/$^/); const st=(m&&(m[1]||m[0]))||REGION_DEFAULT;
      const cityName=city.replace(/,\s*[A-Z]{2}\s*$/,'').trim();
      const r2=await search(`"${name}" ${cityName} ${st}`.replace(/\s+/g,' ').trim());
      const extra=(r2.results||[]).map(x=>host(x.url)).filter(h=>h&&!DIR.test(h));
      cands=[...new Set([...cands,...extra])]; viaSearch++;
    }
    forLLM.push({place_id:pid,name,city,candidates:cands.slice(0,12)});
  }
  fs.writeFileSync(path.join(OUT,'resolved_emaildomain.csv'),resolved.map(r=>r.map(esc).join(',')).join('\n')+'\n');
  const needLLM=forLLM.filter(l=>l.candidates.length>0);
  const zero=forLLM.length-needLLM.length;
  let bi=0;
  for(let i=0;i<needLLM.length;i+=BATCH){
    fs.writeFileSync(path.join(OUT,`batch_${String(bi).padStart(3,'0')}.jsonl`), needLLM.slice(i,i+BATCH).map(o=>JSON.stringify(o)).join('\n')+'\n');
    bi++;
  }
  console.log(`resolved by email-domain: ${viaEmail} | dedicated searches run: ${viaSearch}`);
  console.log(`LLM batches: ${bi} (${needLLM.length} leads) | zero-candidate (will drop): ${zero}`);
  console.log(`-> ${OUT}`);
})();
