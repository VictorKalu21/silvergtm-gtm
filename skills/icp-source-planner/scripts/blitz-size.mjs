#!/usr/bin/env node
// Blitz API sizing probe — 1 credit per query, returns total_results for each list definition.
// Usage: BLITZ_API_KEY=... node skills/icp-source-planner/scripts/blitz-size.mjs [--run]
// Without --run it prints the queries and exits (no credits spent).
// Key comes from the env only — never paste it into this file (public repo).

const KEY = process.env.BLITZ_API_KEY;
const BASE = 'https://api.blitz-api.ai';

// --- title sets (keyword OR-match inside one include[]; wrap in [brackets] for exact) ---
export const CORE = ['AI Engineer','AI/ML Engineer','Machine Learning Engineer','ML Engineer','Applied AI Engineer',
  'LLM Engineer','Generative AI Engineer','ML Scientist','AI Researcher','Research Scientist AI','Applied Scientist',
  'NLP Engineer','Computer Vision Engineer','Speech AI Engineer','Voice AI Engineer'];
export const INFRA = ['AI Infrastructure Engineer','ML Infrastructure Engineer','ML Platform Engineer','AI Platform Engineer',
  'ML Systems Engineer','MLOps Engineer','AI Architect','ML Architect','Inference Engineer'];
export const LEAD = ['Head of AI','VP of AI','VP AI','VP of Machine Learning','VP Machine Learning','Head of Machine Learning',
  'Director of AI','Director AI','Director of Machine Learning','Director Machine Learning','Chief AI Officer',
  'Chief Data & AI Officer','Chief Data and AI Officer','Head of Applied AI','Head of ML'];
export const T1 = ['LLM Engineer','Generative AI Engineer','Applied AI Engineer','AI Engineer','Machine Learning Engineer',
  'ML Engineer','AI/ML Engineer','Machine Learning Infrastructure Engineer','ML Platform Engineer','AI Infrastructure Engineer',
  'LLM Infrastructure Engineer','Inference Engineer','MLOps Engineer'];
export const T2 = ['NLP Engineer','Research Engineer AI','Research Engineer ML','Applied Scientist','Machine Learning Scientist',
  'AI Research Engineer','Computer Vision Engineer','Speech AI Engineer','Voice AI Engineer','AI Solutions Engineer',
  'AI Platform Engineer','ML Systems Engineer','AI Architect'];
export const PROVIDERS = ['OpenAI','Anthropic','Claude','Gemini','Bedrock','Vertex AI','Mistral','Llama','Cohere'];

const SIZE = ['51-200','201-500','501-1000'];

// Each entry: [label, path, body]. max_results:1 => 1 credit, but total_results covers the whole match set.
export const QUERIES = [
  ['PEOPLE core+infra, worldwide', '/v2/search/people', { people: { job_title: { include: [...CORE, ...INFRA] } }, max_results: 1 }],
  ['PEOPLE core+infra, US', '/v2/search/people', { people: { job_title: { include: [...CORE, ...INFRA] }, location: { country_code: ['US'] } }, max_results: 1 }],
  ['PEOPLE core+infra, US, co 51-1000', '/v2/search/people', { company: { employee_range: SIZE }, people: { job_title: { include: [...CORE, ...INFRA] }, location: { country_code: ['US'] } }, max_results: 1 }],
  ['PEOPLE leadership, worldwide', '/v2/search/people', { people: { job_title: { include: LEAD } }, max_results: 1 }],
  ['PEOPLE leadership, US', '/v2/search/people', { people: { job_title: { include: LEAD }, location: { country_code: ['US'] } }, max_results: 1 }],
  ['PEOPLE leadership, US, co 51-1000', '/v2/search/people', { company: { employee_range: SIZE }, people: { job_title: { include: LEAD }, location: { country_code: ['US'] } }, max_results: 1 }],
  ['JOBS tier1, 30d', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 30 } }, max_results: 1 }],
  ['JOBS tier1, 90d', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 } }, max_results: 1 }],
  ['JOBS tier1, 180d', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 180 } }, max_results: 1 }],
  ['JOBS tier1, 90d, non-agency', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 } }, company: { is_agency: false }, max_results: 1 }],
  ['JOBS tier1+2, 90d, non-agency', '/v2/jobs/search', { job: { title: { include: [...T1, ...T2] }, date_posted: { last_days: 90 } }, company: { is_agency: false }, max_results: 1 }],
  ['JOBS tier1, 90d, US loc, non-agency', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 }, location: { country_code: { include: ['US'] } } }, company: { is_agency: false }, max_results: 1 }],
  ['JOBS tier1, 90d, non-agency, OpenAI AND Anthropic', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 }, description: { include: ['OpenAI'] }, ai_keywords: { include: ['Anthropic'] } }, company: { is_agency: false }, max_results: 1 }],
  ['JOBS tier1, 90d, US, non-agency, OpenAI AND Anthropic', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 }, location: { country_code: { include: ['US'] } }, description: { include: ['OpenAI'] }, ai_keywords: { include: ['Anthropic'] } }, company: { is_agency: false }, max_results: 1 }],
  ['JOBS tier1, 90d, non-agency, any provider in desc', '/v2/jobs/search', { job: { title: { include: T1 }, date_posted: { last_days: 90 }, description: { include: PROVIDERS } }, company: { is_agency: false }, max_results: 1 }],
];

async function call(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'x-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes('--run');
  if (!run) { console.log(`${QUERIES.length} queries (${QUERIES.length} credits). Re-run with --run to execute.`); QUERIES.forEach(([l, p]) => console.log(' -', l, p)); process.exit(0); }
  if (!KEY) { console.error('BLITZ_API_KEY not set'); process.exit(1); }
  for (const [label, path, body] of QUERIES) {
    const r = await call(path, body);
    console.log(`${label.padEnd(58)} total=${r.total_results ?? '-'}  status=${r.status}  remaining=${r.fair_usage?.records_remaining ?? '-'}`);
    await new Promise(res => setTimeout(res, 250)); // trial key = 5 RPS
  }
}
