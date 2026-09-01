# 01 · Job-Board-Trigger Sourcing → Clean Apollo List

**Outcome:** a net-new, deduped, ICP-gated company list with verified domains, ready to hand to Apollo for contacts.

**Trigger logic:** a company posting a specific role is a *buying signal*. A company hiring a GTM/RevOps/growth engineer is telling you it's building outbound and doesn't yet have the system — the exact wedge for a Data Foundation / outbound-build offer ("the GTM engineer you can't hire"). Any job board with a filterable niche works; this SOP uses GTM-engineer boards.

**When to run:** you need net-new accounts fuelled by a hire-trigger, not a bought firmographic list. Complements — doesn't replace — Apollo firmographic pulls.

---

## Inputs

- One or more niche job boards with a machine-readable feed.
- An ICP definition: demand-side, size band, geo policy, business-model gate.

> **See also:** [`skills/directory-lead-sourcing`](../skills/directory-lead-sourcing/) — the same
> outcome (an ICP-qualified list handed to Apollo) sourced from *business directories* rather than
> job boards. Different signal: firmographics and budget bracket, not a hire-trigger. The Apollo
> handoff at Step 7 is common to both.

## Sources (GTM-engineer boards, methods verified)

| Board | Access method | Yield | Notes |
|-------|---------------|-------|-------|
| **gtme.jobs** | Convex backend. `POST https://incredible-canary-974.convex.cloud/api/query` body `{"path":"jobs:list","args":{"page":N},"format":"json"}`, 10/page | ~1,146 jobs | Richest. Ships `orgEmployees` (numeric), `orgSize`, `orgIndustry`, `orgHeadquarters`, skills, salary (LinkedIn-sourced). **Use its numeric `orgEmployees` to resolve size band — sharper than any derived stage.** |
| **gtmecareers.com** | Niceboard. `GET /api/jobs` with full filter params (company=all, arrays as JSON strings, limit=30, page=1..N) | ~276 | HTML renders client-side; API is the only complete source. |
| **clay.com/job-board** | Webflow shell fetching static `https://assets.clayrun.dev/jobs.csv` | ~78 | Found the CSV URL via headless-Chrome netlog. Not in static HTML. |
| **getcargo.ai/jobs** | Next.js; jobs rendered in page HTML cards | ~23 | Curated, RevOps-leaning. Brandfetch logo = company domain (free domain hint). |

## Pipeline

```
scrape boards → merge → dedupe to hiring-side companies → firmographic gate
  → geo filter → domain enrichment → aggregator/ICP denylist → Apollo handoff
```

### Step 1 — Scrape + merge
Pull each board (methods above), normalize to one row-per-posting schema:
`board, title, company, company_type, industry, demand_side, stage/size, location, remote, salary, tools`.

### Step 2 — Dedupe to hiring-side companies
- Collapse postings → unique companies (normalize name: lowercase, strip punctuation + legal suffixes `inc|llc|ltd|corp|co|gmbh`).
- **Keep only `demand_side = talent`** (in-house hires). Drop `services` (agencies / GTM vendors / staffing) — those are peers/competitors, not buyers.
- Enrich firmographics from the richest board's raw JSON by normalized-name match (numeric employee count > derived band; also backfills HQ + industry for otherwise unknown-size rows).

### Step 3 — Firmographic gate
- Apply the size band (this run: **11–50 employees**).
- Rows with unknown size after enrichment go to a maybe-pile — *tag, don't silently drop.*

### Step 4 — Geo filter
- Bucket HQ into over-fished vs under-fished. Over-fished = SF Bay + NYC (per the outbound thesis: reach those warm, not cold).
- **Watch for misspellings** ("san fransico") that dodge the regex — spot-check the final list.

### Step 5 — Domain enrichment
- Fan out parallel web-verify subagents (~30 companies each), each returning `apex domain + confidence + note`, using HQ to disambiguate generic names (Circuit, Needle, Aion, FERO…).
- This step *also does the noise detection* — see Step 6. Method hit ~97% domain coverage.

### Step 6 — Aggregator / ICP denylist (the noise filter)
Job-board-sourced lists **always** leak noise. It has a signature; catch it two ways:

1. **Name pattern** — the "company" is actually the board:
   `Jobs via <X>`, `<X> via <board>`, `Jobster`, `Hiring`, `Careers`, `Staffing`, `Talent`, `Recruiting`.
2. **Domain / business-model check** (from enrichment):
   - Domain resolves to a job board (`dice.com`, `linkedin.com`) → **aggregator**, drop.
   - Real entity but not a B2B product company with a sales team — PE holdco, staffing/consultancy, defunct → **nonicp**, drop.
   - Domain parked / for-sale (HugeDomains redirect) → dead email deliverability → drop.
   - Duplicate (same domain, alt spelling) → keep first.
   - Real but borderline (services firm, HQ uncertain) → **verify**: eyeball, keep the ones that fit.

Split output into `*_clean.csv` (flag = ok) and `*_review.csv` (everything else). Never hand-clean blind — the flags tell you why each was held.

### Step 7 — Apollo handoff
- Hand `*_clean.csv` (domain-first) to Apollo.
- **EMAIL titles:** Founder / CEO / MD / Owner / Partner.
- **Sales-team check titles:** Sales / BD / New Business / Growth / Revenue (Director+) → sets `has_sales_team` (the real ICP confirm).
- Domain-match >> name-match — always feed the domain.

## Scripts
- `scripts/build-posters.js` — Steps 2–4 (dedupe, firmographic enrich from raw JSON, size band, geo bucket). CSV parser handles embedded commas; do **not** `awk -F,` these files.
- Domain enrichment (Step 5) = parallel subagents, not a script (web search + judgment).
- `scripts/split-noise.js` — Step 6 (merge domains, apply denylist, split clean vs review).

## Gotchas
- Board CSV/JSON fields contain commas — use a real CSV parser, never naive split.
- Normalized-name collisions (`Gradient-Labs` vs `Gradient Labs`) map to the same key — dedupe on domain at the end, keep first.
- `orgUrl` on gtme.jobs is a **LinkedIn** URL, not a website — it does **not** give you the domain. Enrich domains separately.

## Worked example — Silver GTM Data Foundation (2026-07-22)

Source: 4 GTM-engineer boards, 1,523 postings.

| Stage | Count |
|-------|-------|
| Postings | 1,523 |
| Unique companies | 906 |
| Talent-side (dropped 189 services) | 752 |
| Gate 11–50 (61 sizes rescued from gtme.jobs raw JSON) | 143 |
| Under-fished only (dropped 56 SF/NYC + 1 misspelled-SF) | 86 |
| Domains found (parallel subagents) | ~84 / 86 |
| **Clean, Apollo-ready** | **78** |
| Held/dropped | 8 — 2 aggregators (Jobs via Dice, Jobster), 3 non-ICP (Matchii defunct, Mercier staffing, SIG Partners PE), 1 dup, 2 verify-fails (SourceCo M&A, Logiq Labs parked domain) |

Net: **78 clean under-fished 11–50 B2B companies actively hiring for GTM engineering** — a live hire-trigger list no off-the-shelf tool produces.
