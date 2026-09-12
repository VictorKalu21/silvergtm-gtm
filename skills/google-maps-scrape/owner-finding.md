# Owner-Finding — Phase 2 of google-maps-scrape

Goal = capture **all decision-makers** per business (owners/partners + each provider + office/practice manager + any other KEEP role for the offer), not a single owner — e.g. the office manager is a primary target for a sponsorship offer, not a fallback. The KEEP/EXCLUDE roles are decided per job in STEP 1 and written into the generated `owner-prompt.md` (SKILL.md STEP 6a).

**Pipeline (build the Clay feed, then Clay is the last mile — we don't come back):**
1. `fetch-sites.js` on `leads_clean_qualified.csv` → `site_text.jsonl` (homepage + L2 pages incl. About / Team / Meet-the-Team).
2. `search-owner.js` on ALL qualified leads (query is `"<business> <area> <ST>"` — state read per-lead from `city` — NOT "...owner", so results name the whole team). → `serp_text.jsonl`.
3. `build-clay-csv.js --leads <out>/leads_clean_qualified.csv --dir <out>/owner --out <out>/clay.csv` → one upload-ready CSV, `site_text`/`serp_text` signal-first & under Clay's 8KB cell cap.
4. **In Clay:** ONE nano Claygent column — paste the job's `owner-prompt.md` and map ALL source columns into it (`{{site_text}}` + `{{serp_text}}`, plus `{{ch_directors}}` when present). It reads all sources in one pass and emits ONE deduped JSON array of contacts → contacts table → email waterfall. `best_send_email` falls back to the on-site `emails` column so every lead has a target (no manual review).

Deferred: no-website leads (in `excluded.csv`, dropped on no-website alone — not yet qualified for social presence; separate track).

**Pilot result (50 ICP-1 healthcare leads): 84% decision-makers found (18 website + 24 SERP), 0 fabrications, ~$0 AI cost.** Named yield is vertical-dependent: healthcare ≈84%; used-car/high-ticket retail ≈44% (dealers don't publish owners; reviews name salespeople, who are excluded). The rest fall back to on-site generic email + GMaps phone.

## WHERE the names live, per vertical (fill this in every job — it is the whole ballgame)

The pilot yields above (healthcare ≈84%, used-car ≈44%) are a *consequence* of this, not a
property of the vertical's difficulty: a vertical's yield is set by whether its trade publishes
owners, and WHICH third-party registry does when it doesn't. Decide this in STEP 1 and write it
into the job folder, the same way KEEP/EXCLUDE roles are decided per job.

**Home-services trades (foundation repair, roofing, HVAC, plumbing, restoration) — measured on
Atlas Growth, 871 leads:**
- The company's own site is a WEAK source. 871 ICP sites yielded a title-adjacent name on only
  ~16%. These firms say "family-owned since 1987" and name nobody — the phrase is marketing copy,
  not a contact. Do not budget site text as the primary source for this vertical.
- **BBB Business Profiles are the owner registry.** A BBB profile lists the principal by name and
  title. In testing, BBB ranked #1 for the plain `"<business>" <city> <ST> owner` query on
  unrelated leads in TX/CO/OK/MS, and resolved owners the website never mentioned (8/8 leads that
  site text had failed on). Secondary registries, in observed order of usefulness: ZoomInfo person
  pages, LinkedIn company/person pages, local chamber-of-commerce member profiles, Procore.
- **Dealer networks are a separate, richer seam.** Basement Systems / Supportworks / Groundworks
  dealers run a templated `about-us/meet-the-team.html` that lists the WHOLE roster with titles —
  owner, GM, Director of Marketing, Sales Manager. For an offer sold to marketing or the GM this
  is better than an owner name alone. Two cautions, both hit in the Atlas run:
  (a) the roster sits at the BOTTOM of the page, past `fetch-sites.js`'s 2,800-char `L2_CAP`, so
      the capped capture truncates the names off — re-fetch those pages uncapped;
  (b) the corporate roll-up domains (groundworks.com, afsrepair.com, aquaguard.net,
      helitechonline.com, foundationrecoverysystems.com) return **HTTP 403** to a plain fetch.
      Independents generally do not. Losing the roll-ups matters little: they are `brand_family`
      flagged and corporate-owned, so they are the weakest buyers for a local offer anyway.

**How to decide it for a NEW vertical:** take 3 leads the site text failed on, run the plain
`"<business>" <city> <ST> owner` query, and read WHICH domains rank. That is the registry. It cost
3 searches to establish for foundation repair and it set the whole pipeline design.

## Tier the sources by cost — and know which budget binds

Order the run cheapest-first, but measure cost in the currency that is actually scarce:

| tier | source | vendor $ | tokens/lead | yield | leads per turn |
|---|---|---|---|---|---|
| 1a | dedicated owner/team page (re-fetched uncapped) | 0 | ~700 read | ~100% of pages that fetch | ~12 |
| 1b | general site text already on disk | 0 | ~600 read | ~16% (home-services) | ~15 |
| 2  | web search | 0 (in-session) / SERP key | ~1,100 | ~80–100% | ~10 (parallel calls in one message) |

Per owner FOUND, tier 2 beats a blanket tier-1b read. In-session `WebSearch` calls issued in ONE
message run in parallel — ten at a time is tested (Atlas Growth, 2026-09-12: 72 leads swept, 81%
hit). An earlier version of this file said "one turn per lead, does not parallelize"; that was an
untested claim and it was wrong. The real limits are (a) results are non-deterministic between
runs, (b) every result is read in the main context, so 800 leads is roughly 80 messages of ~10
searches each, and (c) the model doing the reading is the session model, the most expensive
reader there is. So: in-session search is right for pilots, the high-value head, and gap-filling;
for the bulk, dispatch batches to a cheaper reader (Haiku subagent per batch, the same shape as
`name-to-domain`; or the Clay column). Do not buy a SERP key before walking `web-scrape-triage`
Tier 2, and confirm on 3 leads that a vendor returns the FIELD you need — one plan bought on
this run returned titles with empty `url`/`description` and was useless for owner-finding.
Tier 1a is the one tier that is cheap in every currency: parallel HTTP plus batch reading.

## Principle (proven in real testing)

Separate **deterministic scraping** from **AI reasoning**. Crawl in cheap Node; let a small model read clean *text* and name the people. Never make the model navigate pages — that's where small models fail and token costs explode. Lean queries for recall; full-identity entity-match for precision.

## Running the AI step — Clay is the path

The job's `owner-prompt.md` runs **as ONE Clay nano Claygent column** (all sources mapped into it — `{{site_text}}` + `{{serp_text}}`, plus `{{ch_directors}}` when present) over the uploaded `clay.csv`, emitting one deduped contacts array. That's the production path and the operator already has a Clay account — there is no local batch script and none is needed. Clay also does the downstream email waterfall, so the pipeline ends there.

Alternatives (not built / not for the operator flow): a Claude Code Haiku **subagent** works for a ≤~100-lead pilot but burns Claude Code credits ("credit bonfire" — don't use it to scale); a direct Haiku API batch would be the cheap-at-scale option but isn't implemented because Clay covers it.

## Guardrails that keep a small model honest (baked into the template)

These are the universal honesty rules; the per-job prompt inherits them from `owner-prompt.template.md`. (Note: `owner-prompts.md` is an older worked example still in the legacy 2-column layout — the current shape is the single column in the template; use it for the KEEP/EXCLUDE reasoning, not the column structure.)

- **Evidence quote must contain the person's name, or drop them.** (Caught the one hallucination in the pilot.)
- **Keep the full name** — never truncate to just the first name; honorifics/credentials live in `title`, never in `name`.
- **Entity-match on the full identity** — `site:linkedin` returns same-name businesses from other cities; accept a contact only if its result corroborates THIS business (name + city/area/state). Wrong owner is worse than no owner.
- The business name itself is a valid name source (e.g. "Varadi Zoltan DDS" → Zoltan Varadi).
- Never guess. Unsure = drop the contact.
