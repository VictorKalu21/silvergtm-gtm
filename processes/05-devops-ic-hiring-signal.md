# 05 · DevOps-IC Hiring-Signal Sourcing → person-level, source-linked lead sheet

**Outcome:** a spreadsheet of hands-on DevOps / Platform / Infrastructure / Cloud / SRE **individual contributors** at mid-size product companies that are **currently hiring** for those roles and **name Terraform, CloudFormation or Bicep** in the job description. Every row carries name · company · role · **source link** (the live job posting) · **one-line fit note that quotes the JD sentence** naming the tool. Built for a client that spot-checks sources on every entry.

**Trigger logic:** a company posting a Terraform-heavy platform role is telling you it already runs IaC and is short-handed for it. The *existing* IC engineers on that team are the buyers of an IaC-generating design tool; the posting is the proof, the JD sentence is the evidence, and the ATS's own JSON hands you both without a scrape.

**When to run:** you need a weekly, verifiable, person-level list where the client checks sources, not a bulk company pull. Company-only hire-trigger lists are process 01. GitHub `.tf`-commit sourcing was scoped and set aside (low email yield: most commit emails are `noreply`).

**Skill:** `skills/devops-ic-sourcing/` (SKILL.md + `scripts/` + `references/`). This SOP is the human-readable process.

---

## Locked ICP (2026-09-17)

| Field | Value |
|---|---|
| Titles (allow) | DevOps, Platform, Infrastructure, Cloud, SRE / Site Reliability; **Lead and Senior count as IC** |
| Titles (deny) | Head, Director, VP, Principal, Staff, Chief, Manager, Architect, Intern, Consultant, Contractor |
| Tech evidence | explicit **Terraform** (incl. Terragrunt/OpenTofu), **CloudFormation**, **Bicep** — in the JD or the person's headline |
| Company size | **51–500** |
| Company type | SaaS / tech-enabled product; drop consultancy, agency, MSP, staffing, banking, finance, insurance, defense, gov contractor, provider/payer |
| Per row | name · company · role · source link · evidence sentence · fit note · posting date · ATS · domain |

## Gates

| Gate | After | You see | Spend |
|---|---|---|---|
| G1 | WebSearch discovery | queries, hits, unique boards per ATS | $0 |
| G2 | ATS fetch + regex + domains | funnel + company table (domain · best posting · evidence) | $0 |
| G3 | company screen + people | ~50-row stratified test sheet for eyeball → config lock | Haiku pennies + Apollo credits |
| G4 | each weekly run | `leads_<date>.csv` + `_held.csv` with reasons | same |

## Pipeline

```
WebSearch (tech × role × ATS host) → hits.txt → discover-parse → slugs.json
  → fetch-ats (Tier-0 ATS JSON: every open role + JD + date; board HTML for name + site link)
  → screen (regex: IC title ∧ explicit tech → evidence sentence; age flag; name-deny hold)   ← G2
  → resolve-domain (source-first: board link / Ashby publicWebsite / JD links; residual → WebSearch)
  → Haiku company screen on homepage text (product vs services vs regulated; size hint)
  → size confirm (LinkedIn company page via WebSearch snippet, then Apollo)
  → Apollo people by domain (IC titles) → assemble (join, fit note, cross-run dedupe)              ← G3/G4
```

### Step 1 — Discover with WebSearch (no SERP key)
Grammar: `Terraform "Platform Engineer" site:jobs.ashbyhq.com` across 3 techs × 5 roles × 4 hosts. ~10 URLs per query, so breadth is the query count. Paste URLs as `url<TAB>query` into `discovery/hits.txt`. One hit per company suffices — step 2 enumerates all its roles.

### Step 2 — Query the ATS directly
Keyless public JSON: Greenhouse `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`, Lever `api.lever.co/v0/postings/{slug}?mode=json`, Ashby `api.ashbyhq.com/posting-api/job-board/{slug}`. Each gives full JD + posting date. Board HTML gives company name and, for Ashby, `organization.publicWebsite` (first-party domain). **Workable is Cloudflare-rate-limited (1015) from datacenter IPs — off by default.**

### Step 3 — Regex screen (G2 readout)
IC title gate + tech regex on the JD body; first sentence containing the term is the `evidence`. Posting age only flags (open = live). Staffing/consulting name patterns are *held*, not dropped.

### Step 4 — Domain from the source
Score board outbound link ×3, each JD that links the domain ×1, stem-matches-company +5; fetch-verify alive/non-parked/not-a-junk-redirect. Residual → `domains_todo.csv` → WebSearch → `domains_manual.json` → re-run. The generic name→domain resolver is the last resort, not the default.

### Step 5 — Company screen
Haiku over `homepage_text` (already captured in `domains.json`) with `references/screen-prompt.md`: `product | services | regulated | unclear` + vertical + size hint. Keep product + unclear. Confirm 51–500 from the LinkedIn company page snippet (free) before Apollo.

### Step 6 — People
Apollo people search by domain, IC titles per config, exclude the JD's named hiring manager. Export → `people.csv`.

### Step 7 — Assemble
`assemble.mjs` joins on registrable domain, re-gates the person title, dedupes on LinkedIn URL against prior `leads_*.csv`, and writes the sheet. Fit note is templated from real columns: `<role> at <co>; <co> is hiring a <posting title> (<ats>, posted <date>) whose JD reads: "<evidence>"`.

## Scripts
- `skills/devops-ic-sourcing/scripts/discover-parse.mjs` — Step 1 parse.
- `scripts/fetch-ats.mjs` — Step 2. `scripts/screen.mjs` — Step 3 (+ funnel print). `scripts/resolve-domain.mjs` — Step 4. `scripts/assemble.mjs` — Step 7.
- Steps 1 (search), 4 (residual), 5 (screen) are in-session Claude work driven by the reference prompts.

## Gotchas
- **Only ~half of discovered boards yield a passing posting** — hits were often Principal/Staff/Director, closed, or generic titles. Discover wide; the fetch is free.
- **Consultancies dominate raw hits** (nearshore shops, federal IT, MSPs). The company screen is the real cut, expect ~40–50% of G2 companies to go.
- **Lever board HTML can 404 while the API answers**; **board pages link CDN hosts that 302 to the ATS vendor** — junk list re-applied at resolve time.
- **Greenhouse embed hits carry no slug**; **8 MB body cap** drops giant boards (Anduril) as `badjson`.
- Never fetch LinkedIn profiles for the tech mention — auth-walled (web-scrape-triage STOP line). JD, ATS JSON, and HeyReach headline are the allowed evidence sources.

## Worked example — test batch (2026-09-17, Gate 2)

| Stage | Count |
|---|---|
| WebSearch queries | 18 |
| Hit URLs | 121 (Greenhouse 49 · Ashby 31 · Lever 21 · Workable 19) |
| Boards fetched | 100 enabled → 92 ok (8 failed: 404 / oversize) |
| Postings enumerated | 4,069 |
| IC-title postings | 180 |
| IC-title + explicit tech | 109 (Terraform 108 · CloudFormation 18 · Bicep 4); 73 fresh ≤90 d |
| Companies with ≥1 passing posting | 48 (47 pass · 1 held on name-deny) |
| Domains from source | 38 high + 2 medium; 6 → WebSearch; 1 unresolvable (staffing) |

Gate 2 stopped here for eyeball; company screen + people pull follow at G3.
