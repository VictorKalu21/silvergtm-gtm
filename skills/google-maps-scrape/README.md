# google-maps-scrape — README

Plain-English guide to this skill. `SKILL.md` is the procedure the model follows step by step;
this file explains what the skill is, what it produces, where things live, and where it breaks.
Read this first. Read `SKILL.md` when you are about to run it.

## Table of contents

1. [What this skill does, and what it does not do](#1-what-this-skill-does-and-what-it-does-not-do)
2. [When to use it, and the front door](#2-when-to-use-it-and-the-front-door)
3. [The pipeline at a glance](#3-the-pipeline-at-a-glance)
4. [What the operator must answer before any spend](#4-what-the-operator-must-answer-before-any-spend)
5. [Gates: where the run stops and shows its work](#5-gates-where-the-run-stops-and-shows-its-work)
6. [Where files live](#6-where-files-live)
7. [Owner-finding: how names are found, and who reads the text](#7-owner-finding-how-names-are-found-and-who-reads-the-text)
8. [What each run costs, and which budget binds](#8-what-each-run-costs-and-which-budget-binds)
9. [Sibling skills: what to hand off, and when](#9-sibling-skills-what-to-hand-off-and-when)
10. [Known landmines](#10-known-landmines)
11. [After the run: the write-back](#11-after-the-run-the-write-back)
12. [Glossary](#12-glossary)

New lesson? Find the section it belongs to in this list. If none fits, the lesson is either a
`SKILL.md` step change (gated, see section 11) or an `IMPROVEMENTS.md` bug, not README text.

---

## 1. What this skill does, and what it does not do

It turns a client's ICP ("residential foundation repair contractors in ten states") into a
Clay-ready CSV of open, in-footprint, qualified local businesses, each with the text a model
needs to name the decision-maker.

It does this by tiling Google Maps searches over a footprint through the scraper.tech
`searchmaps.php` endpoint, deduping on `place_id`, gating on open / in-footprint / qualified, and
then fetching each business's website text for owner-finding.

It does **not**:

- decide where a vertical's leads live (that is `icp-source-planner`);
- find email addresses, verify them, or send anything (Clay, then `email-verify-debounce-bounceban`);
- resolve a business name to a domain when Maps has no website (`name-to-domain`);
- get past a 403 or a Cloudflare wall (`web-scrape-triage`);
- run the model that reads the text and names the owner. That runs in Clay, on the file this skill produces.

The pipeline ends at `clay.csv`. It does not come back from Clay.

## 2. When to use it, and the front door

Use it when the source is already decided: the operator has said "Google Maps" or the vertical is
local businesses and the planner has dispatched here.

If the source is not decided, or the request is a client sample, pilot, or Data Foundation
deliverable, enter through `icp-source-planner` first. It writes the ICP contract, picks the
source, and dispatches to this skill. Skipping it means no source profile gets written for the
vertical, so the next run of the same vertical starts from zero.

## 3. The pipeline at a glance

| Step | Name | Script | Reads | Writes | Stop? |
|---|---|---|---|---|---|
| 1 | Resolve geography + ICP + offer + target role | none (questions) | operator | `ICP.md`, config | yes, read-back |
| 0 | Inventory sibling skills | none (`ls skills/`) | skill descriptions | nothing | no |
| 2 | Map ICP types to Google categories | none (reasoning) | ICP | runsheet queries | no |
| 3 | Build config + runsheet | `gen-runsheet.js` (per client) | geo, categories | `<client>-config.json`, runsheet | yes, read-back |
| 4 | Scrape | `run-scrape.js` (`--resume`) → `scrape.js` | runsheet | `leads_clean.csv`, `excluded.csv`, `run_log.json` | no |
| 5 | Calibrate | none (reading) | `run_log.json` | gap rows added to runsheet | no |
| 5b | Qualify by rules | `qualify-leads.js` | `leads_clean.csv`, config | `leads_clean_qualified.csv` | yes, drop-reason audit |
| 5b-geo | Footprint gate (areas mode) | `footprint-gate.js` | qualified | `..._infootprint.csv` | no |
| 5c | Cross-run dedupe per client | `build-netnew.js --client` | prior runs | `leads_netnew.csv` | yes if `ref files used: 0` on a repeat client |
| 5c-dom | Collapse domains, route shared hosts | `collapse-domains.js` | netnew | `leads_domains.csv`, `leads_nowebsite.csv`, `domain_siblings.json` | no |
| 5d | No-website recovery | `prep-website-recovery.js`, `apply-*.js` | nowebsite | recovered domains | no |
| 5e | Site-text fit classification | `prep-classify.js`, `apply-classify.js` | site text | `leads_icp.csv` | no |
| 6a | Build the owner prompt | none (reasoning from template) | `owner-prompt.template.md`, ICP | `owner-prompt.md` | yes, approve DECISIONS |
| 6 | Fetch site text (+ SERP if a backend exists) | `fetch-sites.js`, `search-owner.js` | `leads_domains.csv` | `site_text.jsonl`, `serp_text.jsonl` | no |
| 6 | Build the Clay feed | `build-clay-csv.js` | annotated leads + owner texts | `clay.csv` | refuses without `owner-prompt.md` |
| 7 | Hand off | none | `clay.csv` | Clay | final report |

Step 0 sits after step 1 in `SKILL.md` because it needs the intake answers to know which
capabilities the run will touch.

## 4. What the operator must answer before any spend

Eight questions, all in `SKILL.md` STEP 1. In one line each:

1. Which client. This is the dedupe scope and the folder.
2. The footprint, as an explicit list of cities, areas, or ZIPs.
3. How fuzzy edges resolve: postal allowlist or named areas.
4. The ICP business types.
5. Exhaustive or fast: primary categories only, or overlaps too.
6. The qualification rules, each as one declarative rule. Review floors are for consumer-facing trades only.
7. The offer, in one sentence. This decides which roles are decision-makers.
8. The target role. Written into the client's `ICP.md`, never left implicit.

The config and runsheet are read back to the operator before the first API call.

## 5. Gates: where the run stops and shows its work

| Gate | What is shown | Why it exists |
|---|---|---|
| Read-back (STEP 3) | footprint, categories, tile count | a wrong city costs real API calls |
| Drop-reason audit (STEP 5b) | counts per drop reason, samples | a bad category map shows here, not in Clay |
| Dedupe check (STEP 5c) | `ref files used: N` | N = 0 on a repeat client means the history is missing |
| Owner prompt (STEP 6a) | the `## DECISIONS` block, KEEP and EXCLUDE lists | a wrong owner is worse than no owner |
| Final report (STEP 7) | the funnel with real numbers, what shipped, what did not | the operator hands this to the client |

A gate is a stop. The run does not proceed past one on its own.

## 6. Where files live

**This folder holds the engine only.** Nothing client-specific is ever written here.

| File | What it is |
|---|---|
| `SKILL.md` | the procedure, step by step |
| `runbook.md` | the scraper.tech API: endpoints, fields, the two behaviours that force tiling |
| `owner-finding.md` | the owner-finding method, where names live per vertical, source cost tiers |
| `owner-prompt.template.md` | the fixed scaffold every job's `owner-prompt.md` is built from |
| `owner-prompts.md` | an older worked example, legacy two-column layout, for the reasoning only |
| `HANDOFF.md` | the intake form and glossary for a non-technical operator |
| `IMPROVEMENTS.md` | the bug and lesson backlog; read the OPEN items before a big run |
| `*.js` | the engine scripts named in section 3 |
| `tests/` | the engine's test suite; run it after any engine change |
| `.env` | `SCRAPER_TECH_KEY` and, if a SERP backend exists, its key; never committed |

**The client folder** (`clients/<client>/`) holds everything about one client:

```
clients/<client>/
  <client>-config.json        geo + qualify_rules + owner_query
  <client>-runsheet.csv       one row per tile, plus gen-runsheet.js
  ICP.md                      the offer, footprint, business types, target role, KEEP/EXCLUDE
  STATE.md                    what shipped, what is pending, standing client directives
  owner-prompts/<vertical>.md the prompt library; built once per vertical, reused
  YYYY-MM-DD_<vertical>/      one dated folder per scrape run
  _archive/                   dead or superseded runs
```

**The run folder** holds that run's outputs and any one-off scripts written for it. Lead lists,
contacts, and anything with a person's name or email are gitignored. The repo holds process, not
deliverables. A one-off script in a run folder is a smell to log, not a pattern to copy.

## 7. Owner-finding: how names are found, and who reads the text

The design separates two jobs on purpose:

- **Deterministic scraping** fetches text. Node, parallel, cheap, resumable.
- **A model reads the text** and names the people, using the job's `owner-prompt.md`.

The prompt is generated per vertical from the template, with a `## DECISIONS` block that says in
plain language why each role is kept or excluded. The production reader is one Clay nano column
over `clay.csv`. For a pilot of under about a hundred leads, a Haiku subagent per batch reading the
same prompt is acceptable. **A regex or keyword parser is never the reader.** It cannot tell
"Rick & Anna Lee Woods, Owners" from "Royal Foundation Repair, Inc.", and it cannot apply an
EXCLUDE list. That failure happened on the Atlas Growth run and is logged in `IMPROVEMENTS.md`.

Where names live differs by vertical, and it is the first thing to establish on a new one:

- Healthcare and professional services publish owners on their own site. Yield around 84 percent.
- Home-services trades mostly do not. The site says "family-owned since 1987" and names nobody.
  For these, **BBB Business Profiles are the owner registry**, then ZoomInfo, LinkedIn, chambers.
- Dealer networks (Basement Systems, Supportworks, Groundworks) publish a full roster on a
  templated team page, at the bottom, past the default capture cap.

Three searches on leads the site failed on tell you which registry a vertical uses.
`owner-finding.md` has the method and the cautions.

## 8. What each run costs, and which budget binds

| Cost | Unit | Rule of thumb |
|---|---|---|
| Maps API | one call per tile; saturated tiles add up to four | low hundreds for a metro ICP; 1,410 tiles for a ten-state build |
| Site fetch | free, network-bound | concurrency 12; large host counts saturate a home network |
| Model reading | tokens | pay once per lead, on pre-scraped text, never let the model browse |
| In-session WebSearch | tokens, no key | calls in one message run in parallel; ten at a time is tested. Results vary between runs |
| SERP vendor | per query | only after the free rungs in `web-scrape-triage` are exhausted at real volume |
| Clay | credits per row | filter `evidence_tier != NONE` before anything paid |

The cheapest source per owner found is a dedicated team page. The most expensive is a paid
vendor whose results turn out to be title-only. Confirm on three leads that a source returns the
field you need before building a sweep on it.

## 9. Sibling skills: what to hand off, and when

| You need | Hand off to | Do not |
|---|---|---|
| to decide the source, or write a client sample | `icp-source-planner` | assume Maps is the only source |
| a page 403s, Cloudflare, a hidden API, a free SERP | `web-scrape-triage` | buy a SERP key or write a nav-stripper |
| a domain for a business with no website | `name-to-domain` | guess from the name |
| emails verified before a send | `email-verify-debounce-bounceban` | design a waterfall |
| a keep/drop classifier on page text | the Haiku-per-batch pattern in `web-visitor-deid-qualify` | keyword rules |
| a directory (Clutch, DesignRush) instead of Maps | `directory-lead-sourcing` | force it through Maps |
| a review of the live campaign this list fed | `campaign-review` | judge targeting without the client's ICP doc |

These live in `skills/` as folders, not as registered Claude Code skills. Invoking one means
reading its `SKILL.md`. `SKILL.md` STEP 0 makes the inventory a required step.

## 10. Known landmines

The OPEN items in `IMPROVEMENTS.md`, in the order they bite:

- `scrape.js` writes `run_log.json` only at the end. A killed run loses every tile it bought. Launch long jobs through the harness's background runner, never `nohup … &` inside a tool call.
- `readRunsheet` does not honour the quoting `writeRunsheet` emits. A city with a comma breaks a resume.
- `fetch-sites.js` caps L2 pages at 2,800 characters. Team rosters sit past the cap.
- `fetch-sites.js` lets a TypeError or AbortError escape a worker. The pool then exits silently with promises pending.
- `search-owner.js` has no live backend. It degrades silently when a vendor returns empty `url` fields.
- Out-of-business flags in site text are not gated.
- `areas` mode has no footprint gate. Use `footprint-gate.js` after qualify.
- A review-count floor is wrong for B2B ICPs. It drops most real firms.

## 11. After the run: the write-back

Three stores, kept separate so the skill grows without rotting:

- **Bugs, gotchas, backlog** → `IMPROVEMENTS.md`, in its existing format.
- **Method** → `SKILL.md`, gated. A fact from one run can go in. A change to a step, a threshold,
  or a default needs two runs or the operator's sign-off.
- **This client's state** → `clients/<client>/STATE.md`: what shipped, what is pending, directives.

And one store outside this folder: a **source profile** in `icp-source-planner/library/` for the
vertical, so the next run of the same trade starts from evidence.

## 12. Glossary

- **Footprint**: the geography the client wants leads in.
- **Tile**: one Maps search at one lat/lng and zoom. Completeness comes from many tiles, not one big search.
- **Saturation**: a tile returning near its cap. It is split into four and re-queried.
- **`place_id`**: Google's stable ID for a business. The dedupe key everywhere.
- **Qualify rules**: declarative filters in the config. Website required, review floor, category allow/deny, brand blocklist.
- **Shared host**: a website on Facebook, Wix, or `g.page`. Routed to recovery, never fetched for owners.
- **Representative**: the one row per root domain that gets fetched. Siblings read its text.
- **Owner prompt**: the per-vertical instructions a model follows to name decision-makers.
- **KEEP / EXCLUDE**: the roles that can say yes to the offer, and the roles that will be mistaken for them.
- **Evidence tier**: whether a row carries site text, SERP text, both, or nothing, computed before Clay.
- **Gate**: a point where the run stops and shows the operator its work.
