# Owner-Finding — Phase 2 of google-maps-scrape

Goal = capture **all decision-makers** per business (owners/partners + each provider + office/practice manager + any other KEEP role for the offer), not a single owner — e.g. the office manager is a primary target for a sponsorship offer, not a fallback. The KEEP/EXCLUDE roles are decided per job in STEP 1 and written into the generated `owner-prompt.md` (SKILL.md STEP 6a).

**Pipeline (build the Clay feed, then Clay is the last mile — we don't come back):**
1. `fetch-sites.js` on `leads_clean_qualified.csv` → `site_text.jsonl` (homepage + L2 pages incl. About / Team / Meet-the-Team).
2. `search-owner.js` on ALL qualified leads (query is `"<business> <area> <ST>"` — state read per-lead from `city` — NOT "...owner", so results name the whole team). → `serp_text.jsonl`.
3. `build-clay-csv.js --leads <out>/leads_clean_qualified.csv --dir <out>/owner --out <out>/clay.csv` → one upload-ready CSV, `site_text`/`serp_text` signal-first & under Clay's 8KB cell cap.
4. **In Clay:** ONE nano Claygent column — paste the job's `owner-prompt.md` and map ALL source columns into it (`{{site_text}}` + `{{serp_text}}`, plus `{{ch_directors}}` when present). It reads all sources in one pass and emits ONE deduped JSON array of contacts → contacts table → email waterfall. `best_send_email` falls back to the on-site `emails` column so every lead has a target (no manual review).

Deferred: no-website leads (in `excluded.csv`, dropped on no-website alone — not yet qualified for social presence; separate track).

**Pilot result (50 ICP-1 healthcare leads): 84% decision-makers found (18 website + 24 SERP), 0 fabrications, ~$0 AI cost.** Named yield is vertical-dependent: healthcare ≈84%; used-car/high-ticket retail ≈44% (dealers don't publish owners; reviews name salespeople, who are excluded). The rest fall back to on-site generic email + GMaps phone.

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
