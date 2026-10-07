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

## Interpreting results — the recurring finding
Across verticals the pattern repeats: a short median ad life (spray-and-pray) with a handful of
disciplined winners letting one ad compound for a year-plus. The actionable lesson for a client is
usually **"find a winner and let it run"** plus **"transplant the angle the long-run winners use"** —
not "make more ads." Report the funnel honestly (ad counts, median vs max days, capture %), name the
keyword-collisions you removed, and quote real copy for each swipe exemplar.

## Proven runs (bundled configs come from these)
- `damp.json` — 897 ads / 24 UK contractors (2026-10-07). Winner: Damp Proofing Solutions 1,277d trust-stack.
- `cladding.json` — 1,874 ads / 24 UK+US advertisers (2026-10-05). UK median 3-7d vs US 84d = discipline gap.
- ED/prostate (not bundled) — winner angle = competitor-teardown + free-report advertorial.
