# Scope — Texas Youth Soccer Clubs × Teamwear Client · 2026-09-30

Status: **SCOPED, NOT RUN.** This is the single Phase 0–3 gate document per `skills/icp-source-planner`
(sample-mode collapse: ICP contract + ranked sources + params + rubric + test plan in one approval).
Nothing below has been probed live yet; every source fact is marked *(to verify)* until the Phase 2 probes run.

---

## 0. ICP contract

**Client:** custom sports apparel / teamwear company (EU-based, entering the US). Name + domain **not yet supplied — open input** (needed for the artifact folder name, the offer line in the decision-maker prompt, and the dedupe universe).
**Offer:** customized club kits, training wear and fan/teamwear; B2B sale to the club, not to parents.
**Target entity:** youth soccer organizations in Texas — competitive clubs, academies, and recreational associations/leagues that buy or specify uniforms for their teams.
**Geo:** Texas, with the deliverable weighted to four metros (target split, adjustable):

| Metro | Target orgs | State association that governs it |
|---|---|---|
| Dallas–Fort Worth | ~110 | North Texas Soccer (NTX) |
| Houston | ~90 | South Texas Youth Soccer (STYSA) |
| Austin | ~50 | STYSA (CAYSA district) |
| San Antonio | ~50 | STYSA (SAYSA district) |
| **Total** | **~300** | |

**Size band:** any org with ≥ ~8 teams or ≥ ~150 players. Below that the uniform spend is too small to justify a personalized approach; those rows are kept in the raw universe but scored C.
**Decision-maker persona (KEEP):** Executive Director · Club President/Chair · Director of Coaching / Technical Director · Director of Operations / Club Administrator / General Manager · Uniform or Kit Coordinator · Director of Partnerships / Sponsorship / Marketing · Registrar (nice-to-have — at small rec associations the registrar runs the uniform order).
**EXCLUDE:** individual team coaches without a club-wide role, board members with no operating role, team managers/parents, referee assignors, players.

**Required output fields:**

| Field | Priority | Where it comes from |
|---|---|---|
| org name | must | registry / Maps |
| domain (registrable root) | must | registry outbound link → Maps website → 990 website (consensus, R4b) |
| metro + city + state | must | address (Maps) / registry city |
| org type: competitive club / academy / rec association / hybrid | must | rubric (site text + league membership) |
| leagues & affiliations (ECNL, GA, MLS NEXT, NPL, USYS NL, NTX/STYSA rec) | must | league directories + site text |
| size proxy: # teams, # players, age range | must (≥1 of the three) | site text, stated |
| 990 revenue + fiscal year, EIN | nice | ProPublica / IRS BMF |
| **current kit brand** (Adidas/Nike/Puma/Capelli/Hummel/Joma/Kelme/Score/Xara/other) | must | club "Uniforms" page (STATED) |
| **team-store / supplier** (soccer.com, Capelli, SquadLocker, BSN, local dealer) | must | uniform page link |
| **kit cycle** (e.g. "2024–26 kit", next changeover year) | nice, high value | uniform page / news |
| sponsorship program present (sponsor page / deck) | nice | site |
| 2–3 decision-makers: name, title, email, LinkedIn, evidence quote | must | site staff pages + SERP + 990 Part VII |
| email verification status | must | MillionVerifier → BounceBan (process 02) |
| tier score A/B/C + one-line "why now" | must | rubric |
| main phone, generic email | must | Maps / site |

**Dedupe universe:** none — new client. (Confirm: no prior US prospect list exists on the client side.)

---

## 1. Ranked source candidates (free-first)

This vertical is a textbook **R3 registry-as-attribute-proxy** case: every organized youth soccer club in Texas must be a member of a US Youth Soccer state association, US Club Soccer, or AYSO to play sanctioned matches. Membership *is* the qualifier; the directories are the universe. Google Maps is the address/phone/website complement, not the primary.

| # | Source | Taxonomy type | Why | Cost | Library |
|---|---|---|---|---|---|
| 1 | **North Texas Soccer (ntxsoccer.org) member club/association directory** | 5 registry | Governs DFW youth soccer; membership ⇒ youth-soccer org by definition; lists club sites *(to verify: directory URL, whether it's HTML or a GotSport/Demosphere embed)* | free | none |
| 2 | **South Texas Youth Soccer (stxsoccer.org) member associations + club search** | 5 registry | Governs Houston, Austin (CAYSA), San Antonio (SAYSA); district structure gives the metro tag for free *(to verify: directory grammar; district sub-sites may each list their own clubs)* | free | none |
| 3 | **League club directories: ECNL, Girls Academy, MLS NEXT, US Club Soccer NPL, USYS National League conferences** | 5/10 registry + ranking | Membership ⇒ competitive tier (Tier-A signal), ~40–80 TX clubs total; overlaps #1–2 but supplies the tier field | free | none |
| 4 | **ProPublica Nonprofit Explorer API + IRS Exempt Org BMF (eo_tx.csv), NTEE N64 "Soccer clubs/leagues" + N60/N6x with "soccer" in name** | 6 gov data | 990 revenue = size proxy; 990 Part VII names the ED/President/Treasurer; EIN dedupe key; catches rec associations that never appear on a league site *(to verify: N64 count for TX; API filter grammar)* | free | none |
| 5 | **Google Maps (scraper.tech) — "Soccer club", "Youth soccer club", "Soccer academy", "Youth organization"** | 1 Maps | Address, phone, website, place_id; catches for-profit academies not in #1–4; existing validated engine | free (key connected) | engine validated, vertical new |
| 6 | **AYSO region locator (Texas regions)** | 12 franchise/registry | Recreational volume; uniforms ordered per region — legit buyer, smaller ticket *(to verify: locator has an enumerable list vs map-only)* | free | none |
| 7 | **Platform footprints via SERP dorks** — `site:*.demosphere-secure.com`, `system.gotsport.com/org_event`, `*.teamsnapsites.com`, `playmetrics.com`, `sportsengine` + "soccer" + metro | 2/17 footprint | Gap-fill only: finds clubs whose site is on a club-management platform and which #1–5 missed | free (Jina/WebSearch) | none |
| 8 | Apollo / ZoomInfo for people | 14 broker | Weak on nonprofits; use only as a *secondary* people rung after site-staff extraction | paid, recommend-only | — |

**Gap-fill research note:** not yet run (no live calls in this scoping pass). Candidates to check in the Phase 2 probe: Texas-specific league sites (NTX Classic League / Plano Premier, Texas Club League, Lone Star Soccer Alliance), Houston-area district associations (Katy, Cy-Fair, Spring-Klein, Bay Area, West Houston), and whether STYSA publishes a bulk club export.

**Fallback queue order:** 1 → 2 → 4 → 3 → 5 → 6 → 7. Sources 1+2+4 together should already exceed 300 orgs statewide; 3 and 5 enrich rather than add.

---

## 2. Source profiles (lite — one paragraph each, pending probe)

**NTX / STYSA directories.** Expected: name, city, website, sometimes contact email of the registrar/president. Access: Tier 1 plain HTML or a hidden JSON behind a "find a club" widget (Tier 0, WA-02). Risk: the directory may be a map embed with no list; fallback is WA-04 sitemap mining or the district associations' own pages. Volume guess: NTX ~150–250 orgs, STYSA ~200–300 orgs statewide.

**League directories.** Expected: club name, city, conference, logo, website. Access: Tier 1 HTML or Next.js `__NEXT_DATA__` (WA-05). Filter to conference = Texas / Frontier / Lone Star. Volume: ECNL+GA+MLS NEXT+NPL ≈ 40–80 TX clubs.

**ProPublica / IRS BMF.** Tier 0.5. `eo_tx.csv` is a single bulk file with `NTEE_CD`; ProPublica search returns EIN, name, city, revenue, and per-filing officer lists. Name matching to the club list is fuzzy (legal names: "XYZ Soccer Association Inc") → normalize + city match, flag low-confidence. Volume: unknown until probed; N64 in Texas plausibly 300–600 entities including dormant ones (filter to a filing within 3 years).

**Google Maps.** Existing engine, `areas` mode, 4 metros. Tiles: one center per major suburb (DFW ~12, Houston ~10, Austin ~5, San Antonio ~5), zoom 12, categories × tiles ≈ 130 calls before auto-split. Known fuzziness: "Soccer club" returns adult leagues, indoor facilities, soccer stores, and pro/college teams → deny-list + rubric handle it (DENY-ONLY, not a `google_types` allow-list — this is a messy-typed vertical per the 2026-07-11 observation). Must run through `run-scrape.js` and `footprint-gate.js` (areas mode has no other geo gate).

**Club websites (for the people + apparel fields).** Tier 1 `fetch-sites.js`: homepage + About/Staff/Board/Contact/Uniforms/Sponsors pages. Youth clubs publish staff directories with emails far more often than commercial SMBs, so named-person yield should be at or above the 84% healthcare analog *(estimate, to be measured in the test)*.

---

## 3. Run parameters

- **Geo:** Texas statewide for registries (metro tag derived from city → metro map; CSA-level: DFW, Greater Houston, Austin–Round Rock, San Antonio–New Braunfels). Maps runs only on the 4 metros.
- **Registry queries:** full directory pull (no filters), then metro-tag client-side.
- **Maps queries:** `soccer club`, `youth soccer club`, `soccer academy`, `youth soccer league`; deny names matching pro/college/indoor-facility/retail patterns.
- **Merge keys:** domain (root) → place_id → normalized name + city. EIN attached where matched.
- **Name→domain (R4):** registries link the site directly for most rows; residual via Clearbit Autocomplete then a grounded-model lookup on the last few dozen. Never guess.
- **People:** `fetch-sites.js` → `search-owner.js` (`"<club> <city> TX"` + `site:linkedin.com`) → one Claygent column with a per-vertical `owner-prompt.md` (KEEP/EXCLUDE above) → 990 Part VII officers as corroboration → MillionVerifier + BounceBan.
- **Apparel intel:** an LLM extraction pass over the Uniforms/Sponsors page text with a STATED/INFERRED split (R2): brand named on the page = STATED; brand inferred from a team-store logo or photo alt text = INFERRED, haircut 50%.

## 4. Qualification rubric

**Kill criteria (drop):** not in Texas · adult-only league · school/ISD/college/pro team · soccer store or indoor-facility operator with no club · camp-only or clinic-only operator · single team · no website and no directory listing · national rec franchise with central procurement (i9 Sports, Soccer Shots, YMCA branches) → kept in a separate "central-procurement" tab, not in the 300.

**Scoring (0–100):**

| Signal | Weight | Stated evidence |
|---|---|---|
| Competitive affiliation (ECNL / GA / MLS NEXT / NPL / USYS NL) | 25 | league directory |
| Size: ≥20 teams or ≥500 players or 990 revenue ≥ $500k | 25 | site text / 990 |
| Size: 8–19 teams or 150–499 players or revenue $100k–500k | 12 | site text / 990 |
| Uniform page exists with brand + supplier named | 15 | site |
| Kit cycle ends within 12 months, or no exclusive brand deal stated | 15 | site / news |
| Sponsorship/partner program present | 10 | site |
| Named ops-level decision-maker with email found | 10 | staff page |

**Tiers:** A ≥ 65 · B 40–64 · C < 40. Deliver all A and B first; fill to 300 with C ranked by size. A club locked into a multi-year exclusive deal is **not killed** — it's tagged `locked_until = <year>` as timing intel (confirm this is the client's preference).

**Provisional test thresholds (user eyeball decides):** domain fill ≥ 90% · metro tag fill 100% · org-type classified ≥ 95% · kit brand STATED fill ≥ 50% · ≥1 named decision-maker with email ≥ 75% · ICP-match (qualified/raw) ≥ 60% on registries, ≥ 35% on Maps.

## 5. Test plan (Phase 4, ~50 qualified rows, raw cap 150)

Strata follow R1 (facets, not depth): **metro (4) × source (NTX/STYSA directory vs Maps vs 990) × tier (competitive vs rec)**. Pull ~12 raw rows per metro from each source, run the full pipeline including people + apparel extraction on the survivors, and report fill rates by stratum, ICP-match per source, people yield, and cost per row. The test report is the go/no-go for the full run.

## 6. Estimates

| Item | Estimate |
|---|---|
| Universe after merge (statewide) | 500–800 orgs |
| In the 4 metros, post-rubric | 350–450 orgs → deliver top 300 |
| Decision-makers | 2–3 per org → 600–900 contacts, ~80% with a verified or catch-all-accepted email |
| Paid calls | scraper.tech Maps ~150–300 calls; SERP ~600–900 queries; verification ~900 emails (all three services already connected) |
| LLM cost | apparel + people extraction on ~400 orgs ≈ a few dollars on a small model via the connected OpenAI key or Clay Claygent |
| Effort | probes 0.5 day · test 0.5 day · full pull + merge 1 day · people + intel + verification 1 day · QA + deliverable 0.5 day ≈ **3.5 working days** |

## 7. Open inputs (non-blocking, defaults stated)

1. Client name + domain (needed for the folder, the offer line, and the prompt). *Default: placeholder until supplied.*
2. Per-metro split above OK? *Default: as shown.*
3. Include rec-only associations and AYSO regions in the 300? *Default: yes, scored C, capped at ~25% of the list.*
4. Locked exclusive-brand clubs: keep with timing tag, or drop? *Default: keep, tagged.*
5. Contacts per org: 2–3, or all KEEP roles found? *Default: up to 3, ranked ED/DOC/ops first.*
6. Deliverable format: CSV + Clay table, or Google Sheet? *Default: CSV (Apollo/Clay-ready) + a summary tab.*

## 8. What happens on approval

Probe the 4 registry sources (one request each) → write the test plan artifacts → run the 50-row stratified test → test report → sign-off → full run → run summary + library profiles (`state-youth-soccer-associations--tx-youth-clubs.md`, `propublica-irs-bmf--nonprofit-size-proxy.md`) + observations entry.
