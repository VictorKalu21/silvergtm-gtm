// Push a lead CSV into a HeyReach USER_LIST in batches of 100 via the MCP endpoint.
// Usage: node hr_push_list.js <listId> <csvPath> [--dry]
// CSV columns used: linkedin (profileUrl, required), first_name, last_name, title, company, email, person_city, person_country,
// plus custom fields personalization, perso_strength, list_source, domain.
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const [listId, csvPath, flag] = process.argv.slice(2);
if (!listId || !csvPath) { console.error('usage: node hr_push_list.js <listId> <csvPath> [--dry]'); process.exit(1); }
function parseCsv(t){const r=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\r'){}else if(c==='\n'){row.push(f);r.push(row);row=[];f='';}else f+=c;}}if(f||row.length){row.push(f);r.push(row);}const h=r[0];return r.slice(1).filter(x=>x.length>1).map(x=>{const o={};h.forEach((k,i)=>o[k]=x[i]??'');return o;});}
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const leads = []; let skipped = 0;
for (const r of rows) {
  const url = (r.linkedin || r.profileUrl || '').trim();
  if (!/^https?:\/\//.test(url)) { skipped++; continue; }
  const loc = [r.person_city, r.person_country].filter(Boolean).join(', ');
  leads.push({ profileUrl: url, firstName: r.first_name || '', lastName: r.last_name || '', position: r.title || '', companyName: r.company || '', emailAddress: r.email || '', location: loc,
    customUserFields: [ ['personalization', r.personalization], ['perso_strength', r.perso_strength], ['list_source', r.list_source], ['company_domain', r.domain] ].filter(([,v]) => v).map(([name, value]) => ({ name, value })) });
}
console.log(`rows ${rows.length} | with linkedin ${leads.length} | skipped(no linkedin) ${skipped}`);
if (flag === '--dry') process.exit(0);
const caller = path.join(__dirname, 'hr_call.js'); const tmp = path.join(require('os').tmpdir(), `hr_batch_${process.pid}.json`);
let added = 0, updated = 0, failed = 0;
for (let i = 0; i < leads.length; i += 100) {
  const batch = leads.slice(i, i + 100);
  fs.writeFileSync(tmp, JSON.stringify({ listId: Number(listId), items: batch }));
  const out = execFileSync('node', [caller, 'add_leads_to_list_v2', '@' + tmp], { encoding: 'utf8' });
  let m; try { m = JSON.parse(out.trim().split('\n').pop()); } catch { m = null; }
  const a = m && (m.addedLeadsCount ?? m.added ?? 0), u = m && (m.updatedLeadsCount ?? m.updated ?? 0), f = m && (m.failedLeadsCount ?? m.failed ?? 0);
  added += a || 0; updated += u || 0; failed += f || 0;
  console.log(`batch ${i / 100 + 1}: sent ${batch.length} -> ${m ? `added ${a} updated ${u} failed ${f}` : out.slice(0, 200)}`);
}
fs.unlinkSync(tmp);
console.log(`TOTAL sent ${leads.length} added ${added} updated ${updated} failed ${failed}`);
