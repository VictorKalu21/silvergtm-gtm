---
name: devops-ic-sourcing
description: >-
  Build a person-level, source-linked lead list of hands-on DevOps / Platform / Infrastructure / Cloud / SRE
  individual contributors at mid-size product companies that are CURRENTLY HIRING for those roles and name
  Terraform, CloudFormation or Bicep in the job description. Hiring-signal path only: WebSearch discovers which
  companies post such roles on Greenhouse / Lever / Ashby, the ATS's own public JSON is queried directly for every
  open role + full JD + posting date, regex gates the IC title and the explicit tech mention (evidence sentence
  captured), the company domain comes from the source (board outbound link / JD links / Ashby publicWebsite) before
  any resolver, a cheap-LLM read of the homepage drops consultancies and regulated verticals, and Apollo (or a
  HeyReach/manual CSV) attaches the person. Use WHENEVER the user wants "engineers who use Terraform", "DevOps leads
  from job postings", "people at companies hiring platform engineers", a sourcing-VA-style lead sheet with a source
  link + one-line fit note per row, or any hire-trigger list where the PERSON (not the company) is the deliverable.
  Not for company-only lists (use process 01 / icp-source-planner) and not for GitHub-commit sourcing.
metadata:
  version: 1.0.0
  locked_icp: "2026-09-17 — size 51-500; Lead/Senior count as IC; explicit Terraform/CloudFormation/Bicep only; Workable off (Cloudflare 1015 from datacenter IPs)"
---

# DevOps IC sourcing (hiring-signal path)

A company posting a Platform / DevOps / Infrastructure role that names Terraform is telling you two things at once:
the team already runs IaC, and it is under-staffed for it. The posting URL is a source link a client can verify in
ten seconds, and the JD sentence that names the tool is the fit evidence. This skill turns that into a lead sheet
of the *existing* IC engineers at those companies — name · company · role · source link · fit note — with the
evidence and provenance columns kept beside them.

Proven 2026-09-17 (test batch): 18 WebSearch queries → 121 hits → 100 boards → 92 fetched → **4,069 postings** →
180 IC titles → **109 with an explicit tech mention** → **48 companies**, 44 domains straight from the source.

## Gates (explicit — this skill stops and shows you numbers before anything costs)

| Gate | After | You see | Spend so far |
|---|---|---|---|
| **G1** | discovery | query list, hits per query, unique boards per ATS | $0 |
| **G2** | fetch + regex + domains | the funnel (postings → IC → tech → companies) + the company table with domain, best posting, evidence | $0 |
| **G3** | company screen + people | the ~50-row test sheet, stratified by tech × ATS, for eyeball | Haiku pennies + Apollo credits |
| **G4** | each weekly run | `leads_<date>.csv` + `leads_<date>_held.csv` with hold reasons | same |

Once the config is locked at G3, G1+G2 collapse into one readout per weekly run.

## Pipeline (engine = fixed scripts, behaviour = `config.json`)

Copy `config.example.json` → `<run>/config.json`. Every script runs with the run folder as cwd and is resume-safe.

```
1. discover   WebSearch (in-session, no key) → discovery/hits.txt   → scripts/discover-parse.mjs → discovery/slugs.json
2. fetch      scripts/fetch-ats.mjs    Tier-0 ATS JSON + board HTML  → boards.jsonl, postings.jsonl
3. screen     scripts/screen.mjs       regex: IC title + tech + age   → postings_gated.jsonl, companies.csv   ← G2 readout
4. domains    scripts/resolve-domain.mjs  source-first                → domains.json, domains_todo.csv (→ WebSearch → domains_manual.json → re-run)
5. company    Haiku on references/screen-prompt.md (homepage text is already in domains.json)  → screen.json
6. people     Apollo people search by domain (or HeyReach / manual)  → people.csv
7. assemble   scripts/assemble.mjs     join + fit note + cross-run dedupe → leads_<date>.csv (+ _held.csv)
```

### 1 — Discover with WebSearch only
Query grammar = `<tech> "<role>" site:<ats-host>`. Hosts: `boards.greenhouse.io`, `job-boards.greenhouse.io`,
`jobs.lever.co`, `jobs.ashbyhq.com` (`apply.workable.com` only from a residential IP — see gotchas). Roles: DevOps /
Platform / Infrastructure / Cloud / Site Reliability Engineer, plus Senior variants. WebSearch returns ~10 URLs per
query, so **breadth = number of queries**; vary role wording, add `OR` across hosts, and add tech-only queries
(`Terraform Kubernetes site:jobs.ashbyhq.com engineer`) for the second batch. Paste every result URL into
`discovery/hits.txt` as `url<TAB>query`. One hit per company is enough — step 2 enumerates all its roles.

### 2 — Fetch the ATS directly (Tier 0, keyless)
| ATS | Endpoint | Company name | Company site |
|---|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` (+ `/v1/boards/{slug}`) | `company_name` on each job | outbound link on `job-boards.greenhouse.io/{slug}` (e.g. "back to careers") |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` | `<title>` of `jobs.lever.co/{slug}` | header link on that page |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}` | `window.__appData.organization.name` | `organization.publicWebsite` — first-party, verbatim |
| Workable | `apply.workable.com/api/v1/widget/accounts/{slug}?details=true` | `name` | `url` | 

Greenhouse `content` is HTML-entity-encoded (decode, then strip). Lever body = `descriptionPlain` + `lists[]` +
`additionalPlain`. Ashby ships `descriptionPlain`. Posting date: `first_published` / `createdAt` / `publishedAt`.

### 3 — Regex screen (G2)
IC title = `title_allow` ∧ `title_role_word` ∧ ¬`title_deny` (Lead/Senior allowed; Head/Director/VP/Principal/
Staff/Chief/Manager/Architect/Intern/Consultant/Contractor denied). Tech = any of the three regexes on the JD body;
the first sentence containing the term is stored as `evidence`. `posting_max_age_days` only *flags* stale rows —
an open posting is a live signal whatever its age. `company_deny_name` holds obvious staffing/consulting names
(`hold_name_deny`) without dropping them.

### 4 — Domain from the source, resolver last
Score = 3×(board outbound link) + 1×(each posting whose JD links it) + 5×(stem matches company/slug); Ashby
`publicWebsite` counts as a board link. Top candidate is fetched and must be alive, non-parked, and not redirect to
a junk host. Residual → `domains_todo.csv` → resolve **with WebSearch** (take the company's own site, never an
aggregator) → `domains_manual.json` → re-run. Only if that fails would you reach for `name-to-domain`'s resolver.

### 5 — Company screen (cheap model, homepage text)
`domains.json` already carries `homepage_text` (first 3k chars) for every resolved domain. Batch ~30 companies per
Haiku call with `references/screen-prompt.md` → `screen.json` (`keep`, `company_type`, `vertical`, `size_hint`).
Confirm size (51–500) from the LinkedIn company page via WebSearch snippet first (free), Apollo firmographics second.

### 6 — People
Apollo people search by domain; titles per `title_allow`, seniority IC, exclude the hiring manager named in the
JD if any. Export with the standard Apollo headers (mapped in `people_cols`). A HeyReach export or a hand-built CSV
with the same columns works identically.

### 7 — Assemble
`assemble.mjs` joins people → companies on registrable domain, re-applies the person-title gate, dedupes on
LinkedIn URL against `dedupe_files`, and writes the client sheet with `fit_note` templated from real columns
(`references/fit-note-prompt.md` explains the optional polish). Every row: `source_link` = the posting URL,
`evidence` = the JD sentence, `posting_date`, `ats`, `domain`.

## Gotchas (learned 2026-09-17)
- **Workable is Cloudflare-rate-limited (error 1015) from datacenter IPs** on the widget API, the v2 API and the
  posting HTML alike; WebFetch gets only the SPA shell. Leave `ats.workable=false` unless running from a laptop.
- **Lever's board HTML can 404 while its API answers** (nielsen, resilientco) — name falls back to the slug.
- **Board pages link to CDN hosts that 302 back to the ATS vendor** (`ashbyprd.com` → `ashbyhq.com`); the junk-host
  list is re-applied at resolve time and a redirect into a junk host is a reject.
- **Greenhouse embed hits** (`boards.greenhouse.io/embed/job_app?token=…`) carry no board slug — resolve by hand or drop.
- **A hit ≠ a passing posting.** Only ~half the discovered boards yield an IC + tech posting: many hits were
  Principal/Staff/Director roles, closed postings, or generic "Software Engineer" titles. Discover wide.
- **Huge boards can exceed the 8 MB body cap** (Anduril) → `badjson`; raise the cap in `lib.mjs` if you care.
- **Consultancies dominate the raw hits** (Coderio, Truelogic, Mactores, Captivation, Cloudscaler, Egen, New Era,
  Rackspace, Accenture Federal…). Expect the company screen to cut ~40–50% of G2 companies; that is the point.

## Files
- `config.example.json` — copy to the run folder as `config.json`; the ICP contract lives here.
- `scripts/lib.mjs` — CSV/JSONL/HTTP/HTML/domain helpers (junk-host list, registrable domain, entity decode).
- `scripts/discover-parse.mjs` · `fetch-ats.mjs` · `screen.mjs` · `resolve-domain.mjs` · `assemble.mjs`
- `references/screen-prompt.md` — stage-5 company screen. `references/fit-note-prompt.md` — optional note polish.
