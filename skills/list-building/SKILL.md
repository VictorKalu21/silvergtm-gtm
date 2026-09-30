---
name: list-building
description: >-
  Use when a client asks for "N verified companies that match X" (any vertical, any criteria): the
  end-to-end method for turning a brief into a funnel, sizing the ceiling before promising a count,
  running free gates then LLM classify then expensive verification, and shipping a pool + strict cut
  + funnel doc. Distilled from the Shopify-not-on-Amazon project (4 runs, 270k stores screened,
  2,685 verified leads). Pair with icp-source-planner (which source) and shopify-not-on-amazon (a
  worked instance). Use for one-shotting a new list from a brief.
---

# List building: the method

**One sentence:** a lead list is a funnel where every criterion becomes a cheap, auditable signal,
run cheapest-first, keyed by domain, resume-safe at every step, with the ceiling measured before
any number is promised.

## 0. Read the brief as filters, not adjectives

Turn every phrase into a `(criterion, signal, source, cost, false-positive risk)` row before touching
data. "Established" is not a filter; "50k+ monthly visits (DataForSEO)" is. Write the table into the
funnel doc on day one and get the client to agree the *signals*, because they decide the ceiling.

| Brief says | Signal | Source | Cost |
|---|---|---|---|
| "on Shopify" / any tech stack | HTTP Archive technologies table (CrUX rank ≤5M) | BigQuery, free | 0 |
| "US company" | store `/meta.json` country, address on policy pages | free fetch | 0 |
| "established" / "real brand" | visits/mo (DataForSEO, $0.11 per 1,000 domains), catalog size, age | cheap | ~$25 per 225k domains |
| "sells physical products" / "not dropship" | `/products.json` (requires_shipping, vendor diversity, POD app fingerprints) | free fetch | 0 |
| "not on Amazon" (any *absence* criterion) | direct check against the hostile source, full-strength, with stored evidence | crawl | time, IP budget |
| "demand" | Amazon autocomplete (free) + DataForSEO branded volume (~$0.13 per 1,000) | cheap | <$1 per 5k |
| "decision maker + email" | QuickEnrich / GetLeads / Apollo, then MillionVerifier + BounceBan | paid per row | last, deliverable rows only |

Absence criteria ("NOT on X") are the expensive ones: proving a negative needs the full-strength
check on every candidate, and the search term you use is the number-one error source (see §5).

## 1. Size the ceiling before promising a count

Pull the whole universe and gate it on the cheapest filters first; the count that survives the
cheap gates, times the observed keep rates, is the honest ceiling. On the Amazon project the
strict bar (50k visits, 1,000 branded searches) had a hard ceiling of ~417 in the entire ≤5M-rank
universe; 1,000 only existed at 20k visits with no search floor. Say that on day two, not day
twelve. Keep a scenario table (floor A × floor B × cap) in the funnel doc and update it every run.

Observed keep rates (rank ≤1M vs 1M–5M): free gates 55–70%, LLM classify 55–60% vs 45%, "not on
Amazon" 40–46% of verified, lead review 75–80%. Multiply through.

## 2. Funnel order: free → cheap → LLM → expensive → paid, and gate only survivors

1. **Census** (free): HTTP Archive / Tranco+DNS / directory scrape. Save the raw pull.
2. **Cheap paid gate** (DataForSEO traffic) BEFORE the crawl, so the crawl only touches stores above the bar.
3. **Free crawl gates**: the target's own machine-readable endpoints. Three fetches per domain, CONC 4–5 with a 1 s delay from a datacenter IP (Shopify's bot wall locks the IP at higher rates; a same-day retry recovers ~70%, a residential proxy the rest).
4. **LLM classify** (Haiku, 100 rows per batch, one subagent per batch, 20 concurrent). Cheap, fast, ~45–60% keep.
5. **Expensive verification** against the hostile source, full strength, evidence stored per row.
6. **Search-term sanity pass + re-crawl** (§5), then **rescore offline** from stored evidence.
7. **LLM lead review** with a fixed category list and a **drop-reason guard** (§4).
8. **Cheap demand signal** (branded search volume) on lead rows only.
9. **Final merge → pool → select** (denylist, delivered-exclusion, category cap, floors, top N).
10. **Enrichment last**, only on the rows that will ship, only after the client agrees titles and credit spend.

## 3. Engineering rules that saved the project

- **Key everything by domain, never by index.** Merge by domain. Reviewers rename domains
  (`arranmore.com` for `arranmorelighting.com`): map outputs back to the nearest input domain.
- **Every step resume-safe**: checkpoint every 10–50 rows, `done` set on disk, `RETRY=1` re-fetches
  only blocked/unreachable rows, `ONLY=a,b` re-runs named rows, `REPASS=1` accumulates evidence.
- **Stream big inputs.** Holding 16k crawl rows in memory OOM'd Node; run with
  `--max-old-space-size=4096` or write rows as they finish.
- **Validate every LLM batch file**: parses, same count, same domain set. Two of 29 came back wrong.
- **Store evidence, not just verdicts** (URL, byline, seller, ASINs checked). Then any rule change is
  a `RESCORE` over stored pages, not a re-crawl. Keep a rule test suite (78 cases here) and run it
  on every matcher change.
- **Hostile sources have a per-IP budget.** Amazon: ~3,000 brands per open window from a datacenter
  IP, then a 503 wall that held 4 h the first time and 20+ h the second. Use the supervisor pattern
  (probe → pass → pause when >40% of the last 20 rows are blocked → cool 2 h) or a residential IP
  (847 brands in 2 h, zero blocks from a home connection). Per-GB residential proxy ≈ $10–15 per
  5,000 brands; per-page scraping APIs are 10× that and return empty pages once credits hit zero.
- **Measure paid cost on 3 rows, then read the provider's balance endpoint**, not the response
  body. The response said 0.17 credits a store; the balance said 11.

## 4. LLM steps: how to keep Haiku honest

- One subagent per 100-row batch, JSON in / JSON out, exact input domains, "reply with counts only".
- Give the reviewer the **allowed drop reasons** and tell it what is *never* a reason (Amazon
  status, catalog size, missing contacts). Then run a **guard** that reverts drops whose reason is
  not on the list. Keep the allowed list wide (merch, licensed, artist, restaurant, B2B,
  publication, foreign parent) or the guard reverts valid drops; extend it from each run's
  `[review drop overridden: …]` notes.
- Fixed category vocabulary in the prompt; free-text categories are useless for caps.
- Expect 5–10% of batches to need a re-run (wrong count, invented domains, empty reasons).

## 5. The search term is the verdict

For any "is X present on Y" check, the term you search for decides the answer. The site `<title>`
is a tagline a third of the time ("curly", "tropical fish", "hotel-inspired footwear"). Have Haiku
return the brand name *as the target platform would name the store*, then post-filter the
suggestions before re-crawling: reject anything with `|`, `:`, `.com`, `llc`, `dba`, > 5 words,
concatenation regressions ("comfort pure" → "comfortpure"), a dropped word that is in the domain,
or a leading "the" dropped. On run four 38% of terms changed, 12% of the suggestions were junk,
and the re-crawl moved 237 "absent" rows to "present". That is the false-positive class a client
notices first.

## 6. Delivery shape

Ship four files plus a funnel doc, all excluding rows already delivered:

- `POOL_all.csv` — everything verified, no floors, uncapped. The client cuts from here.
- `POOL_strict_capped.csv` — the agreed bar, category cap applied.
- `TOP<N>.csv` — ranked top N at the agreed bar.
- `scenario_*.csv` — one file per alternative floor combination, so the "can we get to 1,000"
  conversation is a table, not an argument.
- `FUNNEL.md` — counts per step per run, keep rates, what was hand-checked and what was not,
  cost per provider, the ceiling statement.

Contact columns are informational, never a filter, unless the brief says contacts are the
deliverable. Hand-check every row in the strict cut (name-pattern scan: store, supply, outlet,
depot, fabrics, liquor, records, parts) and feed the denylist; say plainly which tiers were
hand-checked and which were LLM-only.

## 7. Credit and comms discipline

- Never spend paid credits (enrichment, scraping APIs) without an explicit go on the exact row
  count and the exact titles. Sample 3 rows first.
- Never write keys or PII into the repo; keys only as env vars on the command line. Remind the
  client to rotate any key pasted in chat.
- Report progress as a table with the same rows every time; say ETA in hours and what could move
  it. Say what was skipped and why. Check-ins every 3–4 h on long crawls, not hourly.

## 8. Costs and timings from the reference project (Sept 2026)

| Item | Cost / time |
|---|---|
| HTTP Archive census, 270k Shopify domains | free (BigQuery sandbox) |
| DataForSEO traffic, 225k domains | ~$25 |
| DataForSEO branded volume, 5,157 keywords | ~$0.66 |
| Free gates, 16k stores, CONC 5 | ~1.7 h + 2 h retry |
| Haiku classify, 9,131 rows (92 batches) | ~40 min at 20 concurrent |
| Amazon verify, 5,157 brands | ~14 h wall-clock from a datacenter IP (walls); 2 h for the last 847 from a home IP |
| Term review + re-crawl, 1,017 rows | ~20 min Haiku + 4.5 h crawl |
| Lead review, 2,846 rows (29 batches) | ~35 min |
| QuickEnrich (300 credits) + GetLeads (~235 credits) on 226 rows | 117 in-title decision makers, 148 sendable emails |

## One-shot brief template

`prompts/one-shot-brief.md` is the prompt to paste for a new list. Fill the four blanks; it
forces the criteria table, the ceiling estimate and the scenario table before any crawl.
