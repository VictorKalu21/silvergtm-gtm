---
source: BlitzAPI (blitz-api.ai) — LinkedIn-derived people / company / job-posting search
vertical: Companies with an in-house AI team (proxy for 5–6 figures/mo AI spend) + companies hiring AI roles
verdict: partial
last_validated: 2026-09-19
access: paid API, `x-api-key` header, base https://api.blitz-api.ai/v2 (docs: https://docs.blitz-api.ai/llms.txt)
dispatch: web-scrape-triage (API pull) → Apollo handoff
cost_tier: paid (trial = 1,000 records; paid = $399/mo flat, unlimited)
---

# BlitzAPI × AI-team / AI-hiring signal

**Status:** scoped + sized (15 one-credit probes). No list pulled yet. Trial key has 985 records left.

## What Blitz gives us for this ICP

| Endpoint | What it returns | Billing (trial) | Caps |
|---|---|---|---|
| `POST /v2/search/people` (Find People) | People matching title + company filters. Carries `total_results` → **1 credit buys the whole count**. | 1 record / result | 50k results / 1k pages |
| `POST /v2/company/tam-by-people` | **Distinct companies** with ≥N current employees matching the people filters, `matched_people` per company, full company record (domain, size, industry, HQ). Same input as Find People. No `total_results`. | 1 record / **company** | 50k |
| `POST /v2/jobs/search` | Job postings by title / description / ai_keywords / date / location / company firmographics. Carries `total_results`. Rows = title, url, company_name, company_linkedin_url, **ai_summary** (not the full description), location, date. | 1 record / posting | **5,000 results per query** |
| `POST /v2/company/tam-by-jobs` | **Distinct companies** hiring for matching jobs, `matched_jobs` per company, full company record. `job.min_per_company` (≤25). No `total_results`. | 1 record / company | 5,000 (jobs cap) |
| `POST /v2/jobs/company` | All postings at one LinkedIn company URL. | 1 / posting | — |
| `POST /v2/enrichment/company`, `/enrichment/linkedin-to-domain` | Company profile / domain from LinkedIn URL. TAM endpoints already include domain, so rarely needed. | 1 / call | — |

Plans & billing (from docs.blitz-api.ai/guide/concepts/pricing-unlimited + blitz-api.ai/pricing, read 2026-09-19):
- **Trial:** 1,000 records, consumed 1 per result returned, resets monthly (our key: reset 2026-10-19). Rate limit on trial key = **5 RPS** (paid = 10 RPS/endpoint per docs; pricing page currently advertises 50 RPS lifetime for accounts opened by Sept 30).
- **Paid:** flat-rate, **no per-record cost**. Core/Unlimited Leads **$399/mo** (people, company, jobs, TAM, enrichment — no emails/phones); $499 adds verified emails; $599 adds US phones. Fair-use cap 15M results/mo. Monthly, cancel anytime.
- `max_results` is **page size (1–50)**, not a total. Every result returned bills, so always pass `max_results:1` for sizing and set a client-side cap on real pulls.

## Filter semantics that matter

- `include[]` is **OR** keyword search; multi-word values match when each word appears in the title (loose: `"Head of AI"` matched *"Head of Data Analytics & AI Sales Specialists"*; `"AI Architect"` matched *"Architect (Associate Director)- Agentic AI…"*). Use `"[Head of AI]"` bracket syntax for exact, or post-filter the returned title with a regex. Counts below are therefore **upper bounds**.
- Separate filter objects **AND** together. So a two-provider trigger is expressible server-side as `job.description.include:["OpenAI"]` AND `job.ai_keywords.include:["Anthropic"]`. "Any 2 of N providers" = run the N·(N−1)/2 pair queries and dedupe on job `url` (jobs/search does **not** return the full description, so you cannot post-filter for providers client-side).
- `job.date_posted.last_days` (1–3650). `company.is_agency:false` only drops *confirmed* agencies — a staffing shop ("RS Global Services") still came through; the aggregator/denylist step from process 01 stays mandatory.
- People `location.country_code` is a plain array; job `location.country_code` is `{include:[…]}`. Company size: `employee_range` enum (`51-200`, `201-500`, `501-1000`, …) or `employee_count.{min,max}`.

## Sizing (live `total_results`, 2026-09-19, 1 credit each)

Titles = the user's lists: CORE (15 titles) + INFRA (9), LEADERSHIP (15), JOBS Tier-1 (13), Tier-2 (13). Exact query bodies in `scripts/blitz-size.mjs`.

| List definition | People / postings | Est. distinct companies* |
|---|---|---|
| People, core+infra titles, worldwide | 302,713 | — |
| People, core+infra, US | 81,815 | — |
| People, core+infra, US, company 51–1000 | 12,960 | ~4–6k |
| People, leadership titles, worldwide | 77,991 | — |
| People, leadership, US | 30,608 | — |
| People, leadership, US, company 51–1000 | 5,575 | ~3–4k |
| Jobs Tier-1 titles, last 30 d | 45,103 | — |
| Jobs Tier-1, last 90 d | 124,905 | — |
| Jobs Tier-1, last 180 d | 290,420 | — |
| Jobs Tier-1, 90 d, non-agency | 90,267 | — |
| Jobs Tier-1+2, 90 d, non-agency | 109,791 | — |
| Jobs Tier-1, 90 d, **US**, non-agency | 33,114 | ~8–12k |
| Jobs Tier-1, 90 d, non-agency, desc mentions any of OpenAI/Anthropic/Claude/Gemini/Bedrock | 24,532 | — |
| Jobs Tier-1, 90 d, non-agency, **OpenAI AND Anthropic** | 6,068 | ~2–3k |
| Jobs Tier-1, 90 d, US, non-agency, **OpenAI AND Anthropic** | **2,090** | **~800–1,200** |

\*Company estimates assume 2–4 matching people / postings per company; TAM endpoints return no total, so confirm with a 50-credit TAM page before scaling.

Takeaways:
- Agency exclusion removes ~28% of Tier-1 postings (124.9k → 90.3k). Keep it on.
- 30 → 90 → 180 days grows ~2.8× then ~2.3×. **90 days** is the right window: still "currently building", and 180 d starts pulling reposts/evergreen reqs.
- The "2+ providers named" trigger is ~7% of Tier-1 US postings — small, clean, and exactly the multi-model buyer.
- Trigger stacking (leadership hire present **and** Tier-1 hiring in 90 d) is a join on `company.linkedin_url` across the two TAM pulls — no extra credits.

## Recommended build (two lists, joined)

1. **AI-team list** — `tam-by-people`, US, size band TBD (51–1000 shown), `people.job_title.include` = CORE+INFRA+LEAD, `min_per_company:2` (a real team, not one ML engineer). Tag each company `has_ai_leader` by a second `tam-by-people` pull with LEAD titles + `min_per_company:1`, or by post-filtering the Find People rows. Exclude `industry` in {IT Services and IT Consulting, Business Consulting and Services, Staffing and Recruiting} — Cognizant/Deloitte/Accenture dominate the raw leadership matches.
2. **AI-hiring list** — `tam-by-jobs`, Tier-1 titles, `last_days:90`, US, `is_agency:false`, `min_per_company:1`; plus the **pair queries** for 2+ providers (OpenAI×Anthropic, OpenAI×Gemini, Anthropic×Gemini, ×Bedrock, ×Mistral…) dedupe by company → `multi_provider_hiring=true`.
3. **Shard around the 5,000-jobs cap:** split by title group × US state (or by `last_days` windows 0–30 / 31–60 / 61–90) so no single query exceeds 5k.
4. Post-filter titles with a strict regex, run the process-01 denylist (aggregators, staffing, consultancies), dedupe on `domain`, score: `ai_leader` (3) + `team ≥ 3` (2) + `hiring_90d` (2) + `multi_provider` (3).
5. Hand off domain-first to Apollo per process 01 step 7.

## Spend scenarios

| Scenario | Credits / cost | Yield |
|---|---|---|
| **Trial only (985 records left)** | $0 | ~300 companies from `tam-by-people` (leadership, US, 51–1000, min 1) + ~300 from `tam-by-jobs` 2-provider trigger + ~300 for `tam-by-jobs` Tier-1 90 d US — a 500–900 company pilot. Enough to prove signal quality, not a full universe. |
| **One month Core ($399)** | $399 flat | Full US universe: ~5–10k AI-team companies + ~8–12k hiring companies + the multi-provider subset, with headroom to iterate title regexes and re-pull. Fair-use 15M results is irrelevant at this scale. |
| **Core + email ($499)** | $499 flat | Same, plus verified emails for the contacts Find People already returned — replaces the Apollo contact step. |
| Per-record alternative (Apollo / Clay credits) | ~$0.10–0.50 / record | 20k companies ≈ $2–10k. Blitz flat-rate wins past ~3–5k records. |

**Recommendation:** run the ~600-company pilot on the trial (free), eyeball precision (title regex + denylist hit-rate), then buy **one month of Core at $399** and pull the full universe in a day (5 RPS = 18k requests/hour; the whole build is a few thousand requests). Cancel after.

## Gotchas
- Never commit the key (public repo). Script reads `BLITZ_API_KEY` from env.
- `jobs/search` returns `ai_summary`, not the description — provider detection must be server-side (`description`/`ai_keywords` filters).
- TAM pages can come back partial when `min_per_company` filters hard: keep paging until `cursor` is null.
- Trial RPS is 5, not the documented 10; the response's `fair_usage.rate_limit` is authoritative.

## Runs
- 2026-09-19 — Silver GTM (scoping) — 15 sizing probes, 15 credits — numbers above; no list pulled.
