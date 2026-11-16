#!/usr/bin/env node
/* gate-owner-read.js: the SKILL STEP 6 rung-2 yield gate, job-side. On 3 probe batches (0, 40, 80 = 120 leads) the read
 * named 30 (25%, under the ~30% gate). A lead whose site text has a people-type page header (about/team/staff/owner/
 * meet/our-story/leadership/company) or an owner word (owner/founder/president/founded by/co-owner/ceo) held all 30
 * hits in 91 of 120 leads. The regex only ROUTES; it never names anyone (the Haiku reader does that).
 * Remaining batches move to read/orig/; matching items are re-batched (40) into read/batches/batch-1NN-in.json;
 * the rest go to read/routed_to_sweep.json (place_ids) for the rung-3 registry sweep.
 *   node gate-owner-read.js
 */
const fs=require('fs'),path=require('path');
const B=path.join(__dirname,'full/owner/read/batches'),O=path.join(__dirname,'full/owner/read/orig');
const DONE=new Set(['batch-0-in.json','batch-40-in.json','batch-80-in.json']);
const PAGE=/=== [^\n]*(about|team|staff|owner|meet|our-story|who-we-are|leadership|company)[^\n]*===/i;
const WORD=/\b(owner|founder|president|founded by|co-owner|ceo)\b/i;
fs.mkdirSync(O,{recursive:true});
const keep=[],route=[];
for(const f of fs.readdirSync(B).filter(f=>/^batch-\d+-in\.json$/.test(f)&&!DONE.has(f))){
  for(const x of JSON.parse(fs.readFileSync(path.join(B,f),'utf8'))){const t=(x.site_text||'')+'\n'+(x.owner_page_text||'');(PAGE.test(t)||WORD.test(t)?keep:route).push(x);}
  fs.renameSync(path.join(B,f),path.join(O,f));
}
let n=100;for(let i=0;i<keep.length;i+=40)fs.writeFileSync(path.join(B,`batch-${n++}-in.json`),JSON.stringify(keep.slice(i,i+40)));
fs.writeFileSync(path.join(__dirname,'full/owner/read/routed_to_sweep.json'),JSON.stringify(route.map(x=>x.place_id)));
console.log(JSON.stringify({kept_for_read:keep.length,routed_to_sweep:route.length,new_batches:`batch-100..batch-${n-1}`}));
