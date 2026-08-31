#!/usr/bin/env node
/* Cross-run dedupe (PER CLIENT). Keep rows from --new whose `place_id` is NOT already present
 * in any prior run of the SAME client — so owner-finding/Clay only run on net-new businesses
 * and a lead already in another campaign is never re-contacted.
 *
 * place_id is the primary key (stable across runs); website host is a secondary key. Rows with
 * NO website are KEPT (they can't have been captured-with-a-website before — they feed the
 * no-website recovery track), they're only dropped if their place_id already appears in a prior run.
 *
 * Usage:
 *   node build-netnew.js --new <qualified_or_clay.csv> --client <client-dir> --out <netnew.csv>
 *     --client auto-discovers every prior *.csv with a place_id column UNDER the client dir,
 *     EXCEPT files in --new's own run folder (and --new itself).
 *   node build-netnew.js --new <a.csv> --ref <prior1.csv> --ref <prior2.csv> --out <netnew.csv>
 *     explicit refs instead of (or in addition to) --client.
 */
const fs=require('fs'), path=require('path');
function args(n){const o=[];for(let i=0;i<process.argv.length;i++)if(process.argv[i]==='--'+n)o.push(process.argv[i+1]);return o;}
const NEW=args('new')[0], OUT=args('out')[0], CLIENT=args('client')[0], REFS=args('ref');
if(!NEW||!OUT||(!CLIENT&&!REFS.length)){console.error('ERROR: --new, --out, and (--client OR --ref) required');process.exit(1);}
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const host=u=>{try{return new URL(u).host.replace(/^www\./,'').toLowerCase();}catch{return '';}};
function load(f){const rows=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=rows.shift();return {H,ix:Object.fromEntries(H.map((h,i)=>[h,i])),rows};}
// Memory-lean ref reader: single-pass, captures ONLY place_id + website per row (never the 8KB
// site_text/serp_text cells) so a folder of large clay files doesn't OOM the full-row parser.
function refKeys(f){
  const txt=fs.readFileSync(f,'utf8'); let i=0,cur='',q=false;const H=[];
  for(;i<txt.length;i++){const ch=txt[i];if(q){if(ch==='"'){if(txt[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else{if(ch==='"')q=true;else if(ch===','){H.push(cur);cur='';}else if(ch==='\n'){H.push(cur);cur='';i++;break;}else if(ch==='\r'){}else cur+=ch;}}
  const pidI=H.indexOf('place_id'), webI=H.indexOf('website');
  const pids=[],hosts=[]; if(pidI<0)return {pids,hosts,ok:false};
  let col=0,pid='',web=''; cur='';q=false; const want=c=>c===pidI||c===webI;
  const endField=()=>{if(col===pidI)pid=cur;else if(col===webI)web=cur;cur='';};
  const endRow=()=>{if(pid)pids.push(pid.trim().toLowerCase());if(web)hosts.push(web);pid='';web='';col=0;};
  for(;i<txt.length;i++){const ch=txt[i];
    if(q){if(ch==='"'){if(txt[i+1]==='"'){if(want(col))cur+='"';i++;}else q=false;}else{if(want(col))cur+=ch;}}
    else if(ch==='"')q=true;
    else if(ch===','){endField();col++;}
    else if(ch==='\n'){endField();endRow();}
    else if(ch==='\r'){}
    else if(want(col))cur+=ch;}
  endField();endRow();
  return {pids,hosts,ok:true};
}

// --- collect prior-run reference files ---
const newAbs=path.resolve(NEW), newDir=path.dirname(newAbs);
const refFiles=new Set(REFS.map(r=>path.resolve(r)));
if(CLIENT){
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
    if(e.isDirectory()){if(e.name==='_archive'||e.name==='node_modules')continue;walk(p);}
    // ONLY shipped feeds count as "already captured": clay_*.csv + *_netnew.csv.
    // Intermediates (leads_clean, qualified, excluded*) are NOT contacted leads — ignore them.
    else if(/^clay.*\.csv$|_netnew\.csv$/i.test(e.name)){const ap=path.resolve(p);
      if(ap===newAbs)continue;                    // never the new file
      if(path.dirname(ap)===newDir)continue;       // skip this run's own folder (not "prior")
      refFiles.add(ap);}}};
  walk(path.resolve(CLIENT));
}

// --- build the "already seen" sets from refs (place_id primary, host secondary) ---
const seenPid=new Set(), seenHost=new Set(); let usedRefs=0;
for(const f of refFiles){
  let ref; try{ref=refKeys(f);}catch{continue;}
  if(!ref.ok)continue;                             // only files that look like lead lists (have place_id)
  usedRefs++;
  for(const pid of ref.pids)if(pid)seenPid.add(pid);
  for(const w of ref.hosts){const h=host(w); if(h)seenHost.add(h);}
}

// --- filter the new list ---
const nw=load(NEW);
let dPid=0,dHost=0;
const keep=nw.rows.filter(r=>{
  const pid=(r[nw.ix.place_id]||'').trim().toLowerCase();
  if(pid&&seenPid.has(pid)){dPid++;return false;}
  const h='website' in nw.ix ? host(r[nw.ix.website]) : '';   // secondary: drop only if it HAS a matching domain
  if(h&&seenHost.has(h)){dHost++;return false;}
  return true;                                                 // no-website rows survive on place_id alone
});
fs.writeFileSync(OUT,[nw.H,...keep].map(r=>r.map(esc).join(',')).join('\n')+'\n');
console.log(`ref files used: ${usedRefs} | prior place_ids: ${seenPid.size} | new: ${nw.rows.length}`);
console.log(`dropped: ${dPid} (place_id) + ${dHost} (website host) | NET-NEW kept: ${keep.length} -> ${OUT}`);
