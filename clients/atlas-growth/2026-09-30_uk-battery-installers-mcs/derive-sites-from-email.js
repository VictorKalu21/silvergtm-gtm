#!/usr/bin/env node
/* Free rung before name-to-domain: a registry-only lead (no website on the MCS register) usually carries an
 * email on its OWN domain. Derive website = http://<email domain> for every non-freemail address, write the
 * rows in the engine lead shape so fetch-sites.js can read them. Freemail rows (gmail, hotmail …) are left
 * for the name-to-domain skill. Output: leads_nowebsite_derived.csv + leads_nowebsite_freemail.csv */
const fs=require('fs'),path=require('path');
function pc(t){const R=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else{if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);R.push(r);r=[];c='';}else if(ch==='\r'){}else c+=ch;}}if(c!==''||r.length){r.push(c);R.push(r);}return R;}
const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const FREE=/^(gmail|googlemail|outlook|hotmail|live|yahoo|ymail|btinternet|btconnect|aol|icloud|me|mac|sky|talktalk|virginmedia|virgin|ntlworld|blueyonder|tiscali|msn|protonmail|proton|mail|email|zoho|gmx|yandex|o2|orange|wanadoo|fsmail|plus|btopenworld|hotmail\.co|outlook\.co|yahoo\.co|live\.co)\.(com|co\.uk|net|uk|org|me|co)$/i;
const RUN=__dirname;const f=rd=>{const R=pc(fs.readFileSync(rd,'utf8')).filter(r=>r.length>1);const H=R.shift();return{H,rows:R.map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]??''])))};};
const nw=f(path.join(RUN,'leads_nowebsite.csv'));
const der=[],free=[];const seen=new Map();
for(const r of nw.rows){const m=(r.email||'').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);if(!m||FREE.test(m[1])){free.push(r);continue;}const d=m[1].replace(/^www\./,'');seen.set(d,(seen.get(d)||0)+1);der.push({...r,website:'http://'+d});}
const w=(fn,rows)=>fs.writeFileSync(path.join(RUN,fn),[nw.H.map(esc).join(','),...rows.map(r=>nw.H.map(h=>esc(r[h])).join(','))].join('\n')+'\n');
w('leads_nowebsite_derived.csv',der);w('leads_nowebsite_freemail.csv',free);
const multi=[...seen.entries()].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([d,n])=>d+'='+n).join(' ');
console.log(`no-website rows ${nw.rows.length} | derived from email domain ${der.length} | freemail (name-to-domain later) ${free.length} | domains shared by >1 lead: ${multi}`);
