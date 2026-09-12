// fetch-triage.mjs — Stage 4. Tier-1 FREE homepage fetch + heuristic bucketing.
// Reads config.json (or env CONFIG). Fetches config.prospects_csv[config.domain_col],
// strips to text, scores B2B/B2C/agency keyword signals, buckets each row, and writes
// <run>/b2b_verify.jsonl. The bucket is only a ROUTER (has-content vs dead/blocked/thin),
// never the B2B verdict — that comes from the LLM pass in stage 6. Resume-safe.
// Run:  node fetch-triage.mjs        (cwd = your run folder that holds config.json)
import fs from "node:fs"; import https from "node:https"; import http from "node:http";

const CFG = JSON.parse(fs.readFileSync(process.env.CONFIG || "config.json", "utf8"));
const F = CFG.fetch || {}; const CONC = F.concurrency || 20, T = F.timeout_ms || 12000, RT = F.retry_timeout_ms || 20000;
function parseCSV(t){const rows=[];let f=[],cur="",q=false;for(let i=0;i<t.length;i++){const c=t[i];const Q='"';if(q){if(c===Q){if(t[i+1]===Q){cur+=Q;i++;}else q=false;}else cur+=c;}else{if(c===Q){q=true;}else if(c===","){f.push(cur);cur="";}else if(c==="\n"){f.push(cur);rows.push(f);f=[];cur="";}else if(c==="\r"){}else cur+=c;}}if(cur!==""||f.length){f.push(cur);rows.push(f);}return rows;}

const rows = parseCSV(fs.readFileSync(CFG.prospects_csv,"utf8"));
const hdr = rows.shift(); const idx = Object.fromEntries(hdr.map((h,i)=>[h,i]));
const all = rows.filter(r=>r[0]&&r[0].trim()).map(r=>({
  domain:(r[idx[CFG.domain_col]]||"").trim().toLowerCase(),
  company:(r[idx[CFG.company_col]]||"").trim(),
  prior_type:(r[idx.company_type]!=null?r[idx.company_type]:"")||"" }));
const OUT="b2b_verify.jsonl"; const done=new Set();
if(fs.existsSync(OUT))for(const l of fs.readFileSync(OUT,"utf8").split("\n")){if(l.trim())try{done.add(JSON.parse(l).domain);}catch{}}
const queue=all.filter(e=>e.domain&&!done.has(e.domain));
console.error(`total ${all.length}, done ${done.size}, to fetch ${queue.length}`);

function fetchOnce(urlStr,redirects=0,timeout=T){return new Promise((resolve)=>{let u;try{u=new URL(urlStr);}catch{return resolve({err:"badurl"});}
  const lib=u.protocol==="http:"?http:https;const req=lib.get({host:u.hostname,path:u.pathname+u.search,port:u.port||undefined,headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"},timeout},(res)=>{const{statusCode,headers}=res;
    if([301,302,303,307,308].includes(statusCode)&&headers.location&&redirects<4){res.resume();try{const nu=new URL(headers.location,u);if(nu.protocol!=="https:"&&nu.protocol!=="http:")return resolve({err:"badredir"});return resolve(fetchOnce(nu.toString(),redirects+1,timeout));}catch{return resolve({err:"badredir"});}}
    let body="";res.on("data",d=>{if(body.length<60000)body+=d;});res.on("end",()=>resolve({status:statusCode,body}));});
  req.on("timeout",()=>{req.destroy();resolve({err:"timeout"});});req.on("error",(e)=>resolve({err:e.code||"error"}));});}

const CF=/just a moment|enable javascript|cf-browser-verification|challenge-platform|attention required/i;
function textOf(html){let t=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ");
  const title=(t.match(/<title[^>]*>([^<]{0,200})<\/title>/i)||[])[1]||"";
  const desc=(t.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i)||[])[1]||"";
  const og=(t.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,300})/i)||[])[1]||"";
  t=t.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  return {title,text:(title+" "+desc+" "+og+" "+t).slice(0,9000).toLowerCase()};}
const B2B=[/book a demo/,/request a demo/,/schedule a demo/,/get a demo/,/for teams\b/,/for business(es)?\b/,/for enterprise/,/enterprise[- ]grade/,/\bsaas\b/,/\bapi\b/,/integrations?\b/,/\bsso\b/,/soc ?2/,/\bhipaa\b/,/per (user|seat)/,/\/mo\b/,/per month/,/trusted by/,/\bg2\b/,/\bworkflow/,/onboard(ing)? your/,/sales team/,/\bcrm\b/,/\bb2b\b/,/talk to sales/,/contact sales/,/get a quote/,/\bplatform\b/,/automate/,/dashboard/,/\bworkspace\b/,/free trial/,/start free/,/pricing/];
const B2C=[/add to cart/,/add to bag/,/add to basket/,/free shipping/,/shop now\b/,/\bshop all\b/,/my cart/,/view cart/,/checkout/,/subscribe & save/,/free returns/,/\bin stock\b/,/\bsold out\b/,/\bbestseller/,/gift card/,/\bcart\b/];
const AGENCY=[/our services\b/,/services we (offer|provide)/,/our work\b/,/case stud(y|ies)/,/our clients\b/,/portfolio\b/,/we help (brands|companies|businesses|startups)/,/full[- ]service/,/\bagency\b/,/our process\b/,/get in touch/,/we specialize in/,/digital marketing agency/,/we build\b/,/we design\b/];
const PRICE=/[$€£]\s?\d{1,4}(\.\d{2})?/g;
function score(t){const hit=a=>a.reduce((n,rx)=>n+(rx.test(t)?1:0),0);return{b:hit(B2B),c:hit(B2C),a:hit(AGENCY),prices:(t.match(PRICE)||[]).length};}
function bucket(s,len){if(len<120)return"thin";if(s.c>=3||(s.c>=2&&s.prices>=4))return"b2c";if(s.a>=3&&s.b<=2)return"agency";if(s.b>=3)return"b2b";if(s.b>=1&&s.b>s.c&&s.b>=s.a)return"b2b_weak";return"ambiguous";}

const fh=fs.openSync(OUT,"a");let processed=0,ok=0;const q=[...queue];
async function worker(){while(q.length){const e=q.shift();let r=await fetchOnce(`https://${e.domain}/`);if(r.err==="timeout")r=await fetchOnce(`https://${e.domain}/`,0,RT);
  let rec={domain:e.domain,company:e.company,prior_type:e.prior_type};
  if(r.err){rec.status="ERR:"+r.err;rec.bucket="dead";}
  else if(r.status!==200){rec.status=r.status;rec.bucket=(r.status===403||CF.test(r.body||""))?"blocked":"http_"+r.status;}
  else if(CF.test(r.body)){rec.status=200;rec.bucket="blocked";}
  else{const x=textOf(r.body);const s=score(x.text);rec.status=200;rec.title=x.title.slice(0,120);rec.sig=s;rec.bucket=bucket(s,x.text.length);ok++;}
  fs.writeSync(fh,JSON.stringify(rec)+"\n");processed++;if(processed%50===0)console.error(`  ${processed}/${queue.length} (${ok} ok)`);}}
await Promise.all(Array.from({length:CONC},worker));fs.closeSync(fh);
console.error(`DONE: ${processed} processed -> ${OUT}`);
