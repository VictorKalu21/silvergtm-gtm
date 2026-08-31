#!/usr/bin/env node
/* apply-recovered-websites.js :: close the no-website recovery loop.
 * Fills the `website` column for no-website leads by recovering the business's OWN domain
 * from the serp_text we ALREADY pulled for owner-finding (no new search, no website-finder
 * service). Entity-matched to the business name so trade-orgs/magazines/directories are rejected.
 * After this, re-run fetch-sites.js + build-clay-csv.js and the recovered leads look identical
 * to normal with-website leads (website + site_text + serp_text).
 *
 * Usage:
 *   node apply-recovered-websites.js --leads <leads.csv> --serp <owner-dir-or-serp_text.jsonl> --out <leads_recovered.csv>
 *   # optional: --recovered <clay_export.csv>  (a CSV with place_id + website/best_website cols,
 *   #   e.g. exported from Clay's best_website column — takes precedence over local extraction)
 *
 * Adds two columns: website (filled if blank) + website_recovered (true|"") + website_source (serp|export).
 * Leaves a lead blank when no domain clearly belongs to it (those stay phone-only / for the Clay nano to catch).
 */
const fs=require('fs'), path=require('path');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const LEADS=arg('leads'), SERP=arg('serp'), REC=arg('recovered'), OUT=arg('out');
if(!LEADS||!OUT||(!SERP&&!REC)){console.error('ERROR: --leads, --out, and (--serp OR --recovered) required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const host=u=>{try{return new URL(u).host.replace(/^www\./,'').toLowerCase();}catch{return '';}};

const DIR_RE=/(facebook|instagram|yelp|google|bbb\.org|mapquest|linkedin|nextdoor|angi|thumbtack|houzz|tripadvisor|youtube|tiktok|birdeye|chamberofcommerce|manta|zoominfo|indeed|zocdoc|healthgrades|wikipedia|amazon|pinterest|glassdoor|crunchbase|dnb\.com|buzzfile|opencorporates|homes\.com|realtor|loopnet|apartments\.com|\.gov|\.edu)/i;
const STOP=new Set(['the','and','for','llc','inc','co','corp','company','services','service','az','arizona','phoenix','scottsdale','peoria','glendale','anthem','group','center','clinic','of','your','a']);
function tokens(name){return (name||'').toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=4&&!STOP.has(t));}
function hostStem(h){return h.replace(/\.[a-z.]+$/,'').replace(/[^a-z0-9]/g,'');}

// extract the OWN domain for a business from its serp text, entity-matched by name token
function recoverFromSerp(name, serpRec){
  if(!serpRec)return '';
  const txt=[(serpRec.biased_text||''),(serpRec.broad_text||''),(serpRec.linkedin_text||'')].join(' ');
  const urls=txt.match(/https?:\/\/[^\s)"']+/g)||[];
  const hosts=[...new Set(urls.map(host).filter(h=>h&&h.includes('.')&&!DIR_RE.test(h)))];
  if(!hosts.length)return '';
  const toks=tokens(name); if(!toks.length)return '';
  let best='',bestScore=0;
  for(const h of hosts){const stem=hostStem(h);
    let score=0;for(const t of toks){if(stem.includes(t))score+=t.length;}        // host contains a name token
    if(score>bestScore){bestScore=score;best=h;}}
  return bestScore>=4?best:'';   // require at least one distinctive token match
}

// --- load serp records by place_id (if --serp) ---
let serpMap=new Map();
if(SERP){
  const f=fs.statSync(SERP).isDirectory()?path.join(SERP,'serp_text.jsonl'):SERP;
  for(const line of fs.readFileSync(f,'utf8').trim().split(/\r?\n/).filter(Boolean)){try{const o=JSON.parse(line);serpMap.set(o.place_id,o);}catch{}}
}
// --- load Clay export map (if --recovered) ---
let recMap=new Map();
if(REC){const rows=pc(fs.readFileSync(REC,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
  const wi=('best_website' in ix)?ix.best_website:ix.website;
  for(const r of rows){const pid=r[ix.place_id]; const w=(r[wi]||'').trim(); if(pid&&w)recMap.set(pid,w.startsWith('http')?host(w):w.replace(/^www\./,''));}}

// --- apply ---
const rows=pc(fs.readFileSync(LEADS,'utf8')).filter(r=>r.length>1);const H=rows.shift();const ix=Object.fromEntries(H.map((h,i)=>[h,i]));
if(!('website' in ix)){H.push('website');ix.website=H.length-1;}
H.push('website_recovered','website_source'); const wr=H.length-2, ws=H.length-1;
const ni=ix.name!=null?ix.name:ix.business_name;
let recovered=0,already=0,still=0;
const out=[H.map(esc).join(',')];
for(const r of rows){
  while(r.length<H.length)r.push('');
  const cur=(r[ix.website]||'').trim();
  if(cur){already++;out.push(r.map(esc).join(','));continue;}
  const pid=r[ix.place_id];
  let dom = recMap.get(pid) || recoverFromSerp(r[ni], serpMap.get(pid));
  if(dom){r[ix.website]='https://'+dom.replace(/^https?:\/\//,'');r[wr]='true';r[ws]=recMap.has(pid)?'export':'serp';recovered++;}
  else{still++;}
  out.push(r.map(esc).join(','));
}
fs.writeFileSync(OUT,out.join('\n')+'\n');
console.log(`leads: ${rows.length} | already had website: ${already} | RECOVERED: ${recovered} | still blank (phone-only): ${still}`);
console.log(`-> ${OUT}`);
console.log(`next: node fetch-sites.js --in ${OUT} --out <dir> --limit ${rows.length+10}  then  node build-clay-csv.js --leads ${OUT} --dir <dir> --out <clay.csv>`);
