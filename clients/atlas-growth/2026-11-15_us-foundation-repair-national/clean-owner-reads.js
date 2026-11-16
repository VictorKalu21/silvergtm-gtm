#!/usr/bin/env node
/* clean-owner-reads.js: job-side guard over full/owner/contacts_read.jsonl -> contacts_read_clean.jsonl.
 * Drops parent-company officers that dealer-network sites print on every branch page (merge-owner-reads has no
 * cross-lead check; IMPROVEMENTS 2026-11-16). PARENT_OFFICERS is the list confirmed by hand on this run.
 * A lead left with no contacts is dropped from the file (it goes to the registry sweep like any unnamed lead).
 */
const fs=require('fs'),path=require('path');const D=path.join(__dirname,'full/owner');
const PARENT_OFFICERS=[/^larry janesky$/i];   // Groundworks / Basement Systems founder, on 10 dealer sites
const L=fs.readFileSync(path.join(D,'contacts_read.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
let dropped=0;const out=[];
for(const r of L){const c=r.contacts.filter(x=>{const bad=PARENT_OFFICERS.some(re=>re.test((x.name||'').trim()));if(bad)dropped++;return !bad;});
  if(!c.length)continue;const p=c.find(x=>x.role_bucket==='owner_or_partner')||c.find(x=>x.role_bucket==='gm')||c[0];
  out.push({...r,contacts:c,primary_name:p.name,primary_first_name:p.first_name,primary_role:p.title,primary_is_owner:!!p.is_likely_owner});}
fs.writeFileSync(path.join(D,'contacts_read_clean.jsonl'),out.map(o=>JSON.stringify(o)).join('\n')+'\n');
const owner=out.filter(r=>r.contacts.some(c=>c.role_bucket==='owner_or_partner'||c.role_bucket==='gm')).length;
console.log(JSON.stringify({leads_in:L.length,leads_out:out.length,contacts_dropped:dropped,leads_with_owner_or_gm:owner}));
