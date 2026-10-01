#!/usr/bin/env node
/* Cross-run dedupe vs 2026-09-30_uk-generator-installers-maps (operator waived dedupe vs the FOUNDATION runs; this
 * one is the same vertical family and its 32 ICP leads may be about to enter a campaign). place_id namespaces differ
 * (mcs:<id> vs ChIJ…), so key on registrable website host and normalised phone. Shared hosts are never a key. */
const fs=require('fs'),path=require('path');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const rd=f=>{const R=pc(fs.readFileSync(f,'utf8')).filter(r=>r.length>1);const H=R.shift();return{H,rows:R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]??''])))};};
const SHARED=/facebook|instagram|checkatrade|yell\.com|trustatrader|ratedpeople|mybuilder|linkedin|google|wixsite|godaddysites|business\.site|squarespace|weebly|wordpress\.com/i;
const host=w=>{try{const h=new URL(/^https?:/i.test(w)?w:'http://'+w).hostname.toLowerCase().replace(/^www\./,'');return SHARED.test(h)||!h.includes('.')?'':h;}catch{return '';}};
const phone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('44'))d='0'+d.slice(2);return d.length>=10?d:'';};
const RUN=__dirname, REF=path.join(RUN,'..','2026-09-30_uk-generator-installers-maps','leads_annotated.csv');
const ref=rd(REF), me=rd(path.join(RUN,'leads_clean_qualified.csv'));
const rh=new Set(ref.rows.map(r=>host(r.website)).filter(Boolean)), rp=new Set(ref.rows.map(r=>phone(r.phone_number)).filter(Boolean));
const keep=[],drop=[];for(const r of me.rows){const h=host(r.website),p=phone(r.phone_number);const why=h&&rh.has(h)?'host':p&&rp.has(p)?'phone':'';(why?drop:keep).push({...r,drop_reason:why});}
fs.writeFileSync(path.join(RUN,'leads_netnew.csv'),[me.H.map(esc).join(','),...keep.map(r=>me.H.map(h=>esc(r[h])).join(','))].join('\n')+'\n');
fs.writeFileSync(path.join(RUN,'excluded_dedupe.csv'),[[...me.H,'drop_reason'].map(esc).join(','),...drop.map(r=>[...me.H,'drop_reason'].map(h=>esc(r[h])).join(','))].join('\n')+'\n');
console.log(`ref rows: ${ref.rows.length} (hosts ${rh.size}, phones ${rp.size}) | in: ${me.rows.length} | dropped: ${drop.length} (${drop.filter(d=>d.drop_reason==='host').length} host, ${drop.filter(d=>d.drop_reason==='phone').length} phone) | NET-NEW: ${keep.length}`);
