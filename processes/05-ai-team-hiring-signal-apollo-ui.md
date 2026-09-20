# 05 · AI-Team + AI-Hiring Signal → Apollo-UI saved searches → scored list

**Outcome:** a deduped, scored company list where each company carries up to four signals — `ai_leader` (Head/VP/Director/Chief of AI or ML on staff), `ai_team` (≥2 people in core/infra AI titles), `hiring_ai_90d` (posted a Tier-1 AI role in the last 90 days), `multi_provider` (posting names 2+ model providers) — as a proxy for 5–6 figures/month of AI spend.

**Why the UI, not the API or a scraper:** the seat is paid but has no API access and no admin. The Apollo UI exposes the same filters the API has (job-posting title/date filters on Companies; title/seniority/size on People), so the list is built with saved searches + CSV export. Never automate the logged-in UI — that is the web-scrape-triage STOP line (auth wall = contract terms bind) and Apollo suspends seats for it. Blitz (process notes in `skills/icp-source-planner/library/blitz-api--ai-team-and-ai-hiring-signal.md`) remains the source for the `multi_provider` signal, which Apollo cannot express.

**When to run:** you want accounts already spending on AI (team on payroll) or about to (hiring), for an AI-cost / AI-infra / model-routing offer.

---

## Inputs

- Apollo paid seat (Basic+). Check **Settings → Credits** for the seat's monthly *export credit* balance before starting — exports, not searches, are what this process spends.
- Size band + geo for the run (worked example below: US, 51–1000).
- Dedupe universe: prior-run lead files for this client.

## Title sets (paste as-is into the title filter; one search per set)

**LEAD (AI leadership — strongest signal):**
`Head of AI`, `VP of AI`, `VP AI`, `VP of Machine Learning`, `VP Machine Learning`, `Head of Machine Learning`, `Head of ML`, `Director of AI`, `Director AI`, `Director of Machine Learning`, `Director Machine Learning`, `Chief AI Officer`, `Chief Data & AI Officer`, `Chief Data and AI Officer`, `Head of Applied AI`

**CORE (AI team ICs):**
`AI Engineer`, `AI/ML Engineer`, `Machine Learning Engineer`, `ML Engineer`, `Applied AI Engineer`, `LLM Engineer`, `Generative AI Engineer`, `ML Scientist`, `AI Researcher`, `Research Scientist AI`, `Applied Scientist`, `NLP Engineer`, `Computer Vision Engineer`, `Speech AI Engineer`, `Voice AI Engineer`

**INFRA (AI platform):**
`AI Infrastructure Engineer`, `ML Infrastructure Engineer`, `ML Platform Engineer`, `AI Platform Engineer`, `ML Systems Engineer`, `MLOps Engineer`, `AI Architect`, `ML Architect`, `Inference Engineer`

**JOBS Tier-1 (hiring trigger — people who touch models/inference):**
`LLM Engineer`, `Generative AI Engineer`, `Applied AI Engineer`, `AI Engineer`, `Machine Learning Engineer`, `ML Engineer`, `AI/ML Engineer`, `Machine Learning Infrastructure Engineer`, `ML Platform Engineer`, `AI Infrastructure Engineer`, `LLM Infrastructure Engineer`, `Inference Engineer`, `MLOps Engineer`

**JOBS Tier-2 (useful, weaker):**
`NLP Engineer`, `Research Engineer AI`, `Applied Scientist`, `Machine Learning Scientist`, `AI Research Engineer`, `Computer Vision Engineer`, `Speech AI Engineer`, `Voice AI Engineer`, `AI Solutions Engineer`, `AI Platform Engineer`, `ML Systems Engineer`, `AI Architect`

## Pipeline

```
Step 0 test export → Step 1 companies-hiring searches → Step 2 people-on-team searches
  → Step 3 merge + dedupe on domain → Step 4 regex title gate + denylist → Step 5 score → Step 6 (optional) Blitz multi-provider tag → handoff
```

### Step 0 — 25-row test export (do this first, it decides the budget)
1. Companies tab → any filter → select 25 rows → **Export** → CSV.
2. Go to **Settings → Credits**. If the *export credits* counter dropped by 25, **company exports cost 1 export credit per company** and the whole run is bounded by the seat's monthly export allowance (typically 1k–4k/month on Basic→Organization). Then run the searches in the priority order below and stop when the allowance is spent; the rest waits for next month or the Blitz route.
3. If the counter did not move, company exports are free on this seat and only the 10,000-rows-per-export cap applies.

Do the same 25-row test on the **People** tab. People rows *with* a verified email consume an export credit; rows without one usually do not. For this process you only need name + title + company + domain, so uncheck email reveal if the export dialog offers it.

### Step 1 — Companies hiring for AI roles (the hiring signal)
Companies tab → **Show Filters** → the **Job Postings** filter group.

| Search name (save it) | Job-posting title keywords | Posted within | Job location | # Employees | Other |
|---|---|---|---|---|---|
| `AI-hire T1 90d US 51-200` | JOBS Tier-1 set | 90 days (pick the closest option the UI offers; note it in the run log) | United States | 51–200 | Industry exclude: *Staffing & Recruiting*, *IT Services & IT Consulting*, *Business Consulting* |
| `AI-hire T1 90d US 201-500` | same | same | same | 201–500 | same |
| `AI-hire T1 90d US 501-1000` | same | same | same | 501–1,000 | same |
| `AI-hire T2 90d US 51-1000` | JOBS Tier-2 set | same | same | 51–1,000 | same — run only if budget remains |

- Sharding by employee band keeps each export under the **10,000-row per-export cap** and gives a size column for free.
- Export columns needed: Company, Website/Domain, # Employees, Industry, HQ, LinkedIn URL. Skip contact columns here.
- If the UI offers "# of job postings", set min **2** for a "building a team" variant and save it separately (`AI-hire T1 90d US 2+`).

Sizing reference from the Blitz probe (2026-09-19): ~33k Tier-1 US postings in 90 days after agency exclusion ≈ 8–12k companies. Expect Apollo to land in the same order of magnitude; the 51–1000 band will be a fraction of that.

### Step 1b — AI-product TAM (AI is the product, or a meaningful part of it)
Companies tab. Two saved searches; **read counts before exporting anything.**

| Filter | `AI-product STRICT` | `AI-product BROAD` |
|---|---|---|
| Keywords → include tags | artificial intelligence, machine learning, generative ai, large language models, llm, natural language processing, conversational ai, ai agents, agentic ai, computer vision, deep learning, ai assistant, ai copilot, ai automation, speech recognition | same |
| Keywords → company description contains | AI-powered, AI platform, AI agent, LLM, generative AI, copilot, machine learning | (empty) |
| Keywords → exclude | staffing, recruiting, consulting, consultancy, agency, outsourcing, training, bootcamp, university, research institute | same |
| Industry → include | Software Development; Technology, Information and Internet; Computer Software; Internet; Information Technology and Services | same |
| Industry → exclude | Staffing and Recruiting; IT Services and IT Consulting; Business Consulting and Services; Marketing Services; Advertising Services; Higher Education | same |
| # Employees | 11–1,000 (shard by band at export) | same |
| HQ location | United States | same |
| Technologies (optional narrowing) | OpenAI, Hugging Face, PyTorch, TensorFlow, LangChain, Pinecone — only if the count is still too big | skip |

STRICT = tags AND description text: separates "built an AI product" from "mentions AI on the about page". Tag matching is keyword-loose; the description condition does the precision work.

**Export order (credits are the constraint):**
1. STRICT count only — no export.
2. STRICT + the Step-1 Job Postings filter stacked on top → AI-product companies also hiring AI roles = **Tier A**. Export this intersection first, sharded by band.
3. STRICT minus the job filter → export the remainder only up to this month's export budget.
4. BROAD → count only (the ceiling). Export only if STRICT is too thin.

UI notes: the Keywords filter has a where-to-match sub-option (tags / name / description) whose label varies by Apollo version — if description matching isn't offered, use tags alone and lean on the industry excludes. Industry names differ slightly from the list above; pick the closest.

### Step 2 — People in AI titles (the team-on-payroll signal)
People tab → filters.

| Search name | Job Titles | Management level | Company # Employees | Person location | Industry exclude |
|---|---|---|---|---|---|
| `AI-lead US 51-1000` | LEAD set | (leave open — titles carry the level) | 51–1,000 | United States | Staffing, IT Services, Business Consulting |
| `AI-team CORE+INFRA US 51-1000` | CORE + INFRA sets | leave open | 51–1,000 | United States | same |

- Turn **off** "include past titles" if the toggle is shown; current role only.
- Export columns: First name, Title, Company, Company domain, Company # employees, Company LinkedIn. Do **not** reveal emails — it costs credits and Apollo will fetch them later for the chosen personas.
- If the people search exceeds 10k rows, shard by the same employee bands as Step 1.
- Blitz probe for reference: 5,575 leadership-title people and 12,960 core/infra people in US 51–1000 companies. Apollo will differ but the ratio (≈1:2.3) should hold.

### Step 3 — Merge + dedupe
- Normalize domain (lowercase, strip `www.`). Dedupe on domain, keep first. Company name is a fallback key only.
- People exports collapse to one row per company with `n_lead`, `n_team`, and the matched titles concatenated.
- Subtract the client's dedupe universe.

### Step 4 — Regex title gate + denylist (the noise filter)
Apollo title matching is keyword-loose the same way Blitz is (`Head of AI` matches "Head of Data Analytics & AI Sales"). Gate every person row with a strict regex before counting it:

```
LEAD:  ^(head|vp|vice president|director|chief)\b.*\b(ai|artificial intelligence|machine learning|ml)\b
TEAM:  \b(ai|ml|machine learning|llm|generative ai|genai|nlp|computer vision|speech|voice ai|mlops|inference)\b.*\b(engineer|scientist|researcher|architect)\b
```
Drop rows where the title also contains `sales|marketing|recruit|talent|account executive|partnerships` — those are people selling AI, not building with it.

Then run the process-01 Step 6 denylist on the company: staffing/consultancy/agency names, aggregator domains, parked domains. `is_agency`-style exclusions in Apollo only catch tagged industries; Cognizant/Deloitte-type consultancies must be dropped by industry and by name.

### Step 5 — Score
| Signal | Points | Source |
|---|---|---|
| `ai_leader` (≥1 regex-passing LEAD person) | 3 | Step 2 |
| `ai_team` (≥2 regex-passing CORE/INFRA people) | 2 | Step 2 |
| `hiring_ai_90d` (in any Step-1 export) | 2 | Step 1 |
| `hiring_2plus` (# postings ≥2 variant) | +1 | Step 1 |
| `multi_provider` (posting names 2+ providers) | 3 | Step 6 |

Tier A ≥ 6, Tier B 3–5, Tier C < 3. A company that appears **only** in a Tier-2 hiring search caps at Tier C.

### Step 6 — Optional: multi-provider tag from Blitz (fits the trial)
Apollo cannot see job-description text. Run the Blitz `tam-by-jobs` pair queries (Tier-1 titles, 90 days, US, non-agency, `description` OpenAI AND `ai_keywords` Anthropic, and the other provider pairs), dedupe on `company.domain`, and left-join onto the Apollo list as `multi_provider=true`. The probe counted 2,090 US postings for the OpenAI×Anthropic pair ≈ 800–1,200 companies, inside the 985-record trial balance. Companies in the Blitz set but not in the Apollo set are net-new — keep them.

### Step 7 — Handoff
Domain-first back into Apollo (or Clay) for contacts. **Personas:** the `ai_leader` person you already have, else CTO / VP Engineering / Head of Platform. Tier A first.

## Scripts
- `skills/icp-source-planner/scripts/blitz-size.mjs` — the sizing probe (1 credit per query) used for the reference numbers above; reuse it to re-size any variant before exporting.
- Merge/dedupe/regex/score: `scripts/csv.js` parser + a per-run script in the client working dir (exports are gitignored `*.csv`).

## Gotchas
- **Export credits are the real cost**, not searches. Run Step 0 before anything else and log the seat's balance in the run log.
- 10,000 rows per export on paid plans — shard by employee band, never by "page".
- Apollo people exports mask nothing in the UI but the API search does; if an admin later grants an API key, the API people search is 0 credits and the organization search is 1 credit per 100 companies — switch to it (endpoints `mixed_people/api_search`, `mixed_companies/search`).
- Job-posting "posted within" options in the UI may not include exactly 90 days; use the closest and record it. Do not go past 180 days — that window pulls reposts and evergreen reqs.
- Never automate the logged-in UI (browser bots, cookie exporters). Saved searches + manual export only.

## Worked example
Not yet run. Record here: date, client, export-credit cost, rows per search, post-gate counts, Tier A/B/C split.
