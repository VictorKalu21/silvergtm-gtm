---
name: icp-source-planner
description: >-
  Plan-first, gated engine for sourcing an ICP-qualified company list for ANY vertical:
  given a client's domain + who they're looking for, research and rank the best FREE-FIRST
  sources for that exact vertical+ICP, deep-dive what each source can deliver (fields,
  restrictions, access method, volume), parameterize + build a qualification rubric with
  the user, run a stratified ~50-qualified-row test, and only then scrape at full volume.
  Use WHENEVER the user wants a sourcing plan or lead-sourcing strategy for a vertical/ICP,
  says "where should we source leads for X", "build the data foundation for <client>",
  "what are the best sources for <ICP>", "plan the scrape for <vertical>", or names a client
  domain + target-persona and wants a list built. ALSO the entry point for every Silver GTM
  Data Foundation deliverable — a "Data Foundation" run, a "Tier-1 pilot", "25 free accounts",
  or ANY "sample run"/"free sample"/"sample list for <client>" (compressed sample mode,
  ≤25-50 rows) enters HERE FIRST, even when the vertical is local businesses: this skill picks
  the source and then dispatches extraction (to google-maps-scrape, directory-lead-sourcing,
  or web-scrape-triage) — it is NOT skipped just because the ICP looks like a Maps or directory
  job. Prefer this over jumping straight to a scraping skill whenever the SOURCE isn't already
  decided OR the request is framed as a client sample/pilot/Data-Foundation deliverable. Only
  go straight to a scraping skill when the user has ALREADY named the exact source to scrape.
---

# ICP Source Planner

The research + gating + orchestration brain for lead sourcing. It NEVER extracts data
itself — it decides WHAT to scrape, WHERE from, proves the source with a small test,
then dispatches extraction to the right skill.

**Business context:** this is the fulfillment engine for the Silver GTM "GTM Data
Foundation" offer (free 25-account sample → $750 Tier-1 pilot → full engagement).
Artifacts must be client-presentable. Output must be Apollo-ready (domain-first).

## Hard rules

1. **Gate before every heavy step.** Never deep-dive, test, or scrape without the user
   picking/approving first. Gates are listed per phase below.
2. **Free-first.** Rank free/public sources above free-with-workaround above paid. Never
   procure paid data — recommend it and stop.
3. **Never scale a failing test.** No full scrape until the test passes AND the user
   signs off on the rows.
4. **Always ask which client** at intake, and load their prior-run files as the dedupe
   universe (per-client cross-run dedupe is mandatory).
5. **Precision over recall** in qualification. A smaller, cleaner list beats a bigger,
   noisier one.
6. **Every run updates the library** — successes AND failures.

## Inputs (Phase 0 collects these)

1. Client identity (mandatory — drives dedupe universe + artifact folder)
2. Client domain (read their site: what they sell, to whom)
3. ICP description in the user's words
4. Dedupe universe: paths to prior-run lead files for this client (may be empty)

## Dispatch map (who does the hands-on extraction)

| Picked source type | Dispatch to |
|---|---|
| Google Maps / local businesses | `google-maps-scrape` skill |
| Business/agency directory (Clutch, DesignRush, …) | `directory-lead-sourcing` skill |
| Registries / gov open-data / filings | `web-scrape-triage` (Tier 0.5) |
| Web mirrors — technographic reverse-lookup, domain enum | `web-scrape-triage` (Tier 0.7) |
| Hidden APIs / known-open platform endpoints (app stores, Shopify, headless CMS, Algolia) | `web-scrape-triage` (Tier 0) |
| Ad libraries / footprint (crt.sh/DNS) / dorking / anything else on the web | `web-scrape-triage` skill |
| People-on-companies enrichment | OUT OF SCOPE — hand off to `prospecting` / Apollo downstream |

New extraction methods discovered during a run → record in
`references/workarounds-catalog.md`; if general enough, FLAG for upstreaming into
`web-scrape-triage` (user decides — never auto-edit another skill).

## Standard pipeline (8 phases)

### Phase 0 — Intake & ICP contract
- **First: read `references/process-rules.md`** — the curated, promoted rules for how to
  scope, test, and score (distinct from source facts in `library/`). Carry them into Phase 1
  scoping and re-check them before designing the Phase 3–4 test. A promoted rule beats a
  conflicting base-pipeline default.
- Ask which client. Collect prior-run file paths → dedupe universe.
- Fetch + read the client's domain (what they sell, who they sell to).
- Write the **ICP contract** (template in `references/artifact-templates.md`):
  entity type, firmographics (size band / geo / sector), decision-maker persona,
  and REQUIRED OUTPUT FIELDS each tagged must-have or nice-to-have.
- Everything downstream is measured against this contract.

### Phase 1 — Source research (taxonomy + live gap-fill)
- Read `references/source-taxonomy.md`; map the ICP to source types via its heuristics.
- Check `library/_index.md` for prior validated profiles matching this vertical.
- Run targeted WebSearch ONLY for gaps (vertical-specific niche sources the taxonomy
  doesn't know: associations, registries, award lists, vertical directories).
- Rank candidates free-first: free/public > free-with-workaround > paid.
- Output: **ranked candidate source list**, one-line "why" each. This list is the
  **fallback queue** for the whole run.
- If gap-fill finds nothing niche, say so explicitly — never fabricate sources.
- **GATE →** user picks which sources to deep-dive.

### Phase 2 — Source deep-dives (per chosen source)
- Library shortcut: a library profile with fresh `last_validated` (≤60 days) skips
  straight to Phase 3. A stale hit gets a cheap re-probe (one page / one API call)
  to confirm the method still works — live probe beats library on conflict; update
  the profile.
- Otherwise produce a **Source Profile** (template in `library/_template.md`):
  records held + ICP coverage; obtainable fields mapped vs required fields
  (can/partial/can't); access method via the web-scrape-triage ladder (server HTML →
  hidden JSON API → SERP discovery → workaround techniques cited BY NAME from
  `references/workarounds-catalog.md` → rendered/unlocker); restrictions (rate limits,
  pagination ceilings, anti-bot, ToS, freshness); cost tier + rough cost-per-1k;
  estimated max obtainable volume.
- Multiple deep-dives are independent → run them as parallel subagents.
- **GATE →** user picks the winning source(s). Multi-source is first-class: each
  winner gets its own Phase 3–5 track.

### Phase 3 — Parameterize + rubric + test plan (ONE document, ONE gate)
Per winning source, define WITH the user:
- Run parameters: queries, geo matrix, category filters, size floor, pagination
  depth, field mapping.
- **Qualification rubric**: ICP-fit signals, weights, pass threshold, kill criteria.
- Provisional test thresholds: per-field fill-rate floors, ICP-match floor, max
  overlap vs dedupe universe. Provisional = metrics inform, the user's eyeball is
  the final arbiter.
- Test plan: strata design (see Phase 4), raw cap, what the report will show.
- **GATE →** one approval covers params + rubric + test plan. Then the test runs.

### Phase 4 — Stratified test (~50 qualified rows)
- Target ~50 QUALIFIED rows, raw cap ~150.
- Sample ACROSS STRATA, never the first N — stratify on the axis the source actually
  varies on. If the source is facet-organized (tags/categories), stratify by FACET; use
  pagination depth as a stratum only when the source ranks by relevance/recency and rank
  plausibly affects quality (see `references/process-rules.md` R1). The point is to see the
  slice you'll actually scrape, not just the flattering head.
- Dispatch extraction per the dispatch map; apply the rubric to every raw row.
- Produce the **Test Report** (template in `references/artifact-templates.md`):
  per-field fill rate BY STRATUM (exposes depth-decay); ICP-match rate
  (qualified/raw); overlap % vs dedupe universe + intra-test uniqueness;
  cost-per-row actuals (tokens/credits/time); the qualified rows laid out for
  manual review.
- If the raw cap is hit before 50 qualified: report as-is with the shortfall
  flagged — that IS signal (low match rate); the user decides.

### Phase 5 — Verify gate
- Compare report vs thresholds; user eyeballs the rows.
- PASS + sign-off → Phase 6.
- FAIL → diagnose at three levels, in order:
  1. **Params** (wrong queries/filters) → adjust → re-test.
  2. **Method** (extraction rung failing) → move up the triage ladder → re-test.
  3. **Source** (coverage/quality fundamentally wrong) → record the FAILURE in the
     library → advance the fallback queue to the next Phase 1 candidate (cheap —
     its ranking rationale already exists).
- Never dead-end: the queue always has a next move, or the honest conclusion is
  "this vertical needs paid data" — say that and stop.

### Phase 6 — Full scrape + merge
- Run each validated source at full volume with the locked params + rubric.
- Dedupe within-run → cross-source merge/dedupe (keys: domain, place_id,
  normalized name+geo) → dedupe against the client's universe.
- Output: final qualified + scored CSV (domain-first, Apollo-ready) + a run
  summary (volumes per source, qualification funnel, overlap discarded).

### Phase 7 — Library update (ALWAYS runs, even on failure)
- Write/update Source Profiles in `library/`: validated method, actual fill rates
  BY DEPTH, real cost-per-row, gotchas, `last_validated` date.
- Record failures as first-class entries: "tried X for vertical Y, 20% fill at
  depth — don't bother."
- New techniques → append to `references/workarounds-catalog.md`; flag any general
  enough to upstream into `web-scrape-triage`.
- Add/refresh the one-line entry in `library/_index.md`.
- **PROCESS observation?** If the run suggested something that might change how a FUTURE run
  is scoped/tested/scored (not a source fact — a how-to-run insight), append it as a raw
  entry to `references/observations-log.md` with status OBSERVATION. Do NOT edit
  `process-rules.md` here — appending an observation is Phase 7; promoting it to a rule is a
  separate, gated step (below). Source facts → `library/`; raw process notes → observations-log.

## Reviewing & promoting lessons (the self-improvement loop)

Three stores, deliberately separated so the skill grows without rotting:
- `library/` — **source facts** (a source's fields/method/fill/cost). Read on demand in Phase 2.
- `references/observations-log.md` — **raw, append-only run notes.** Written in Phase 7. **NOT
  read at scope time.** This is the unbounded archive.
- `references/process-rules.md` — **curated, capped (~12) promoted rules.** Read every run at
  Phase 0. This is the only process store that steers behavior.

**Promotion gate — how an observation becomes a rule:**
- An observation graduates into `process-rules.md` ONLY when it has recurred across **≥2 distinct
  sources/clients** OR the **user explicitly promotes it**. A single run (n=1) stays an
  observation — don't let one datapoint mutate behavior.
- When you promote: write the rule generalized (scope + evidence line), mark the source
  observation `PROMOTED → R<n>`, and **retire any stale/contradicted rule** to stay under the cap.
- Keep source-specific detail OUT of process-rules — it belongs in the `library/` profile.

**Review ritual:** when the user says "review the lessons" (or every ~5 runs), read
`observations-log.md`, cluster recurring observations, promote the ones that pass the gate,
retire stale rules, and prune. This is the human-in-the-loop step that keeps the rule set honest.

## Sample mode (free 25-account sample, 72h window)

Compressed path for the free-sample rung (≤25–50 rows). Trigger: user says
"sample run for <client>" or invokes the free-sample offer.

- **One gate total:** Phases 0–3 collapse into a single intake+plan message
  (ICP contract, chosen source, params, rubric) → ONE approval → run.
- **The sample IS the test:** no separate Phase 4/5. Still stratify at miniature
  scale (≥2 strata) so the source read isn't head-only.
- **Library shortcut first:** a fresh validated profile for the vertical → skip
  research, run off it. This is the reliable-72h path.
- **New vertical = R&D you keep:** compressed research (single WebSearch pass, top
  taxonomy candidates, no deep-dive docs), and Phase 7 ALWAYS runs — the sample
  seeds the profile that makes the later pilot/full run cheap.
- **Rubric non-negotiable:** the sample is sold as SCORED accounts.
- **Escalation:** sample→pilot re-enters the standard pipeline at Phase 2/3 with
  the sample's profile as warm start; sample rows join the pilot's dedupe universe.

## Run artifacts (client-presentable)

All run artifacts go in the CLIENT'S project folder (ask/derive at intake), never
inside this skill. Use `references/artifact-templates.md` for: ICP contract, ranked
source list, source profile (client-facing variant), test plan, test report, run
summary. Write them clean enough to hand to the client as proof-of-work.

## Error handling

- Source unreachable mid-run → retry once → treat as method-level failure (Phase 5
  ladder).
- Library profile contradicts a live probe → live probe wins; update the profile.
- Empty gap-fill research → proceed on taxonomy candidates only, say so explicitly.
