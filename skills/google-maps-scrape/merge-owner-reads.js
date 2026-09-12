#!/usr/bin/env node
/* merge-owner-reads.js — join the model's batch-N-out.json files back to the leads.
 *   node merge-owner-reads.js --dir <out>/owner/read [--out <out>/owner/contacts_read.jsonl]
 * Enforces the template's fixed guardrails DETERMINISTICALLY (these are checks, not extraction):
 *   evidence must contain the person's first or last name; role_bucket must be in the enum;
 *   name must not contain a role word; dedupe by full name. Everything dropped is counted.
 */
const fs = require('fs'), path = require('path');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const DIR = arg('dir'); if (!DIR) { console.error('usage: --dir <read dir>'); process.exit(1); }
const OUT = arg('out', path.join(DIR, '..', 'contacts_read.jsonl'));
const ENUM = new Set(['owner_or_partner', 'gm', 'marketing', 'sales_manager', 'office_manager', 'other']);
const ROLEWORD = /\b(owner|president|manager|director|founder|ceo|vp|estimator|technician|foreman|inspector|sales|marketing|office|team|staff)\b/i;
// A business is not a person (owner-prompt trap 2). Trade words in a NAME mean a company slipped through.
const TRADEWORD = /\b(foundation|waterproofing|basement|crawl|crawlspace|concrete|repair|systems|services|solutions|company|inc|llc|leveling|mudjacking|resources|construction|contractors?)\b/i;
// Titles the job's owner-prompt EXCLUDES. Pass the vertical's list with --exclude-titles "a,b,c"; this default is the
// foundation-repair block. A contact whose TITLE matches is counted as excluded_by_title and never output.
const EXCL_DEFAULT = 'estimator,technician,installer,crew lead,foreman,laborer,apprentice,field inspector,inspector,production manager,project manager,dispatcher,scheduler,csr,customer care,customer relations,customer service,design specialist,home performance,controller,accountant,bookkeeper,recruiter,purchasing,vp of sales,vice president of sales,sales representative,sales rep,account executive,former,retired';
const EXCL = new RegExp('\\b(' + arg('exclude-titles', EXCL_DEFAULT).split(',').map(t => t.trim()).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
const strip = s => s.replace(/^﻿/, '');
const bdir = path.join(DIR, 'batches');
const ins = fs.readdirSync(bdir).filter(f => /^batch-\d+-in\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
const rep = { batches: ins.length, batches_missing_out: [], leads: 0, leads_with_contacts: 0, contacts: 0, owner_level: 0,
  dropped_no_evidence_name: 0, dropped_bad_bucket: 0, dropped_roleword_name: 0, dropped_tradeword_name: 0, dropped_single_token_name: 0,
  excluded_by_title: 0, dropped_unknown_place_id: 0, by_source: {} };
const lines = [];
for (const f of ins) {
  const outF = path.join(bdir, f.replace('-in.json', '-out.json'));
  const inItems = JSON.parse(strip(fs.readFileSync(path.join(bdir, f), 'utf8')));
  const byId = new Map(inItems.map(i => [i.place_id, i]));
  if (!fs.existsSync(outF)) { rep.batches_missing_out.push(f); continue; }
  let out; try { out = JSON.parse(strip(fs.readFileSync(outF, 'utf8'))); } catch (e) { rep.batches_missing_out.push(f + ' (unparseable)'); continue; }
  for (const [pid, v] of Object.entries(out)) {
    const lead = byId.get(pid); if (!lead) { rep.dropped_unknown_place_id++; continue; }
    rep.leads++;
    const seen = new Set(), kept = [];
    for (const c of (Array.isArray(v.contacts) ? v.contacts : [])) {
      const name = String(c.name || '').trim(); if (!name) continue;
      const toks = name.split(/\s+/).filter(t => t.length > 1);
      const ev = String(c.evidence || '');
      if (!toks.some(t => ev.toLowerCase().includes(t.toLowerCase().replace(/[.,]/g, '')))) { rep.dropped_no_evidence_name++; continue; }
      if (!ENUM.has(c.role_bucket)) { rep.dropped_bad_bucket++; continue; }
      if (ROLEWORD.test(name)) { rep.dropped_roleword_name++; continue; }
      if (TRADEWORD.test(name)) { rep.dropped_tradeword_name++; continue; }
      if (toks.length < 2) { rep.dropped_single_token_name++; continue; }
      if (EXCL.test(String(c.title || ''))) { rep.excluded_by_title++; continue; }
      const k = name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      kept.push({ name, first_name: c.first_name || name.split(/\s+/)[0], title: c.title || '', role_bucket: c.role_bucket,
        is_likely_owner: !!c.is_likely_owner, evidence: ev, source: c.source || '', email: c.email || '' });
      rep.by_source[c.source || '?'] = (rep.by_source[c.source || '?'] || 0) + 1;
    }
    if (kept.some(c => c.role_bucket !== 'other')) rep.leads_with_contacts++;
    rep.contacts += kept.length; rep.owner_level += kept.filter(c => c.role_bucket === 'owner_or_partner').length;
    const primary = kept.find(c => c.role_bucket === 'owner_or_partner') || kept.find(c => c.role_bucket === 'gm') || kept.find(c => c.role_bucket === 'marketing') || kept.find(c => c.role_bucket === 'sales_manager') || kept.find(c => c.role_bucket === 'office_manager') || null;
    lines.push(JSON.stringify({ place_id: pid, business_name: lead.business_name, city: lead.city, state: lead.state, brand_family: lead.brand_family,
      contacts: kept, primary_name: primary?.name || '', primary_first_name: primary?.first_name || '', primary_role: primary?.role_bucket || '',
      primary_is_owner: !!(primary && primary.role_bucket === 'owner_or_partner'), best_send_email: kept.find(c => c.email)?.email || (lead.emails || [])[0] || '',
      confidence: v.confidence || '', needs_review: !primary, source: 'model_read' }));
  }
}
fs.writeFileSync(OUT, lines.join('\n') + (lines.length ? '\n' : ''));
const csvF = OUT.replace(/\.jsonl$/, '.csv');
const esc = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
fs.writeFileSync(csvF, ['place_id,business_name,city,state,primary_name,primary_first_name,primary_role,primary_is_owner,best_send_email,contact_count,contacts_json,confidence']
  .concat(lines.map(l => { const d = JSON.parse(l); return [d.place_id, d.business_name, d.city, d.state, d.primary_name, d.primary_first_name, d.primary_role, d.primary_is_owner, d.best_send_email, d.contacts.length, JSON.stringify(d.contacts), d.confidence].map(esc).join(','); })).join('\n') + '\n');
fs.writeFileSync(path.join(DIR, 'read_report.json'), JSON.stringify(rep, null, 2));
console.log(JSON.stringify(rep));
