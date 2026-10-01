const fs=require('fs');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const L=f=>{const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();return R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])));};
const ex=L('excluded_officp.csv');
const ni=ex.filter(r=>r.drop_reason==='not_in_icp');
// which google_types dominate the not_in_icp drops?
const t={}; for(const r of ni) for(const x of String(r.google_types||'').split(/\s*[;|]\s*/).filter(Boolean)) t[x]=(t[x]||0)+1;
console.log(`not_in_icp drops: ${ni.length}. Top 25 google_types among them:`);
Object.entries(t).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log(`  ${String(v).padStart(5)}  ${k}`));
// of those, how many have a FOUNDATION-ish NAME (i.e. probably real ICP we are losing)?
const NAME=/foundation|leveling|levelling|mudjack|slabjack|underpin|pier|piering|crawl ?space|basement|waterproof|house level|slab|shoring|stabiliz/i;
const likely=ni.filter(r=>NAME.test(r.name));
console.log(`\n  ...of which ${likely.length} have a foundation-ish NAME (candidate false drops). Sample 20:`);
likely.slice(0,20).forEach(r=>console.log(`   ${String(r.review_count).padStart(4)} rev | ${r.name}  [${r.google_types}]`));
const hi=likely.filter(r=>Number(r.review_count)>=50);
console.log(`\n  ...and ${hi.length} of those clear the 50-review floor — i.e. real, established firms being dropped.`);
