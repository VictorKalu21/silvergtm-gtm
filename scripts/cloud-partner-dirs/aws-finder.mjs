// AWS Partner Solutions Finder → full partner list per country (Tier-0 REST, no auth).
// Usage: node aws-finder.mjs "United States" "Canada" "Israel"   (writes data/ai-reserve/aws-<country>.jsonl + aws-partners.csv)
// Method: GET https://api.finder.partners.aws.a2z.com/search?location=<Country>&locale=en&size=30&from=N
//   size caps at 30; `from` pages to message.total; results sort Premier→Advanced→Select→Registered.
import fs from 'node:fs';
import path from 'node:path';
const API = 'https://api.finder.partners.aws.a2z.com/search';
const OUT = process.env.OUT_DIR || 'data/ai-reserve';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const countries = process.argv.slice(2);
if (!countries.length) { console.error('give countries'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function get(params, tries = 4) {
  const u = API + '?' + new URLSearchParams(params).toString();
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()).message; }
    catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-');
const hq = (s) => (s.office_address || []).find(o => (o.location_type || []).includes('Headquarters')) || (s.office_address || [])[0] || {};
const refs = (s) => (s.refiners || []);
const hasRef = (s, prefix) => refs(s).some(r => r.startsWith(prefix));
const flatten = (id, s, country) => {
  const h = hq(s); const services = (s.partner_path?.path_detail || []).find(p => p.path_name === 'Services Path');
  const references = (s.references_nested || s.references || []).map(r => ({ customer: r.customer_name, title: r.title, url: (r.reference_url || '').split('|').pop(), date: r.approval_date, type: r.record_type }));
  return {
    id, name: s.name, literal_name: s.literal_name, website: s.website, domains: (s.domain || []).join(';'),
    query_country: country, hq_country: h.country, hq_state: h.state, hq_city: h.city,
    offices_countries: [...new Set((s.office_address || []).map(o => o.country).filter(Boolean))].join(';'),
    tier: s.current_program_status, services_path_tier: services?.path_tier, customer_type: s.customer_type,
    certs: s.aws_certifications_count, launches: s.customer_launches_count, competencies_count: s.competencies_count,
    programs_count: s.programs_count, reference_count: s.reference_count, casestudy_count: s.references_casestudy_count,
    is_msp_program: (s.program_membership || []).includes('AWS Managed Service Provider'),
    is_solution_provider: (s.program_membership || []).includes('AWS Solution Provider Program'),
    is_reseller: (s.program_membership || []).some(p => /Reseller/.test(p)),
    is_well_architected: (s.program_membership || []).some(p => /Well-Architected/.test(p)),
    ai_competency: (s.competency_membership || []).some(c => /AI|Machine Learning/.test(c)),
    uc_ai: hasRef(s, 'Use Case : AI'), uc_genai_consulting: hasRef(s, 'Use Case : AI : Generative AI Consulting'),
    uc_agentic: hasRef(s, 'Use Case : AI : Agentic'), uc_cloud_ops: hasRef(s, 'Use Case : Cloud Operations'),
    uc_finops: hasRef(s, 'Use Case : Cloud Operations : Cloud Financial Management'),
    uc_migration: hasRef(s, 'Use Case : Migration'), uc_devops: hasRef(s, 'Use Case : DevOps'),
    target_clients: (s.target_client_base || []).join(';'), service_types: (s.professional_service_types || []).join(';'),
    competencies: (s.competency_membership || []).join(';'), programs: (s.program_membership || []).join(';'),
    industries: (s.industry || []).join(';'), is_saas_vendor: s.is_saas_vendor,
    use_cases: refs(s).filter(r => r.startsWith('Use Case : ') && r.split(' : ').length === 2).map(r => r.slice(11)).join(';'),
    reference_customers: references.map(r => r.customer).filter(Boolean).join(';'),
    references_json: JSON.stringify(references), brief: (s.brief_description || '').replace(/\s+/g, ' ').slice(0, 400),
  };
};
const csvEsc = (v) => { if (v == null) return ''; const t = String(v); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const all = [];
for (const country of countries) {
  const file = path.join(OUT, `aws-${slug(country)}.jsonl`);
  const seen = new Set(); let rows = [];
  if (fs.existsSync(file)) { rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse); rows.forEach(r => seen.add(r.id)); }
  const first = await get({ location: country, locale: 'en', size: '30', from: '0' });
  const total = first.total; console.error(`${country}: total ${total}, have ${rows.length}`);
  const fh = fs.openSync(file, 'a');
  const page = (m) => { for (const r of (m.results || [])) { if (seen.has(r._id)) continue; seen.add(r._id); const f = flatten(r._id, r._source, country); rows.push(f); fs.writeSync(fh, JSON.stringify(f) + '\n'); } };
  page(first);
  const offsets = []; for (let f = 30; f < total; f += 30) offsets.push(f);
  for (let i = 0; i < offsets.length; i += 3) {
    const batch = offsets.slice(i, i + 3);
    const res = await Promise.all(batch.map(f => get({ location: country, locale: 'en', size: '30', from: String(f) })));
    res.forEach(page); if (i % 30 === 0) console.error(`${country}: ${rows.length}/${total}`); await sleep(250);
  }
  fs.closeSync(fh); console.error(`${country}: done ${rows.length}`); all.push(...rows);
}
const cols = Object.keys(all[0]).filter(c => c !== 'references_json');
const csv = [cols.join(','), ...all.map(r => cols.map(c => csvEsc(r[c])).join(','))].join('\n');
fs.writeFileSync(path.join(OUT, 'aws-partners.csv'), csv);
console.error(`wrote ${all.length} rows → ${OUT}/aws-partners.csv`);
