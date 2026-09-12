// fetch-text.mjs — Stage 5. Re-fetch the content-bearing rows from b2b_verify.jsonl and
// save PRUNED page text so a cheap LLM can read them. Writes <run>/pages.jsonl. Resume-safe.
// Reads config.json (or env CONFIG) only for fetch tuning. Run: node fetch-text.mjs
import fs from "node:fs"; import https from "node:https"; import http from "node:http";
const CFG=JSON.parse(fs.readFileSync(process.env.CONFIG||"config.json","utf8"));
const F=CFG.fetch||{};const CONC=F.concurrency||20,T=F.timeout_ms||12000,RT=F.retry_timeout_ms||20000,CAP=F.text_cap||3000;

const src=fs.readFileSync("b2b_verify.jsonl","utf8").split("\n").filter(x=>x.trim()).map(x=>JSON.parse(x));
const CONTENT=new Set(["b2b","b2b_weak","ambiguous","agency","b2c"]);
const targets=src.filter(o=>CONTENT.has(o.bucket));
const OUT="pages.jsonl";const done=new Set();
if(fs.existsSync(OUT))for(const l of fs.readFileSync(OUT,"utf8").split("\n")){if(l.trim())try{done.add(JSON.parse(l).domain);}catch{}}
const queue=targets.filter(o=>!done.has(o.domain));
console.error(`content ${targets.length}, done ${done.size}, to fetch ${queue.length}`);

function fetchOnce(urlStr,redirects=0,timeout=T){return new Promise((resolve)=>{let u;try{u=new URL(urlStr);}catch{return resolve({err:"badurl"});}
  const lib=u.protocol==="http:"?http:https;const req=lib.get({host:u.hostname,path:u.pathname+u.search,port:u.port||undefined,headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept":"text/html,application/xhtml+xml"},timeout},(res)=>{const{statusCode,headers}=res;
    if([301,302,303,307,308].includes(statusCode)&&headers.location&&redirects<4){res.resume();try{const nu=new URL(headers.location,u);if(nu.protocol!=="https:"&&nu.protocol!=="http:")return resolve({err:"badredir"});return resolve(fetchOnce(nu.toString(),redirects+1,timeout));}catch{return resolve({err:"badredir"});}}
    let body="";res.on("data",d=>{if(body.length<80000)body+=d;});res.on("end",()=>resolve({status:statusCode,body}));});
  req.on("timeout",()=>{req.destroy();resolve({err:"timeout"});});req.on("error",(e)=>resolve({err:e.code||"error"}));});}
function prune(html){let t=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<nav[\s\S]*?<\/nav>/gi," ").replace(/<footer[\s\S]*?<\/footer>/gi," ").replace(/<svg[\s\S]*?<\/svg>/gi," ");
  const title=(t.match(/<title[^>]*>([^<]{0,200})<\/title>/i)||[])[1]||"";
  const desc=(t.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i)||[])[1]||"";
  t=t.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#\d+;/g," ").replace(/\s+/g," ").trim();
  return (`TITLE: ${title} | META: ${desc} | BODY: ${t}`).slice(0,CAP);}

const fh=fs.openSync(OUT,"a");let n=0;const q=[...queue];
async function worker(){while(q.length){const o=q.shift();let r=await fetchOnce(`https://${o.domain}/`);if(r.err==="timeout")r=await fetchOnce(`https://${o.domain}/`,0,RT);
  fs.writeSync(fh,JSON.stringify({domain:o.domain,company:o.company,prior_type:o.prior_type,sig:o.sig||null,text:(r.body&&r.status===200)?prune(r.body):""})+"\n");
  if(++n%50===0)console.error(`  ${n}/${queue.length}`);}}
await Promise.all(Array.from({length:CONC},worker));fs.closeSync(fh);
console.error(`DONE: ${n} pages -> ${OUT}`);
