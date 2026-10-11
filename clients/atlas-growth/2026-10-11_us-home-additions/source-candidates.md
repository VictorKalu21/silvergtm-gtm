# Source Candidates — Atlas Growth · US residential home addition contractors · 2026-10-11

Ranked free-first (icp-source-planner Phase 1). This list is the fallback queue for the run. Every
"probed" claim below has its raw call output in the session transcript of 2026-10-11; row counts are
copied from those outputs, not estimated.

| # | Source | Type | Why | Cost tier | Library status |
|---|---|---|---|---|---|
| 1 | **Google Maps** via `google-maps-scrape` — categories Remodeler · General contractor · Construction company · Custom home builder · Home builder · Sunroom contractor · Contractor + 7 keyword rows | 1 (Maps) | The only nationwide spine for a local trade; engine validated on 4 Atlas runs (foundation repair US/UK/AU, generators, pools). No native "home addition" category exists, so precision comes from the keyword rows + the site-text gate, exactly as pools. | paid per tile (scraper.tech key on file) | fresh engine; no profile for this vertical yet |
| 2 | **Qualified Remodeler TOP 500** — keyless JSON at `qualifiedremodeler.com/wp-admin/admin-ajax.php?action=top_500_<year>__data`, years 2020–2026 linked | 10 (award list) | **Probed 2026-10-11:** 2025 = 500 rows, website 500/500, leadership name 500/500, 47 states; fields rank · company · website · location · leadership · year founded · remodeling revenue · jobs · gross revenue · segment focus · employees · firm URL. Segment focus 2025: Replacement/Home Improvement 242 · **Design-Build 106 · Full-Service 89** · Kitchen & Bath 35 · Insurance Restoration 25. 2024 endpoint also live: 500 rows, 233 overlap → **767 distinct firms over two years**; six more years linked. The size-proven tier with a named leader for free. | free | **new profile written** `library/qualified-remodeler-top-500--remodelers.md` |
| 3 | **Open building-permit feeds** (Socrata / ArcGIS / CKAN / Carto; the 17 contractor-named jurisdictions already mapped in `library/open-permit-data--residential-generator-installers.md`) | 6 (gov data) | **Probed 2026-10-11:** Austin `3syk-w9eu`, 24 months, `permit_class_mapped='Residential'`, `work_class like '%ADDITION%'`, `permittype='BP'` → **1,091 distinct named contractors**; the top names are addition/remodel design-build firms (Together Design & Build 34, CG&S Design-Build 22, Green Bay Remodeling 19, Blue Diamond Remodeling 14, CBA Design & Build 13) with noise to deny (mobile-home service, decks, pools, HVAC). Without the `BP` filter the list is electricians/plumbers pulling sub-permits. New Orleans `rcm3-fn58`, description like '%ADDITION%', 24 months → 1,402 permits, **766 distinct contractor names** (persons as well as firms, as the generator run found). A permit is direct proof the firm builds additions + a free install-count rank. | free | partial profile (generator vertical); additions probe appended |
| 4 | **State contractor licence rosters** — FL DBPR `sto/file_download/extracts/cilb_certified.csv` (+ `cilb_registered.csv`, `CONSTRUCTIONLICENSE_1.csv`), LA LSLBC (email), AR ACLB (email), CA CSLB (portal only, no bulk CSV found at the URL third parties cite: 404) | 5 (registry) | Breadth and a phone/address/email join. **Probed 2026-10-11:** FL certified roster is live, 743 MB, one row per CE course per licensee (needs a licence-number collapse); CGC/CBC/CRC classes. A licence proves "general/building/residential contractor", not "builds additions", so this is a join/enrichment layer, not the spine. LA + AR carry the licensee email (profile on file). | free | partial profile (`state-contractor-licence-boards--home-services-emails.md`) |
| 5 | **NARI "Find a Remodeler"** (`remodelingdoneright.nari.org`, Houzz-backed) | 5 (association) | **Probed 2026-10-11: Cloudflare "Just a moment" 403** on both a plain and a browser-UA fetch from this egress; the member search is a Houzz embed. Chapter sites (e.g. nariatlanta.org) host their own lists but are 50+ separate scrapes. | free-with-workaround (unlocker) | none — dead end recorded here |
| 6 | **GuildQuality member profiles** | 2 (directory) | Profile pages are public and name additions in copy, but no enumerable index or search API was found in the gap-fill search; SERP dork `site:guildquality.com "home additions"` is the only path. Small and slow. | free | none |
| 7 | **Houzz / Angi / HomeAdvisor pro directories** | 2 (directory) | Anti-bot, sponsored ranking, and the only ready paths are paid Apify actors. Skip unless 1–3 under-deliver. | paid scraper | none |
| 8 | **Remodeling 550 (JLC)** | 10 (award list) | Older lists only surfaced (2013–2017 retrospectives); heavy overlap with QR Top 500 by design. Not worth a scrape while #2 is live. | free | none |

**Gap-fill research notes (2026-10-11):** searched NARI directory, Qualified Remodeler Top 500,
Remodeling 550, GuildQuality, Houzz, and state licence bulk downloads (FL / CA / AZ / NC). Found: the QR
hidden JSON (new, validated), the FL CILB bulk extracts (new URL, validated), the Austin/NOLA addition
permit signal (validated). Not found: any free enumerable NARI or GuildQuality list, a CA CSLB bulk file at
the cited URL, anything for AZ ROC or NC LBGC in this pass.

## Recommendation (for the gate)

- **Spine = #1 Google Maps**, run through the pools pipeline unchanged (lenient Maps stage, site-text
  verdict Qualified / Review / Exclude, DataForSEO owner rung with a cost cap).
- **Merge #2 QR Top 500** (2020–2026 union, filtered to Design-Build + Full-Service + Kitchen & Bath
  where the site says additions) as a flagged "size-proven" tier: it brings a leader name, website and
  revenue at $0 and seeds the owner read.
- **Use #3 permits as a proof-of-work tier + rank** in the ~17 open-API jurisdictions, not as the universe.
- **#4 licence rosters** only for the LA/AR email join and a FL phone/address join, after the spine exists.
- Deep-dive request: approve #1 + #2 + #3; skip #5–#8 unless the test under-delivers.

**Test design (Phase 3–4, for the next gate):** strata by **query** (native `Remodeler` vs `General
contractor` vs the `home addition` keyword rows, per process rule R1 the facet is the query, not page
depth) × 3 states (one warm, one Northeast, one Midwest); ~150 raw → ~50 qualified by the site-text
rubric; report ICP-match per stratum, split STATED (site says additions) vs INFERRED (R2).
