const fs=require('fs'),path=require('path');const R=__dirname;
function pc(t){const A=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);A.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);A.push(r);}return A;}
const L=f=>{const p=path.join(R,f);if(!fs.existsSync(p))return[];const A=pc(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);const H=A.shift();return A.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]==null?'':r[i]])));};
const ex=L('excluded_geo.csv');
const ST=/,\s*([A-Z]{2})\b/;
const wr=ex.filter(r=>r.drop_reason==='wrong_region');
const st={};for(const r of wr){const m=(r.city||'').match(ST)||(r.full_address||'').match(ST);const s=m?m[1]:'??';st[s]=(st[s]||0)+1;}
console.log(`wrong_region drops: ${wr.length}  (wrong_country: ${ex.filter(r=>r.drop_reason==='wrong_country').length})`);
console.log('\nstate they actually resolved to:');
Object.entries(st).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`   ${k.padEnd(3)} ${String(v).padStart(4)}`));
const NEIGH=new Set(['NM','AZ','NV','UT','WY','NE','IA','IL','KY','TN','FL','SC','NC','VA','WV','OH','IN','MI','WI','MN','SD','ND','MT','ID','CA','OR','WA','PA','NY','NJ','MD','DE','MA','CT','RI','NH','VT','ME','DC','AK','HI']);
const adj=new Set(['NM','TN','FL','NE','IA','IL','KY','SC','NC','WY','UT','AZ']);
let adjN=0,farN=0;for(const[k,v]of Object.entries(st)){if(k==='??')continue;if(adj.has(k))adjN+=v;else farN+=v;}
console.log(`\n  bordering / immediately adjacent states: ${adjN}`);
console.log(`  genuinely distant US states:            ${farN}`);
console.log('\n  10 examples of distant drops (these are the ones that prove the gate is needed):');
wr.filter(r=>{const m=(r.city||'').match(ST);return m&&!adj.has(m[1]);}).slice(0,10).forEach(r=>console.log(`   ${(r.city||'').padEnd(24)} | ${String(r.review_count).padStart(4)} rev | ${r.name.slice(0,42)}`));
console.log('\n  the 3 wrong_country rows:');
ex.filter(r=>r.drop_reason==='wrong_country').forEach(r=>console.log(`   ${(r.full_address||'').slice(0,80)} | ${r.name.slice(0,34)}`));
