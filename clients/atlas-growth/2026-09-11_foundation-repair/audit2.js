const fs=require('fs');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const L=f=>{const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();return R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])));};
const rescued=new Set(L('recover/leads_clean_qualified.csv').map(r=>r.place_id));
const kept=new Set(L('leads_clean_qualified.csv').map(r=>r.place_id));
const ex=L('excluded_officp.csv');
const NAME=/foundation|leveling|levelling|mudjack|slabjack|underpin|pier|piering|crawl ?space|basement|waterproof|house level|slab|shoring|stabiliz/i;
const resid=ex.filter(r=>!rescued.has(r.place_id)&&!kept.has(r.place_id)&&NAME.test(r.name));
console.log(`main KEEP ${kept.size} + recovery KEEP ${rescued.size} = ${kept.size+rescued.size} qualified`);
console.log(`\nTRUE residual false-drop candidates (foundation-ish name, still dropped): ${resid.length}`);
const byReason={};for(const r of resid)byReason[r.drop_reason]=(byReason[r.drop_reason]||0)+1;
console.log('  by drop_reason:',JSON.stringify(byReason));
const hi=resid.filter(r=>Number(r.review_count)>=50);
console.log(`  clearing the 50-review floor: ${hi.length}`);
console.log('\n  Sample 18 of those >=50 reviews (the ones that actually matter):');
hi.slice(0,18).forEach(r=>console.log(`   ${String(r.review_count).padStart(4)} rev | ${r.drop_reason.padEnd(13)} | ${r.name}  [${r.google_types}]`));
// what types do the >=50 residuals carry, so we know what the allow/recovery list is missing
const t={};for(const r of hi)for(const x of String(r.google_types||'').split(/\s*[;|]\s*/).filter(Boolean))t[x]=(t[x]||0)+1;
console.log('\n  types on those residuals:');
Object.entries(t).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log(`   ${String(v).padStart(4)}  ${k}`));
