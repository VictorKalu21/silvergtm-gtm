---
name: meta-adlib-teardown
description: >-
  Free competitor ad research off the Meta (Facebook/Instagram) Ad Library — discover who
  is advertising in a vertical, pull their FULL ad history, and build a swipe file + angle
  teardown + interactive HTML report showing which ads are WINNING (longest-running = the
  proxy, since Meta hides spend on commercial ads). Use this WHENEVER the user wants to
  research competitors' ads, build an ad swipe file, find winning/long-running ads, tear
  down a vertical's Facebook/Instagram advertising, see "what angles are working" in a
  market, analyse what rivals are running, spy on an advertiser's creative, or prep ad
  angles before writing new creative for a client. Reach for it even when the user only
  says "look at what competitors are running on Facebook", "what ads are working in
  <vertical>", "scrape the ad library", "build me a swipe file", or names a client vertical
  and wants ad intel — don't hand-browse the Ad Library or suggest a paid scraper first.
  Config-driven (engine-vs-config): each vertical is one JSON config.
---

# Meta Ad Library Teardown

Turn the public Meta Ad Library into competitor intelligence: **who advertises in a vertical,
what they run, and which ads actually win**. Entirely free (no paid API, no Firecrawl) via Scrapling.

**The deliverable is always three things:**
1. **`swipe_file_full.csv`** — every captured ad, angle-tagged, sorted by days-running (the data).
2. **`report.html`** — the interactive teardown (stats, angle bars, champion cards, searchable table).
3. **A written teardown** (markdown) — market structure, what wins, the swipe exemplars, what to steal.

All three come from in-vertical advertisers only — **keyword-collision false positives are removed**
during curation (see the mandatory CURATE step below), so the swipe file and report never contain the
webnovel/game/ecommerce junk that generic search terms drag in.

## Why longevity = winning
Meta publishes **no spend or impression data** for commercial (non-political) ads. The reliable
proxy is **`days_running`**: an ad a contractor has paid to keep live for 200+ days is, by
revealed preference, making money. Short-lived ads (the UK norm is a ~7-day median) are mostly
spray-and-pray. So the whole method ranks by longevity, not by cleverness or recency.

## Engine vs config
The three scripts in `scripts/` are a **fixed engine** — never fork them per job. Everything
vertical-specific lives in a **JSON config** in `configs/`. To research a new vertical, write a
new config; don't edit the scripts. Bundled example configs: `damp.json` (single-market UK),
`cladding.json` (multi-market UK vs US). Read one before writing a new one — they show the shape.

A config holds: `vertical`, `display_name`, `countries`, `discovery_terms` (per country),
`angle_taxonomy` (name → regex, the heart of the teardown), `angle_colors`, a curated
`allowlist` of `[page_id, country, name]`, and optional `exclude`.

## Workflow

Run from the skill directory with **py-3.13** (Scrapling fails on 3.14). Pick a workdir for the
job's data (e.g. a client folder or `adlib-pilot/<vertical>/`). The three stages:

### 1. Discover — find advertisers + page_ids (free, ~10 min for ~25 terms)
```
py -3.13 scripts/discover.py configs/<vertical>.json <workdir> [country|all]
```
Writes `<workdir>/discover_<country>.csv` ranked by ad volume. This is keyword search, which
only surfaces advertisers (capped ~30 ads/term — fine, we only need the page_ids).

**Then CURATE — this step is mandatory, human-judged, and CONFIRMED WITH THE USER before any pull.**
Generic terms pull heavy **keyword-collision junk** (e.g. "tanking"/"mould"/"render"/"which" drag in
ecommerce, mobile games, webnovels, SaaS). `discover.py` pre-flags the obvious junk with a
`likely_junk` column (sort by it to triage fast), but the flag is a hint, not a decision.

Do NOT silently decide the allowlist yourself. Read the discover CSV, draft a proposed allowlist
(the real in-vertical advertisers — usually contractors/installers) and a proposed drop list
(flagged junk + suppliers/trade-stores, trade bodies, lead-brokers, off-vertical firms), then
**show both to the user and ask them to confirm or adjust** — they know the vertical and who counts
as a real competitor. Only write the confirmed `allowlist` into the config and proceed to the pull
once the user has signed off. This keeps false positives out of the swipe file and report, and keeps
the human in control of who's "in-vertical." See `references/method.md` for the collision patterns.

### 2. Pull — full ad history for the allowlist (free, ~1 min/advertiser)
```
py -3.13 scripts/pull.py configs/<vertical>.json <workdir>
```
Captures every ad (active + inactive) per allowlisted page via GraphQL-response interception
during a scroll — not just the ~30-ad first payload. Angle-tags with the config taxonomy, sorts
by `days_running`, writes `<workdir>/swipe_file_full.csv`.

### 3. Report — interactive HTML teardown
```
py -3.13 scripts/report.py configs/<vertical>.json <workdir>
```
Writes `<workdir>/report.html`: top-line stats, longevity-weighted angle bars, top-10 champion
cards (deduped by near-identical copy, with live Ad-Library links), and a searchable/sortable
table of every unique-copy group. Multi-market configs get a Market column + per-market strip.

### 4. Distill (you, not a script)
Read the swipe file and report, then write a short teardown: market structure (ad counts, median
vs max days — the discipline gap), the angle distribution and what it says the market rewards,
the uncrowded angles to test, and 4-6 named swipe exemplars with their copy and why each wins.
Call out what the client is missing vs the longevity winners. This prose is the actual deliverable.

Two lenses that sharpen it beyond raw angle share (both repay the effort):
- **Winner over-representation, not just frequency.** An angle in 20% of all ads but 60% of the
  200-day+ survivors is a *winning* angle; one that's common but only in short-lived ads is noise.
  Compare each angle's share among long-runners vs the whole population — that's what the market
  rewards vs what everyone just does.
- **Segment by buyer where the copy reveals it.** Durable advertisers often run distinct ads for
  distinct buyers (homeowner vs landlord/letting-agent vs commercial). Note which buyer each champion
  targets and which segment the strongest copy serves — it's often where the client's whitespace is.

## Operating notes
- **Always confirm the vertical, country, and who counts as "in-vertical"** before building the
  config — the allowlist curation depends on it.
- **Run detached / keep the laptop awake.** The scrape is a real browser; if the machine sleeps,
  fetches abort silently (you'll see a flood of errors and recover ~0). Just re-run.
- The `[2026-...] ERROR: No Cloudflare challenge found.` log line is **informational**, not a
  failure — Scrapling just didn't need to solve a challenge that time.
- Setup once: `py -3.13 -m pip install scrapling` then `py -3.13 -m scrapling install` (browsers).
- Deeper method, gotchas, and the angle-taxonomy design live in `references/method.md`.
