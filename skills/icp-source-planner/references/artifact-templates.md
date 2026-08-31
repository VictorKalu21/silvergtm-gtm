# Run Artifact Templates

All artifacts are written to the CLIENT's project folder, client-presentable.
Replace <angle-bracket> slots; delete guidance comments before delivery.

---

## 1. ICP Contract (`icp-contract.md`)

# ICP Contract — <Client> · <date>
**Client:** <name> · <domain> — <one line: what they sell, to whom>
**Target entity:** <business type/category>
**Firmographics:** size <band> · geo <list> · sector <list>
**Decision-maker persona:** <titles> (people-pull happens downstream via Apollo)
**Required output fields:**
| Field | Priority |
|---|---|
| company name | must |
| domain | must |
| <field> | must/nice |
**Dedupe universe:** <paths to prior-run files, or "none — new client">

---

## 2. Ranked Source List (`source-candidates.md`)

# Source Candidates — <Client> · <date>
Ranked free-first. This list is the fallback queue for the run.
| # | Source | Type | Why | Cost tier | Library status |
|---|---|---|---|---|---|
| 1 | <source> | <taxonomy type> | <one line> | free / workaround / paid | fresh profile / stale / none |
**Gap-fill research notes:** <what was searched, what was/wasn't found>

---

## 3. Source Profile — client-facing variant (`source-profile-<source>.md`)

# Source Profile — <Source> · <Client> · <date>
**Source:** <name> — <taxonomy type>
**Fit for this ICP:** <what it holds vs the target; estimated obtainable volume>
**Fields it delivers:** <field → yes / partial / no, vs the required-fields contract>
**How we access it:** <plain-language method — no internal WA-IDs in the client copy>
**Restrictions:** <rate limits, pagination ceiling, freshness, anything that caps volume>
**Cost:** <free / free-with-workaround / paid + rough per-1k>
**Recommendation:** <use / use-with-caveat / skip — one line of why>

(Internal companion lives in `../library/<source>--<vertical>.md` with the technical
method, WA-IDs, and validation history — keep that out of the client copy.)

---

## 4. Test Plan (`test-plan-<source>.md`)

# Test Plan — <Source> for <Client> · <date>
**Params:** queries <…> · geo <…> · filters <…> · pagination depth <…> · field map <…>
**Qualification rubric:** signals + weights + pass threshold + kill criteria
**Strata:** <e.g. 3 queries × 2 geos × head/mid/deep pages>
**Targets:** ~50 qualified rows, raw cap 150
**Provisional thresholds:** <field> fill ≥ <X>% · ICP-match ≥ <X>% · overlap ≤ <X>%
(Thresholds inform; user eyeball decides.)

---

## 5. Test Report (`test-report-<source>.md`)

# Test Report — <Source> for <Client> · <date>
**Verdict:** PASS / FAIL(params|method|source) — pending user sign-off
**Yield:** <raw> raw → <q> qualified (<match %>)
**Fill rates by stratum:**
| Field | Head | Mid | Deep | Overall | Floor | OK? |
|---|---|---|---|---|---|---|
**Overlap:** <X>% vs dedupe universe · intra-test dupes <n>
**Cost actuals:** <per-row: tokens/credits/time>
**Rows:** <table or CSV link — laid out for manual review>
**Notes:** <depth-decay observations, surprises>

---

## 6. Run Summary (`run-summary.md`)

# Run Summary — <Client> · <date>
**Final list:** <path.csv> — <n> qualified companies, domain-first, Apollo-ready
**Funnel:** <raw> scraped → <after within-run dedupe> → <after cross-source merge>
→ <after client-universe dedupe> → <after rubric> qualified
**Per source:** | Source | Raw | Qualified | Fill (domain) | Cost |
**Method notes:** <what worked, for the library>
