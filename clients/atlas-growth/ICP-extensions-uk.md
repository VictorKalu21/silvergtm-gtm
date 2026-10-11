# Atlas Growth — ICP: UK residential home-extension contractors

> Opened 2026-10-11. Status: **GATE 1 read-back AGREED 2026-10-11 (client atlas · default queries ·
> conservatories OUT · dedupe WAIVED); scraper key validated; 3-row calibration DONE (10 calls, 554
> unique, 3.33 calls/row on dense tiles); full sheet priced ~5,200 calls — AWAITING GO.** Brief, in
> the operator's words: "want to scrape residential home extension contractors in the uk". Run
> folder: `2026-10-11_uk-home-extensions-maps/` (`RUN-NOTES.md` has the calibration and GATE 2 preview).

## The offer (PROPOSED — same family as foundation repair, generators and pools, reworded)

> We help home extension builders book 10 qualified extension design consultations that turn into
> build projects every month using Facebook lead generation.

A performance lead-generation retainer for **residential** in-home appointments. The buyer is
whoever controls **marketing spend and lead flow**. Average job value (from general knowledge, NOT
web-checked this session — verify before it goes in a deck): single-storey rear extension roughly
£40k–£80k, double-storey £70k–£150k, loft conversion £40k–£90k, garage conversion £15k–£30k, London
higher. Every genuine extension builder clears a £30k bar; the real line is "builds the extension"
vs "draws it", "glazes it" or "does one trade on it".

## Footprint

**The whole UK — England, Scotland, Wales and Northern Ireland**, the validated **177-tile grid** of
the 2026-09-16 UK foundation run (150 town anchors + 27 densification tiles, 13 in London), zoom 13,
single pass, `areas` mode, imported unchanged from `gen-runsheet-uk.js`. Every town above ~60–70k
plus the regional centres, no populated area more than ~25 km from a tile; accepted gaps are the
Scottish islands, the far north-west Highlands and the Welsh interior.

Config: `geo.footprint.mode:"areas"`, `geo.country:"gb"`, `region_from_city:null`,
`region_default:"UK"` — the footprint gate runs hub-distance + foreign-country checks only.
**US service-area pins arrive in a UK pull** (872 `far_from_hubs` drops on the foundation run);
never ship this list without `footprint-gate.js`.

## Business types

Building firms that **design and/or build residential home extensions**: single- and double-storey
rear and side extensions, side returns and wrap-arounds, kitchen extensions; **loft conversions**
(dormer, hip-to-gable, mansard, Velux); **garage and basement conversions**; **design-and-build**
firms that sell the whole project to a homeowner; and general builders / renovation firms with a
real extensions line.

**Google has no category for this trade.** Checked against `references/google-maps-categories.md`
(4,027 native categories, 2026-10-11): no `extension`, `loft` or `conversion` category exists. The
trade is typed **Construction company · General contractor · Contractor · Builder · Home builder ·
Building firm · Garage builder**, and loft specialists are often typed **Roofing contractor** or
**Carpenter**. Two consequences: (1) every runsheet query is a **keyword** Maps text-matches
against name + description + category — that is the only way to reach the specialist; (2) the
Maps-stage allow has to admit the generic construction buckets the foundation run refused, so the
real ICP verdict is the **site-text classification** (`classify-prompt.md`), as on the pools run.

## The 10 queries (+2 broad, off by default)

| # | query | icp_type | priority |
|---|---|---|---|
| 1 | `house extensions` | extension | P1 |
| 2 | `home extensions` | extension | P1 |
| 3 | `extension builders` | extension | P1 |
| 4 | `loft conversions` | extension | P1 |
| 5 | `garage conversions` | extension | P1 |
| 6 | `single storey extension` | extension | P1 |
| 7 | `double storey extension` | extension | P1 |
| 8 | `design and build` | extension | P1 |
| 9 | `home renovations` | adjacent | P2 |
| 10 | `basement conversions` | adjacent | P2 |
| 11–12 | `builders` · `building contractors` | broad | P3 — **`--broad` only** |

Plural bare nouns, no "contractor" suffix (the foundation run's `underpinning` lesson: Maps
text-matches the query, a US-idiom suffix only narrows). `design and build` is the trade's own
phrase for selling the whole job and the richest ICP signal of the set. `basement conversions`
overlaps the foundation run's basement-waterproofing universe; the cross-run dedupe handles it.
The P3 queries return every builder in every town (max_pages × 177 tiles ≈ 1,000+ calls each) and
the extra rows carry no extension signal until the site-text gate reads them — a universe-size
lever for the operator, not the default.

**1,770 runsheet rows (177 × 10); 2,124 with `--broad`.** 3-row calibration sheet: `house
extensions` @ London centre, `loft conversions` @ Manchester, `design and build` @ Glasgow.

## Qualification, in plain language

**Maps stage (`atlas-growth-extensions-uk-config.json`) — volume-safe, the inverse posture of the
foundation config.** Rules run in order; the first failure is the recorded `drop_reason`.

1. **Hard entity deny (any tag).** Charities, colleges, hospitals, places of worship, funeral
   homes, estate and letting agents, law/insurance offices, car bodyshops — plus the two homonyms
   this vertical's own words drag in: **hair and lash "extensions"** (salon / hairdresser /
   hair-extensions-supplier / beauty / nail / eyelash types) and **web, graphic and marketing
   "design"** (`design and build` returned web-design agencies on the calibration).
2. **Primary-identity deny.** Judged on `google_types[0]` only, so a design-and-build firm carrying
   `Architect` as a second tag survives. **Architects / architectural designers / building
   designers / design agencies** (design-only practices are not the buyer — same call as the
   pools run's "designers EXCLUDED"); **kitchen and bathroom remodelers** (UK fitters and
   showrooms); **window installers / glaziers** (the conservatory and glazing trade — see the
   deliberate calls); engineers, surveyors, inspectors, merchants, hire, manufacturers, plumbers,
   electricians, heating, drainage, removals, skips, property management, housing developers.
   **Deliberately NOT denied:** roofing contractor, carpenter, joiner, bricklayer, masonry,
   plasterer, handyman, property maintenance, landscaper — loft specialists are primaried that way,
   and a primary deny would put them where the name recovery cannot reach them.
3. **Name deny.** The institutional / merchant / hire / drains / plumbing-and-heating / bodyshop
   list from the UK foundation config, plus the hair/lash homonym and the **national new-build
   housebuilders** (Barratt, Persimmon, Taylor Wimpey, Bellway, Redrow …): Google types them
   `Home builder`, which the allow admits, but they build estates, not extensions. This is not a
   chain drop of ICP roll-ups (those are kept and flagged) — it removes an off-ICP entity kind.
4. **Positive allow (any tag):** `construction company · general contractor · home builder ·
   custom home builder · building firm · building company · garage builder`. The bare `contractor`
   and `builder` are deliberately absent (substring semantics would admit every `Roofing
   contractor` and `Shed builder`) and come back through the recoveries below.
5. **Review floor 5** (`too_small`) — the ghost-listing filter the UK foundation run validated; 30
   would delete the trade. Blank review counts are taken back by the unrated recovery.

**Five recovery passes over `excluded_officp.csv`, $0, deterministic (+ one lever):**

| pass | config | takes back |
|---|---|---|
| bare-type | `recover-baretype-extensions-uk-config.json` | rows whose **PRIMARY** type is exactly `Contractor` / `Builder` / `Remodeler` / `Remodeller` / `Building firm` (exact match via `primary_type in`), ≥ 5 reviews, no name requirement — the core of the ICP (`J Smith Building Services`, typed Contractor) |
| name-claims-it | `recover-generic-extensions-uk-config.json` | trade or design primaries (roofer, carpenter, joiner, plasterer, bricklayer, handyman, property maintenance, landscaper, architect, kitchen/bathroom remodeler, glazier, building consultant, property management) whose **name** says extension / loft / conversion / design-and-build (incl. `design+build`) / build / construction / renovation, ≥ 5 reviews. The only recovery that reaches `off_icp_primary`, and only through that type list |
| unrated | `recover-unrated-extensions-uk-config.json` | floor drops with a blank `review_count` + a live website (P7 from the foundation run) |
| bare-type-unrated · name-unrated | `recover-baretype-unrated-…` · `recover-generic-unrated-…` | the same two nets for rows with a **blank** `review_count` + a live website. Needed because a blank-review row that fails the allow is recorded `not_in_icp`, never `too_small`, so the unrated pass cannot see it (OPEN engine limitation, IMPROVEMENTS 2026-09-20); +17 rows on the calibration |
| **lever L4** low-rated | `recover-lowrated-extensions-uk-config.json` (**OFF** — operator decision) | floor drops with **1–4 reviews + a live website**: 73 of 554 on the calibration, ICP-looking names; `LOWRATED=1 bash pipeline.sh qualify` |

**Calibration GATE 2 preview (554 real rows, 3 dense tiles, 2026-10-11):** main 208 + recoveries 82 = **290 qualified
(52%)**; L4 would make it 363 (65%). Remaining drops are architecture practices, engineers, interior designers, web
designers, hairdressers, 1–3-review trade rows and no-website rows. Full numbers in `RUN-NOTES.md`.

**Dry-run on a 20-row fixture (2026-10-11, scratchpad, output in `RUN-NOTES.md`):** 20 of 20 rows
landed where the rules intend — design-and-build firm, garage-conversion builder and Build Team
kept at the main pass; bare `Contractor` rows via bare-type; `Leeds Loft Conversions` (Roofing
contractor), `Extension Architecture` (Architect) and `Kent Kitchen Extensions` (Kitchen remodeler)
via the name recovery; the unrated construction company via unrated; Barratt, the hair salon, the
kitchen showroom, the conservatory installer, Travis Perkins, the plumber, the architecture
practice and the council dropped with the intended reasons; two real-looking firms with 2–3
reviews dropped at the floor (the floor's known cost, re-admittable at $0).

**Site-text stage (STEP 5e, `classify-prompt.md`) — the verdict that decides the list:**

| verdict | bucket | gate |
|---|---|---|
| `extension_builder` — site states it builds extensions / loft / garage / basement conversions or design-and-build for homeowners | **Qualified** | KEEP |
| `builder_unconfirmed` — general builder, extensions plausible but not stated | **Review** | hold |
| `unclear` — no usable site text | **Review** | hold; recovery track |
| `design_only` — architects, designers, planning, drawing services; never says it builds | Exclude | drop |
| `conservatory_glazing_only` — glazed structures and glazing only | Exclude by default | **lever L2** |
| `trade_only` — one trade (roofing, joinery, plastering, electrical, kitchens …), no extensions | Exclude | drop |
| `new_build_only` · `commercial_only` · `not_builder` | Exclude | drop |

Each verdict carries `work_types` (rear/side · double-storey · kitchen · loft · garage · basement ·
orangery/conservatory · renovation · new-build · design-and-build), a verbatim `evidence` quote, a
`services` summary and a `residential` flag. A Maps category alone never makes a row Qualified.

### The deliberate calls (confirm or change at GATE 1)

- **Designers are out; design-and-build is in.** An architecture practice sells drawings and the
  planning application and is a referral source, not a buyer of a build-project retainer (the
  pools decision, applied here). A firm that says "design and build" builds, and is ICP even when
  its team page is all architects.
- **Conservatories / orangeries / garden rooms are OUT by default (lever L2).** They are glazed
  extensions sold by the window trade, and the offer's creative will show a brick-and-block
  extension. The Maps stage denies window installers on primary; a glazing firm whose name claims
  extensions comes back by name; classify tags the survivors `conservatory_glazing_only` so the
  bucket can be shipped later if the client wants it.
- **Loft, garage and basement conversions are IN.** Same buyer, same survey-led job, same creative.
- **Review floor 5, no website rule, no chain drop** — carried over from the UK foundation run.
  Roll-ups (Build Team, Simply Extend, Econoloft, Absolute Lofts, Landmark Lofts, The Loft Room —
  a draft list, extended after calibration) are kept and flagged via `brand_families`.
- **National housebuilders are name-denied** as an off-ICP entity kind, not as a chain drop.
- **No keyword-candidates track (lever L3).** Every query here is a keyword, so routing every
  `not_in_icp` row to classify would fetch every trade primary in the country; the name recoveries
  are this run's keyword recovery.

## Target role — the UK title mapping (unchanged from `ICP-uk.md`, re-reasoned for this trade)

**KEEP:** Managing Director · Director / Company Director · Owner / Proprietor / Sole Trader /
Founder · Partner (`owner_or_partner`); General Manager · Operations Director · **Construction
Director** · Branch Manager (`gm`); Marketing Manager / Director / Head of Marketing (`marketing`);
Sales Director · Commercial Director · Business Development Manager (`sales_manager`); Office
Manager as a last resort (`office_manager`).

**EXCLUDE:** **Architect · Architectural Technologist · Architectural Designer · Designer · Planning
Consultant · Draughtsman · Surveyor · Quantity Surveyor · Estimator** · Structural Engineer (unless
also a director) · Project Manager · Site Manager · Site Supervisor · Foreman · Contracts Manager ·
Construction Manager · every trade on the tools (bricklayer, carpenter, joiner, groundworker,
plasterer, roofer, electrician, plumber, decorator, labourer, apprentice) · Receptionist ·
Bookkeeper · Accounts · HR · H&S · Company Secretary · any `<Department> Manager` other than
General or Marketing · any `Director of <X>` other than Marketing, Sales, Commercial, Operations
or Construction.

**The highest-risk false positive is the designer / surveyor who performs the free design visit** —
this vertical's twin of the US estimator trap and the UK damp surveyor trap. The offer sells
*design consultations*; UK extension sites lead with "book your free design consultation" and name
the designer who attends. They consume the appointments. At a design-and-build firm the in-house
architect is a salaried designer unless the registry or the site says Director. Full reasoning,
Companies House rules and few-shots: `owner-prompts/uk-home-extensions.md`.

## Owner-finding note specific to the UK

Do not start with the website. On the 2026-09-16 UK Maps run own-site text named someone on ~4% of
UK trade sites; **Companies House named 504 of 586** (86% of every name) at $0 via
`companies-house.js`, the LinkedIn-restricted sweep was a 21% rung on the residue. Run the registry
first, demote city-only matches to candidates, budget a same-company QA pass. Sole traders (common
here: `P J Harrison Builders`) never appear in the registry — the trading name is the owner.
`site_l2_keywords` adds the UK contact-page paths plus the services/extensions/projects pages the
classify step needs.

## Sources considered (Phase 1, compressed — Maps is the validated UK path for a local trade)

| source | verdict 2026-10-11 | what it gives |
|---|---|---|
| **Google Maps via scraper.tech** (177-tile UK grid) | **primary spine** — the validated UK recipe (`library/google-maps--uk-foundation-repair.md`) | name, address, phone, website, types, reviews, lat/lng; ~2.6 calls per runsheet row measured |
| **TrustMark register** `cms.trustmark.org.uk/api/businesses` | **probed, keyless, Tier 0** — 3 calls: trades list (184 trades; `Builders` id 27 carries the sub-trades `Extensions` and `Loft Conversions`, `Loft Conversions` id 77), name search returns 21 hits for "extensions" with company name, postcode, lat/lng, address and scheme (FMB), **email masked to a hash, and all 10 hits on the first page were `isActive:false` (lapsed members)**; 14,160 active businesses in total. Each profile also carries `websites`, `phoneNumbers`, `contacts`, `aboutInformation`, `regions`, `districts` fields (empty on the lapsed hits seen). The trade-filtered `api/businessProfiles` search (params `pageIndex, pageSize, skipFirstElements, trades, countries, locationSearchType …`) is **to-verify** — a Phase 2 deep-dive, not a spine | company + postcode + lat/lng + scheme membership; website/phone/contacts fields exist but were empty on the lapsed hits; email hashed |
| **FMB — Federation of Master Builders** `fmb.org.uk/find-a-builder` | **page 200, but the only server form is search-by-NAME** (`?name=`); the postcode search is a JS widget and no API path appears in the HTML. FMB membership surfaces through TrustMark's scheme field instead | member name only via the TrustMark join |
| Checkatrade · MyBuilder · Rated People · Yell | **dead from a datacentre egress** (Cloudflare 403; Yell/Checkatrade render via Firecrawl with no addresses — `library/trade-bodies-and-installer-networks--foundation-repair.md`) | — |
| Companies House bulk (SIC 41202 construction of domestic buildings, 43390 other building completion) | not probed — a registry of every building company with officers but no trade detail; useful as the owner rung, not as a spine | officers |
| scraper.tech credential in THIS container | the proxy-injected ScraperTech credential answered `{"error":"Access denied"}` (4 calls); **resolved 2026-10-11** — the operator's key, placed in the gitignored `skills/google-maps-scrape/.env`, validated with 1 call and bought the 10-call calibration through the engine | unblocked (rotate the key after the run — it was pasted in chat) |

## Dedupe universe

Mandatory per client: the 2026-09-16 UK foundation runs (`2026-09-16_uk-foundation-repair` export,
`2026-09-16_uk-foundation-repair-maps` 898 worked leads) and the 2026-09-30 UK generator / battery
runs. **None of those lead files is on this container** (gitignored), so `build-netnew.js` reports
`ref files used: 0`. **WAIVED by the operator 2026-10-11**, as on the generators run; the pipeline
runs the dedupe for the record and passes through. Expected overlap is real but small: basement
conversions and general builders with a structural line appear in both.

## Cost (before any API call)

| item | estimate | basis |
|---|---|---|
| Calibration | **10 calls, measured** (pages 3 / 4 / 3) | 3 dense city tiles, 554 unique |
| Full sheet, default queries | 1,770 rows × 2.61–3.33 = **4,600–5,900 Maps calls, plan on ~5,200** (+ ~6% heal passes ≈ 5,500 all-in) | 2.61 = the foundation run's grid-wide average (town tiles page once or twice); 3.33 = the calibration's dense-tile rate |
| `--broad` | +354 rows, mostly max-depth ≈ **+1,800 calls** | bare `builders` pages to the 6-page cap in every town |
| Everything after the scrape | $0 | site text, Companies House, Haiku reads, sweep — same as the foundation run; DataForSEO SERP only with a stated `--max-cost`; MV/BB verification only on an explicit go |
