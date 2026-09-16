#!/usr/bin/env node
/* merge-contacts.js :: one contacts table from every owner-finding source, deduped per lead.
 * Source precedence (strongest evidence first): the company's own roster page, then a hand-run
 * WebSearch (synthesis + urls), then SERP entity-matched titles, then SERP names whose role was
 * recovered from site text. A person found in more than one source keeps the strongest source's
 * title and is marked corroborated. */
const fs=require('fs');
function arg(n,d){const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;}
const SRC=[['owner/roster_contacts.jsonl','website_roster',1],
           ['owner/contacts_t2.jsonl','websearch',2],
           ['owner/serp_contacts.jsonl','serp',3],
           ['owner/serp_resolved.jsonl','serp+site',4]];
const byLead=new Map();
for(const [f,src,rank] of SRC){
  if(!fs.existsSync(f)) continue;
  for(const l of fs.readFileSync(f,'utf8').split('\n')){
    if(!l.trim()) continue;
    const o=JSON.parse(l);
    if(!byLead.has(o.place_id)) byLead.set(o.place_id,{place_id:o.place_id,business_name:o.business_name,
      city:o.city||'',state:o.state||'',review_count:o.review_count||'',brand_family:o.brand_family||'',
      contacts:[],sources:new Set()});
    const rec=byLead.get(o.place_id);
    rec.sources.add(src);
    for(const c of (o.contacts||[])){
      const key=c.name.toLowerCase().replace(/\s+/g,' ').trim();
      const ex=rec.contacts.find(x=>x._k===key);
      if(ex){ ex.corroborated=true; if(rank<ex._rank){ Object.assign(ex,{...c,_k:key,_rank:rank,corroborated:true}); } }
      else rec.contacts.push({...c,_k:key,_rank:rank,corroborated:false});
    }
  }
}
const RANK={owner_or_partner:1,gm:2,marketing:3,sales_manager:4,office_manager:5,other:6};
const out=[];
for(const rec of byLead.values()){
  rec.contacts.sort((a,b)=>(RANK[a.role_bucket]||9)-(RANK[b.role_bucket]||9)||a._rank-b._rank);
  const p=rec.contacts[0];
  out.push({place_id:rec.place_id,business_name:rec.business_name,city:rec.city,state:rec.state,
    review_count:rec.review_count,brand_family:rec.brand_family,
    sources:[...rec.sources].join('+'),
    contact_count:rec.contacts.length,
    primary_name:p?p.name:'',primary_first_name:p?p.first_name:'',primary_role:p?p.role_bucket:'',
    primary_is_owner:p?!!p.is_likely_owner:false,
    contacts:rec.contacts.map(({_k,_rank,...c})=>c)});
}
out.sort((a,b)=>(parseInt(b.review_count)||0)-(parseInt(a.review_count)||0));
fs.writeFileSync('owner/contacts_all.jsonl',out.map(o=>JSON.stringify(o)).join('\n')+'\n');
const esc=v=>/[",\n]/.test(String(v??''))?'"'+String(v).replace(/"/g,'""')+'"':String(v??'');
const H=['place_id','business_name','city','state','review_count','brand_family','sources','contact_count',
         'primary_name','primary_first_name','primary_role','primary_is_owner',
         'contact2_name','contact2_role','contact3_name','contact3_role'];
const rows=[H.join(',')];
for(const o of out){
  const c=o.contacts;
  rows.push([o.place_id,o.business_name,o.city,o.state,o.review_count,o.brand_family,o.sources,o.contact_count,
    o.primary_name,o.primary_first_name,o.primary_role,o.primary_is_owner,
    c[1]?c[1].name:'',c[1]?c[1].role_bucket:'',c[2]?c[2].name:'',c[2]?c[2].role_bucket:''].map(esc).join(','));
}
fs.writeFileSync('owner/contacts_all.csv',rows.join('\n')+'\n');
console.log(`leads with >=1 contact: ${out.length}`);
console.log(`total contacts: ${out.reduce((s,o)=>s+o.contact_count,0)}`);
console.log(`corroborated across sources: ${out.reduce((s,o)=>s+o.contacts.filter(c=>c.corroborated).length,0)}`);
