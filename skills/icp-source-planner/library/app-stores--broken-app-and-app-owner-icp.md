---
source: iOS App Store + Google Play (free hidden APIs)
vertical: app owners — broken-app "rescue", "health-check", and "has-a-mobile-app" ICPs (mobile-agency GTM)
verdict: validated
last_validated: 2026-07-14
access: free hidden APIs — iTunes Search+Lookup+RSS reviews; `google-play-scraper` npm (search/app/list/reviews/permissions/developer/similar)
dispatch: web-scrape-triage (Tier 0 hidden APIs) — was custom Node for TMZ; FLAG to upstream the recipe
cost_tier: free
---

# App Stores × Broken-App / App-Owner ICP

The reusable recipe for any mobile-dev-agency GTM: find live apps that are **broken or at-risk**,
resolve each app back to the **operating company** (never the developer), and hand domains to Apollo.
**Core move:** the app owner isn't in a firmographic DB as "has-a-shaky-mobile-app" — but the stores
expose everything free. Enumerate by **vertical/product search terms real companies rank for** (mills
don't clone "field service"/"patient portal"), **pre-filter on the rating the search already returns**,
then hydrate only the broken ones. **No paid Apify / Sensor Tower needed.** First run: TMZ = 2,818
companies across both stores.

## Two stores, both free
| | iOS App Store | Google Play |
|---|---|---|
| Enumerate | `itunes.apple.com/search?term=<t>&country=<c>&entity=software&limit=200` | `google-play-scraper` `.search({term,num:200,country})` |
| Metadata | search result already carries rating, `userRatingCount`, `currentVersionReleaseDate`, `releaseDate`, `sellerUrl`, `bundleId` (no 2nd call needed) | `.app({appId})` → `score,ratings,released,updated,installs,minInstalls,size,privacyPolicy,developerWebsite,developerEmail` |
| Reviews (recent) | `itunes.apple.com/<c>/rss/customerreviews/id=<trackId>/sortby=mostrecent/json` | `.reviews({appId,sort:NEWEST,num:20,country})` |
| Extras | — | `.permissions({appId})`, `.developer({devId})` (app-count), `.similar({appId})` (snowball), `.list({collection,category})` |

## Method (exact, working)
1. **Enumerate** term × storefront. Storefronts = English markets `us,gb,ca,au,ie`. Terms = a vertical/
   product taxonomy (horizontal SaaS + ~90 verticals × [software/app/management]); ~340 terms was enough.
   **DON'T use generic terms** ("budget app", "task manager") — they surface the store's spam layer.
2. **Pre-filter on the search's own rating** (both stores return it) BEFORE any hydration → only fetch
   detail for the low-rated candidates. This is what makes it rate-limit-safe (13,534 hydrations, not 120k).
3. **Hydrate + qualify** (Track A "rescue" gate that worked): `maintained` (last update ≤6mo) + resolvable
   domain + `rating ≤ 4.2` + a **recent technical-review CLUSTER** — count recent 1–2★ reviews matching a
   TECH regex (crash|freeze|slow|bug|login|sync|"since the update"…); need ≥1 if rating<3.5 (`low_rating`
   signal), ≥2 if 3.5–4.2 (`slipping` = version-regression, ~half the yield — see R-note below).
4. **Resolve domain** (see R4): consensus of privacyPolicy/developerWebsite/developerEmail (Play) or
   `sellerUrl` (iOS) → registrable-root → junk-host blocklist → bundle-rDNS *only if* stem matches dev name
   → **no domain = drop** (junk self-eliminates). ~95–100% correct on the qualified set.
5. **Snowball** via `.similar()` from qualified seeds → hydrate new ones. **Doubled** TMZ yield (787 of 1,558
   Play companies came from snowball, not the terms).
6. **Merge stores** by domain. Pre-seed the second store's dedup set with the first store's domains so it
   emits **net-new only** (iOS-only apps) and cross-platform companies collapse to one.

## Mill/spam filtering (the store is flooded — this is mandatory)
- Title/summary **keyword blocklist**: cleaner/booster/optimizer/wallpaper/reward/walk-&-earn/photo-recovery/
  scanner-pro/status-saver/… (app-mill + incentive junk).
- **Dev-app-count** (`.developer()`): >12 apps = mill (they clone). >6 for a stricter pass.
- **Ratings floor** ≥30 (drop empty/hobby) and **install cap** >10M = megacorp (drop).
- The real ICP arbiter is downstream: **the domain→Apollo size gate (5–200)** removes both mills (no Apollo
  presence) and the giants that slip through (Home Depot/Microsoft/KFC/NHS/CoStar).

## Fill / yield / cost (TMZ run, free)
- **~5% of scanned apps qualify** on the recent-review gate; snowball roughly doubles the term yield.
- **Resolution ~95–100% correct** on qualified rows (consensus method); junk resolves to nothing and drops.
- iOS **ratings skew high** → lower qualify-rate than Play, but the iOS-only apps are net-new (1,260 for TMZ).
- Cost = time only (both stores' APIs free/keyless); pace ~150ms + backoff; fully resumable/checkpointed.

## Gotchas (the things that bit us)
- **`NEW_FREE` ≠ recently-launched.** It's "new & *trending*" — 374/400 were >12mo old. Don't use it as a
  recency proxy; mine it and it's mostly mills. (Killed our "Track B store-mine": 500 scanned → 10 junk.)
- **Storefront multiplication has diminishing returns** — same apps rank across geos (dedup by domain): TMZ
  Play was US 158 → GB 68 → CA 41 → AU 23 → IE 12. Non-US mostly adds *local* players, not volume.
- **iOS RSS `feed.entry` is a single object when there's exactly one review** (not an array) → normalize or
  `.filter` throws. First RSS entry is app metadata, not a review — filter on presence of `im:rating`.
- **Don't language-flag on review text** — a Latin-only regex trips on emoji/★/curly quotes (iOS: 6/1301
  "English"). Region-gate on **HQ country in Apollo** instead; the storefront restriction + domain TLD
  already do most of it.
- **`sellerName` (iOS) / `developer` (Play) is often a person or an agency** — never resolve to it; use the
  URL/privacy signals. Discard rows that resolve to an app-dev *agency* (portfolio of unrelated apps).
- **A too-strict absolute-rating gate caps volume AND misses real leads.** `<3.5` lost the whole "rating
  slipped after a version" segment (Trello 3.8 / Zoho 4.1 with fresh login-crash clusters). Qualify to the
  client's *actual* buying signal (recent-review cluster), not a round-number threshold. (This ~doubled the list.)

## Downstream / hand-off
Domain-first CSV → Apollo for **size 5–200 + region (HQ country) + contacts**. Keep `review_sample`
(the raw recent low-star quotes) — it's the copy raw material (distill → one clean `problem_theme` + a
paraphrase for mail-merge; the email names the theme and offers to show specifics on a call, so it doesn't
need a forensic "slipped at v3.2" claim).

## Two motions (pick by where the signal lives)
- **App-first** (this recipe): scrape the broken app → resolve to company. Best when the *signal* (a rating
  problem) is the point. Naturally surfaces SaaS/tech + funded-strained + neglected-owned-app SMBs.
- **Company-first**: list companies (Maps by vertical+geo, franchise dirs, app-builder showcases) → check the
  stores for their app + health via the same lookup engine. Use for a broad-TAM *health-check* play where you
  don't need a per-account signal (owning an app is the qualifier). NB: app-builder-showcase apps skew
  *vanity* (neglected because worthless → weak willingness-to-pay); bias to multi-location/franchise/regulated.

## Runs
- 2026-07-14 — TMZ Software (db2b client, app-rescue GTM) — **2,818 companies** (Play 1,558 + iOS 1,260 net-new),
  signal 1,553 low_rating / 1,265 slipping; ~5% qualify, snowball doubled Play; → `db2b/tmz/appscrape/trackA_HANDOFF.csv`.
  Engines: `prod-trackA-v2.mjs` (Play + snowball), `prod-trackA-ios-v2.mjs` (iOS, pre-seeded), `merge-trackA.mjs`.
