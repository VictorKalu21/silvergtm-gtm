#!/usr/bin/env node
/* PIPELINE STEP 3 glue: append recover-unrated/leads_clean_qualified.csv to leads_clean_qualified.csv
 * through the MAIN header (drops the recovery file's trailing drop_reason column), asserting zero
 * place_id overlap and that the review_count marker stays unambiguous (blank == unrated track).
 * Same logic as the 2026-09-16 UK foundation PIPELINE.md snippet, minus the generic-recovery file.
 * NOT idempotent — a second run fails the assertion by design. */
const fs = require('fs'), path = require('path');
const RUN = __dirname;
const A = path.join(RUN, 'leads_clean_qualified.csv'), C = path.join(RUN, 'recover-unrated', 'leads_clean_qualified.csv');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const rd=f=>{const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();return{H,rows:R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])))};};
const a=rd(A), c=rd(C);
const A_=new Set(a.rows.map(r=>r.place_id)), o=c.rows.filter(r=>A_.has(r.place_id));
if(o.length){console.error('ASSERT FAILED: '+o.length+' place_ids appear in BOTH main and recover-unrated — nothing written');process.exit(1);}
if(a.rows.some(r=>r.review_count==='')){console.error('ASSERT FAILED: main list already holds a blank review_count row — already appended?');process.exit(1);}
if(c.rows.some(r=>r.review_count!=='')){console.error('ASSERT FAILED: the unrated pass emitted a RATED row');process.exit(1);}
const out=[a.H.map(esc).join(','), ...a.rows.map(r=>a.H.map(h=>esc(r[h])).join(',')), ...c.rows.map(r=>a.H.map(h=>esc(r[h])).join(','))];
fs.writeFileSync(A, out.join('\n')+'\n');
console.log('main '+a.rows.length+' + unrated '+c.rows.length+' = '+(a.rows.length+c.rows.length)+' rows | place_id overlap: 0 (asserted) | unrated track = the '+c.rows.length+' blank-review_count rows');
