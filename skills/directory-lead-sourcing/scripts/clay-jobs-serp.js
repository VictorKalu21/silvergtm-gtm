// Find companies hiring with "Clay" in the JD, via scraper.tech Google Search. v2: more sites, keywords, pagination.
const https = require('https');
const fs = require('fs');
// Key file: SERP_ENV, else the google-maps-scrape skill's .env beside this one in ~/.claude/skills/.
const path = require('path');
const HOME = process.env.USERPROFILE || process.env.HOME;
const ENV = process.env.SERP_ENV || path.join(HOME, '.claude', 'skills', 'google-maps-scrape', '.env');
const KEY = Object.fromEntries(fs.readFileSync(ENV,'utf8').split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];})).SCRAPER_TECH_SEARCH_KEY;
if(!KEY){console.error('no key');process.exit(1);}

const KW = ['"GTM Engineer"','"Revenue Operations"','"Sales Development"','"Growth Marketing"','"outbound"'];
const SITES = ['boards.greenhouse.io','job-boards.greenhouse.io','jobs.lever.co','jobs.ashbyhq.com','apply.workable.com'];
const PAGES = [0,1];
const QUERIES = [];
for(const s of SITES) for(const k of KW) QUERIES.push(`Clay ${k} site:${s}`);
QUERIES.push('"experience with Clay" outbound site:jobs.ashbyhq.com');
QUERIES.push('"Clay (clay.com)" site:jobs.lever.co');
QUERIES.push('Claygent OR "Clay enrichment" "go-to-market" site:boards.greenhouse.io');

function search(query,page){
  const qs=new URLSearchParams({query,country:'US',limit:30,page,start:page*10,hl:'en'}).toString();
  const opts={host:'google-search.scraper.tech',path:'/google-search?'+qs,headers:{'scraper-key':KEY},timeout:30000};
  return new Promise(res=>{const req=https.get(opts,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{res(JSON.parse(b));}catch{res({status:'parse_error',results:[]});}});});req.on('error',e=>res({status:'error',err:e.message,results:[]}));req.on('timeout',()=>{req.destroy();res({status:'timeout',results:[]});});});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function companyFromUrl(u){let m;
  if(m=u.match(/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_app\?for=)?([^\/?#&]+)/i)) return m[1];
  if(m=u.match(/jobs\.lever\.co\/([^\/?#]+)/i)) return m[1];
  if(m=u.match(/jobs\.ashbyhq\.com\/([^\/?#]+)/i)) return m[1];
  if(m=u.match(/apply\.workable\.com\/([^\/?#]+)/i)) return m[1];
  if(m=u.match(/([a-z0-9-]+)\.workable\.com/i)) return m[1];
  return null;
}
(async()=>{
  const found=new Map(); let calls=0, ok=0, quotaHit=false;
  for(const q of QUERIES){
    if(quotaHit) break;
    for(const p of PAGES){
      const r=await search(q,p); calls++;
      if(r.status==='ok') ok++; else if(/quota|limit|denied|forbidden|payment/i.test((r.status||'')+(r.err||''))){quotaHit=true;console.error('  quota/limit hit:',r.status,r.err||'');break;}
      const rs=Array.isArray(r.results)?r.results:[];
      for(const x of rs){const co=companyFromUrl(x.url||'');if(co){const k=co.toLowerCase();if(!found.has(k))found.set(k,{company:co,url:x.url,title:(x.title||'').slice(0,90)});}}
      if(p===0) console.error(`[${calls}] ${r.status} | ${rs.length} | "${q.slice(0,46)}"`);
      await sleep(800);
      if(rs.length<3) break; // no point paginating a thin query
    }
  }
  const arr=[...found.values()];
  const esc=v=>{v=(v==null)?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  fs.writeFileSync(process.env.OUT || 'clay_jobs_serp.csv',['company,title,url'].concat(arr.map(r=>[r.company,r.title,r.url].map(esc).join(','))).join('\n'));
  console.error(`\nDONE. ${ok}/${calls} ok${quotaHit?' (stopped on quota)':''}. ${arr.length} unique companies -> clay_jobs_serp.csv`);
})();
