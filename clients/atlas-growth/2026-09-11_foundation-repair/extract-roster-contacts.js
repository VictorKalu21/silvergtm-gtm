#!/usr/bin/env node
/* extract-roster-contacts.js :: parse "meet the team" rosters into contacts.
 *
 * These pages render as a flat run of "Name Role Name Role ...", so the parse is anchored on a
 * ROLE VOCABULARY, not on punctuation: find each role phrase, then take the 2-3 capitalised words
 * immediately before it as the name. Anchoring on roles (rather than on names) is what keeps
 * "Design Specialist Marketing" and "Proud Members" out -- a role phrase must be matched
 * verbatim, and the preceding token run must look like a person.
 *
 * Only KEEP roles for THIS offer are emitted (owner/president/GM/marketing/sales/office manager);
 * field and support staff are dropped. Anything that does not parse cleanly goes to review.
 *
 * Usage: node extract-roster-contacts.js --pages owner/owner_pages.jsonl --out owner/roster_contacts.jsonl
 */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const PAGES=arg('pages','owner/owner_pages.jsonl'), OUT=arg('out','owner/roster_contacts.jsonl');
const REVIEW=arg('review','owner/roster_review.jsonl');

// ordered longest-first so "Director of Marketing" wins over "Director"
const ROLES=[
  ['Chief Executive Officer','owner_or_partner'],['Chief Operating Officer','gm'],
  ['Owner & President','owner_or_partner'],['President & Vice President','owner_or_partner'],
  ['President & Co-Founder','owner_or_partner'],['President and Owner','owner_or_partner'],
  ['Co-Owner','owner_or_partner'],['Co Owner','owner_or_partner'],['Co-Founder','owner_or_partner'],
  ['Vice President','gm'],['General Manager','gm'],['Operations Manager','gm'],['Branch Manager','gm'],
  ['Director of Marketing','marketing'],['Marketing Director','marketing'],['Marketing Manager','marketing'],
  ['Director of Sales','sales_manager'],['Sales Manager','sales_manager'],
  ['Office Manager','office_manager'],['Owner','owner_or_partner'],['Founder','owner_or_partner'],
  ['President','owner_or_partner'],['CEO','owner_or_partner'],['COO','gm'],['Proprietor','owner_or_partner'],
  ['Principal','owner_or_partner'],['Integrator','gm'],
];
const FORMER=/\b(former|ex-|retired|previously)\b/i;
/* Branch rosters interleave a LOCATION between the name and the role -- "Paul Phillips Nashville
 * General Manager". A plain 2-word name run therefore captures "Phillips Nashville" and loses the
 * first name, which is a wrong contact, not a partial one. So: capture up to 3 capitalised tokens
 * before the role, then drop a trailing token that is a known city. The city vocabulary is built
 * from our OWN leads' city fields -- 871 leads across the footprint already name these places, so
 * it costs nothing and needs no hardcoded gazetteer. */
const CITY=new Set();
{ const lf=arg('leads','leads_icp.csv');
  if(fs.existsSync(lf)){
    for(const ln of fs.readFileSync(lf,'utf8').split('\n').slice(1)){
      const m=ln.match(/"?([^",]+),\s*[A-Z]{2}"?/);
      if(m) for(const w of m[1].split(/[\s-]+/)) if(/^[A-Z][a-z]{3,}$/.test(w)) CITY.add(w);
    }
  }
  for(const w of ['Nashville','Louisville','Omaha','Wichita','Denver','Kansas','Cincinnati','Dayton','Columbus','Charlotte','Raleigh','Richmond','Hampton','Roads','Peninsula','Central','Northern','Southern','Eastern','Western','Regional','Branch']) CITY.add(w);
}
const TOKENRUN=/((?:[A-Z][a-z'\-]{1,18}|[A-Z]\.|&|O'[A-Z][a-z]+|Mc[A-Z][a-z]+|Van|Von|De|St\.)(?:\s+(?:[A-Z][a-z'\-]{1,18}|[A-Z]\.|&|Van|Von|De))*)\s*$/;
function nameFromRun(before){
  const m=before.match(TOKENRUN); if(!m) return null;
  let toks=m[1].trim().split(/\s+/);
  // drop trailing location tokens ("... Phillips Nashville" -> "Paul Phillips")
  while(toks.length>2 && CITY.has(toks[toks.length-1])) toks.pop();
  /* "&" is ambiguous: it joins a COUPLE ("Melanie & John Chaney") but also joins a TITLE
   * ("President & Owner"). Only treat it as part of a name when no role word is present and the
   * run is short; otherwise fall through to the plain tail logic. A person's name never contains
   * a role word, so that guard also stops a run from swallowing the next person on the roster. */
  const ROLEWORD=/^(Presidents?|Owners?|Founders?|Managers?|Directors?|CEOs?|COOs?|Vice|Chief|Executives?|Officers?|Co|Co-|Sales|Marketing|Office|Operations|Branch|General|Integrator|Principals?|Proprietors?|Partners?|Leadership|Team|Staff)$/i;
  const iRole=toks.findIndex(t=>ROLEWORD.test(t.replace(/[-&]/g,'')));
  if(iRole>=0) toks=toks.slice(iRole+1);            // keep only what follows the last role word
  if(!toks.length) return null;
  if(toks.includes('&')){
    const amp=toks.indexOf('&');
    if(amp>=1 && toks.length<=4 && !toks.some(t=>ROLEWORD.test(t))) return toks.join(' ');
    toks=toks.slice(amp+1);
  }
  if(toks.length>3) toks=toks.slice(-3);
  if(toks.length===3){
    // "First M. Last" keeps 3; otherwise a 3rd leading token is usually a stray word
    if(/^[A-Z]\.$/.test(toks[1])||/^(Van|Von|De|St\.|Mc|Mac)$/.test(toks[1])) return toks.join(' ');
    return toks.slice(1).join(' ');
  }
  return toks.length===2?toks.join(' '):null;
}
const BADNAME=/\b(Meet|Our|The|Team|All|Service|Services|Leadership|Executive|Sales|Design|Production|Office|Staff|Proud|Members|Reviews|Home|About|Contact|Careers|Estimate|Permit|Logistics|Senior|Regional|Customer|Care)\b/;

const acc=[],rev=[];
for(const line of fs.readFileSync(PAGES,'utf8').split('\n')){
  if(!line.trim()) continue;
  const o=JSON.parse(line);
  if(o.status!=='ok'||!o.chars) continue;
  let t=(o.text||'').replace(/\s+/g,' ');
  // start at the roster marker when there is one; nav above it only produces noise
  const mk=t.match(/(Meet (The|Our) Team|Meet The Owners|Leadership|Executive Team|All Owners|Our Team)/i);
  if(mk) t=t.slice(mk.index);
  const found=new Map(); const noisy=[];
  for(const [phrase,bucket] of ROLES){
    const re=new RegExp('\\b'+phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g');
    let m;
    while((m=re.exec(t))){
      const before=t.slice(Math.max(0,m.index-60),m.index);
      const name=nameFromRun(before);
      if(!name){ noisy.push(phrase+' <- '+before.slice(-40)); continue; }
      if(/\b(Presidents?|Owners?|Managers?|Directors?|Founders?|CEO|COO|Officers?|Specialists?|Coordinators?|Leadership|Team)\b/i.test(name)){
        noisy.push(phrase+' <- name contained a role: '+name); continue; }
      if(BADNAME.test(name)) { noisy.push(phrase+' <- '+name); continue; }
      const win=t.slice(Math.max(0,m.index-80),m.index+phrase.length+40);
      if(FORMER.test(win)) continue;
      if(!found.has(name)) found.set(name,{name,title:phrase,role_bucket:bucket,evidence:win.trim().slice(0,200)});
    }
  }
  const contacts=[...found.values()].map(c=>({name:c.name,first_name:c.name.split(/\s+/)[0],
    title:c.title,role_bucket:c.role_bucket,is_likely_owner:c.role_bucket==='owner_or_partner',
    evidence:c.evidence,source:'website_roster',email:''}));
  const rec={place_id:o.place_id,business_name:o.name,city:o.city,state:o.state,
             review_count:o.review_count,brand_family:o.brand_family,url:o.url};
  if(contacts.length) acc.push({...rec,contacts});
  else rev.push({...rec,noisy:noisy.slice(0,6)});
}
fs.writeFileSync(OUT,acc.map(o=>JSON.stringify(o)).join('\n')+(acc.length?'\n':''));
fs.writeFileSync(REVIEW,rev.map(o=>JSON.stringify(o)).join('\n')+(rev.length?'\n':''));
console.log(`rosters parsed: ${acc.length} leads (${acc.reduce((s,o)=>s+o.contacts.length,0)} contacts) -> ${OUT}`);
console.log(`no clean parse: ${rev.length} -> ${REVIEW}`);
