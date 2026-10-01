#!/usr/bin/env node
/* Sequential owner-page fetcher. Replaces the worker-pool version, which exited silently
 * (exit 0, promises still pending) — a no-active-handle exit. A plain for-await loop with one
 * in-flight request has no such failure mode and 85 pages costs ~3 minutes. Resumable. */
const fs=require('fs'),https=require('https'),http=require('http');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const IN=arg('in','owner/worklist_t1a.csv'), SITE=arg('site','owner/site_text.jsonl');
const OUT=arg('out','owner/owner_pages.jsonl'), CAP=24000;

function parseCsv(t){const rows=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
 else{if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c==='\r'){}else cur+=c;}}
 if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
function htmlToText(h){
  return h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
          .replace(/<nav[\s\S]*?<\/nav>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ')
          .replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi,'\n').replace(/<br\s*\/?>/gi,'\n')
          .replace(/<[^>]+>/g,' ')
          .replace(/&(nbsp|amp|quot|#39|rsquo|lsquo|ldquo|rdquo|middot|mdash|ndash|times|raquo|laquo);/gi,' ')
          .replace(/&#x?[0-9a-f]+;/gi,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function fetchOnce(url,redir=0){
  return new Promise(resolve=>{
    let done=false; const fin=v=>{if(!done){done=true;resolve(v);}};
    let u; try{u=new URL(url);}catch{return fin({ok:false,err:'badurl'});}
    const lib=u.protocol==='https:'?https:http;
    // hard deadline that KEEPS THE LOOP ALIVE (no unref) so the process can never exit early
    const kill=setTimeout(()=>{try{req.destroy();}catch{} fin({ok:false,err:'deadline'});},20000);
    let req;
    try{
      req=lib.get(u,{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'}},r=>{
        if([301,302,303,307,308].includes(r.statusCode)&&r.headers.location&&redir<3){
          r.resume(); clearTimeout(kill);
          return fetchOnce(new URL(r.headers.location,u).toString(),redir+1).then(fin);
        }
        if(r.statusCode!==200){r.resume();clearTimeout(kill);return fin({ok:false,err:'http'+r.statusCode});}
        let b=''; r.setEncoding('utf8');
        r.on('data',d=>{b+=d; if(b.length>400000){try{req.destroy();}catch{}}});
        r.on('end',()=>{clearTimeout(kill);fin({ok:true,html:b});});
        r.on('error',e=>{clearTimeout(kill);fin({ok:false,err:'res:'+(e.code||e.message)});});
      });
    }catch(e){ clearTimeout(kill); return fin({ok:false,err:'throw:'+(e.code||e.message)}); }
    req.on('error',e=>{clearTimeout(kill);fin({ok:false,err:e.code||e.message});});
  });
}
(async()=>{
  const rows=parseCsv(fs.readFileSync(IN,'utf8')).filter(r=>r.length>1);
  const H=rows.shift(); const leads=rows.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
  const urlOf=new Map();
  for(const l of fs.readFileSync(SITE,'utf8').split('\n')){ if(!l.trim())continue;
    const o=JSON.parse(l);
    const P=[/meet[-_/]?the[-_/]?(owner|team|staff|crew)|meet[-_/]?our|our[-_/]?(owner|team|family|story)|leadership|management[-_/]?team/i,
             /\bowner|founder|principal|president/i];
    let best=null,bp=9;
    for(const pg of (o.pages||[])){ for(let i=0;i<P.length;i++){ if(P[i].test(pg.url||'')&&i<bp){bp=i;best=pg.url;} } }
    if(best) urlOf.set(o.place_id,best);
  }
  const have=new Set();
  if(fs.existsSync(OUT)){
    const keep=fs.readFileSync(OUT,'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.status==='ok'&&r.chars>0);
    fs.writeFileSync(OUT,keep.map(r=>JSON.stringify(r)).join('\n')+(keep.length?'\n':''));
    for(const r of keep) have.add(r.place_id);
  } else fs.writeFileSync(OUT,'');
  const q=leads.filter(l=>urlOf.has(l.place_id)&&!have.has(l.place_id));
  console.log(`resume: ${have.size} already ok | fetching ${q.length}`);
  let ok=0;
  for(let i=0;i<q.length;i++){
    const l=q[i], url=urlOf.get(l.place_id);
    const r=await fetchOnce(url);
    const text=r.ok?htmlToText(r.html).slice(0,CAP):'';
    if(r.ok&&text) ok++;
    fs.appendFileSync(OUT,JSON.stringify({place_id:l.place_id,name:l.name,city:l.city,state:l.state,
      review_count:l.review_count,brand_family:l.brand_family,url,
      status:r.ok?'ok':r.err,chars:text.length,text})+'\n');
    if((i+1)%10===0) console.log(`  ${i+1}/${q.length} (ok ${ok})`);
  }
  console.log(`DONE: ${q.length} fetched this run, ${ok} with text -> ${OUT}`);
})();
