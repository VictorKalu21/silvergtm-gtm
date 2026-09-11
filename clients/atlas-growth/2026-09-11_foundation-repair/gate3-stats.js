const fs=require('fs'), path=require('path'); const R=__dirname;
function pc(t){const A=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);A.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);A.push(r);}return A;}
const L=f=>{const p=path.join(R,f); if(!fs.existsSync(p))return [];const A=pc(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);const H=A.shift();return A.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])));};
const fin=L('leads_annotated.csv'), ex=L('excluded_officp.csv');
const ST=/,\s*([A-Z]{2})\b/;
const st={}; for(const r of fin){const m=(r.city||'').match(ST); const s=m?m[1]:'??'; st[s]=(st[s]||0)+1;}
console.log('FINAL per state:'); Object.entries(st).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`   ${k.padEnd(3)} ${String(v).padStart(4)}`));
const anchors={TX:20,GA:12,AL:11,MS:10,CO:10,MO:9,LA:9,AR:9,OK:8,KS:7,TN:2,FL:1};
console.log('\nrows per metro anchor (thin = a coverage gap, not a small market):');
Object.entries(anchors).forEach(([k,a])=>{const v=st[k]||0;console.log(`   ${k.padEnd(3)} ${String(v).padStart(4)} / ${String(a).padStart(2)} anchors = ${(v/a).toFixed(1)}/anchor${v/a<3?'   <-- THIN':''}`);});
// true residual false drops after the separator fix
const kept=new Set(fin.map(r=>r.place_id));
const resc=new Set(L('recover/leads_clean_qualified.csv').map(r=>r.place_id));
const NAME=/foundation|leveling|mudjack|slabjack|underpin|pier|crawl ?space|basement|waterproof|house level|shoring|stabiliz/i;
const resid=ex.filter(r=>!kept.has(r.place_id)&&!resc.has(r.place_id)&&NAME.test(r.name)&&Number(r.review_count)>=50);
console.log(`\nresidual false-drop candidates (foundation-ish name, >=50 reviews, still dropped): ${resid.length}`);
const br={}; for(const r of resid)br[r.drop_reason]=(br[r.drop_reason]||0)+1;
console.log('   by reason:',JSON.stringify(br));
resid.slice(0,10).forEach(r=>console.log(`   ${String(r.review_count).padStart(4)} | ${r.drop_reason.padEnd(12)} | ${r.name}  [${(r.google_types||'').slice(0,60)}]`));
// review floor sensitivity on the CATEGORY-qualified population
const tooSmall=ex.filter(r=>r.drop_reason==='too_small');
console.log(`\nreview-floor sensitivity (rows that passed the category allow):`);
for(const t of [10,20,30,50]){const n=fin.length+tooSmall.filter(r=>Number(r.review_count)>=t&&Number(r.review_count)<50).length;console.log(`   floor ${String(t).padStart(2)} -> ~${n} rows`);}
const cr=JSON.parse(fs.readFileSync(path.join(R,'collapse_report.json'),'utf8'));
console.log(`\ncollapse: spend ${cr.spend_rows_before} -> ${cr.spend_rows_after} (${cr.spend_rows_saved} saved) | multi-loc domains ${cr.multi_location_domains}`);
console.log('brand_family:',JSON.stringify(cr.brand_family));
