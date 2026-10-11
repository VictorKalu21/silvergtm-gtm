# Method, gotchas & config design

## How the scrape works (why it's free)
Meta's Ad Library page is behind a `__rd_verify` JS challenge; plain `curl` is blocked. Scrapling's
`StealthyFetcher.fetch(url, solve_cloudflare=True, network_idle=True)` clears it for free (no
Firecrawl / paid unlocker). The rendered page embeds its data as inline GraphQL JSON; every ad is a
`{"ad_archive_id": ...}` object we extract with `json.JSONDecoder().raw_decode`.

Useful fields per ad: `page_name`, `page_id`, `page_profile_uri`, `start_date` + `total_active_time`
(→ `days_running`, the winning proxy), `is_active`, `collation_count` (Meta's own variant count),
`snapshot.body.text`, `snapshot.title`, `link_url`, `cta_text`.

## The two-stage design (discover → pull) and why
- **Discovery** is keyword search (`?q=...&search_type=keyword_unordered`). It returns only the first
  payload (~30 ads, impression-sorted) — enough to surface *who* advertises and their `page_id`, but
  not their full history. Never treat discovery counts as the real picture.
- **Pull** is by `view_all_page_id=<id>` — the advertiser's whole library. Full capture is NOT
  DOM-scroll (the list virtualises, the HTML stays ~30) and NOT token-replay. It works by attaching a
  Playwright `page.on("response")` handler inside Scrapling's `page_action`, scrolling (mouse-wheel +
  End key), and harvesting `{"ad_archive_id"...}` objects from each GraphQL response body during the
  scroll; dedupe by `ad_archive_id`, merge with the final HTML. Early-stop after ~4 consecutive flat
  readings. This reliably hits ~90-100% of a page's `page_total_ads`.

## Why `search_type=keyword_unordered` + the collision tax
`keyword_unordered` over-matches: it returns anything containing the tokens. Generic single words are
the worst offenders. Observed collisions:
- **damp vertical:** "tanking"/"mould"/"which" → SHEIN, DramaBox, Romance Novel, mobile games
  (Archero), webnovel apps, beauty ecommerce. ~85% of raw discovery rows were junk.
- **cladding vertical:** "render" → ReRender (AI 3D-render SaaS), FL Studio, Forno Bravo (pizza-oven
  stucco); "support" → health community pages.
- **ED vertical (earlier):** male-performance terms → webnovel/romance apps + lead-gen arbitrage.

So: **a human curation pass on the discover CSV is mandatory**, and the `allowlist` in the config is
the real quality gate. Prefer an allowlist over auto-top-N. Searching **named advertisers directly**
(put a few known brand names in `discovery_terms`) grabs their `page_id` cleanly with no collision.

## Who to keep vs drop in the allowlist
Keep the advertiser *type the user is competing with* — usually **contractors/installers/service
providers**. Drop (or explicitly flag if kept):
- **Suppliers / trade-stores** (they sell product to the trade, not services to homeowners) —
  e.g. EWI Store, Permagard, timber merchants.
- **Trade bodies / associations / directories** (e.g. "Federation of Damp").
- **Lead-brokers / affiliates** (sell leads to contractors — e.g. Cost Guide). Different business model.
- **Off-vertical adjacents** that share a keyword (spray-foam removal, bathroom reno, claims-management,
  ECO-grant insulation) — judgment call per job.

## Angle taxonomy design (the heart of the teardown)
`angle_taxonomy` maps an angle name → a case-insensitive regex matched against body+title. It is
**per-vertical** — the angles that matter in damp (technical-authority, trust-proof, free-survey,
health) are not the ones in cladding (transformation, energy-insulation, financing, aesthetic). When
building a new vertical:
1. Skim 30-40 real ads first; name the recurring pitches you see.
2. Write a regex per angle from the actual words advertisers use (not what you'd expect).
3. Keep 6-9 angles — enough to separate strategies, not so many they all co-fire.
4. Give each a hex `angle_colors` entry so the report bars/chips are legible.

The report weights angles by **total days-running** (a durability vote), and also shows raw `×count`
and `%` of copy ads — so a niche angle used by one long-running winner stands out from a common angle
used only in short-lived ads.

## Multi-market (optional)
A config can list several `countries` with per-country `discovery_terms`. For cross-market work
(e.g. UK vs US) a **vocab-translation** is usually required in the US terms: render→stucco,
cladding→siding, kerb→curb. Without it the US pull looks empty. The report auto-switches to a
multi-market layout (Market column + per-market stat strip) when >1 country is present.

**Is a cross-market pass even worth it? Check concept-translatability first.** Cladding→stucco was a
near-1:1 vocab swap into a bigger, parallel US market — high ROI. Damp was different: "rising
damp / damp proofing" is UK-specific (old masonry, no DPC); the US analog is a *different vertical*
(basement waterproofing / mold remediation / crawl-space / foundation) on different construction. A
loose concept map = lower ROI and riskier transplants — treat it as enrichment, not core, and don't
delay a launch for it.

**Shared (bilingual) taxonomy + merge workflow.** For the comparison to be apples-to-apples, both
markets must be tagged with ONE taxonomy — make it bilingual (`mould|mold`, `colour|color`, plus
each market's problem vocab e.g. `wet basement|flooding|water damage`). In practice you often add the
2nd market as a *separate run later* rather than one big config: pull each market into its own
workdir, then **concatenate the swipe CSVs** into a compare workdir and run `report.py` there with a
comparison config — `report.py` re-tags every row with that config's taxonomy, so UK and US come out
consistent without re-pulling the first market.

## Keyword-collision junk is per-MARKET as well as per-vertical
The junk category shifts with the market, not just the vertical. UK damp pulled webnovel/game/
ecommerce spam; the SAME vertical in the US pulled **health-supplement affiliate spam** (blood-
pressure/cholesterol/nerve-support "communities", fake "Dr." pages) off the `mold`/`health`/
`air quality` terms. `discover.py`'s `JUNK` flag grows over time; add the new category when you meet
it. **Best prevention: bias discovery terms to contractor-INTENT phrasing ("…company / contractor /
near me / services") and NAMED BRANDS** — brand-name search grabs a clean `page_id` with zero
collision; bare generic nouns (`mold`, `health`, `tanking`, `which`, `render`) are the worst offenders.

## Caveats when interpreting winners
- **`is_active` can be stale/wrong too.** Prefer live long-runners, but the CSV's `is_active` is a
  point-in-time capture — if a human is looking at the live Ad Library and says an ad is running,
  trust that over the CSV. Eyeball the top few.
- **Thin / concentrated winner sets make `winShare%` noisy.** If the 180d+ set is small (e.g. ~20 ads)
  and dominated by a few big advertisers (a national brand running several long brand-ads), the
  over-representation lens is unreliable — lean on median-days + share, and name the concentration.
- **Very large pages undercapture.** Pagination caps on 500+-ad advertisers (e.g. Groundworks 549/857
  ≈ 64%). Fine for the longevity read; just don't treat its ad-count as complete.
- **`display_format` is unreliable** (see the Stage-5 gotcha in SKILL.md) — the report's creative-type
  table is indicative, not definitive; confirm the top winners' real format by eye.

## Interpreting results — the recurring finding
Across verticals the pattern repeats: a short median ad life (spray-and-pray) with a handful of
disciplined winners letting one ad compound for a year-plus. The actionable lesson for a client is
usually **"find a winner and let it run"** plus **"transplant the angle the long-run winners use"** —
not "make more ads." Report the funnel honestly (ad counts, median vs max days, capture %), name the
keyword-collisions you removed, and quote real copy for each swipe exemplar.

## Proven runs (bundled configs come from these)
- `damp.json` — 897 ads / 24 UK contractors (2026-10-07). Winner: Damp Proofing Solutions 1,277d trust-stack
  (and its real creative = a genuine team-in-front-of-vans photo, invisible in the copy — see Stage 5).
- `cladding.json` — 1,874 ads / 24 UK+US advertisers (2026-10-05). UK median 3-7d vs US 84d = discipline gap.
- US damp (not bundled; comparison run 2026-10-07) — 955 ads / 15 US basement-waterproofing/mold/foundation
  contractors. US median 26d vs UK 7d; **pain/problem-symptom = 65% of US winners vs 24% UK** — pain compounds
  in the US, not the UK; US fear = speed + structural catastrophe + emergency, NOT "medical bills".
- ED/prostate (not bundled) — winner angle = competitor-teardown + free-report advertorial.
