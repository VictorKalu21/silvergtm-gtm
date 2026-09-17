# Write-back DRAFT — 2026-09-16 UK foundation-repair MAPS run

**Nothing in this file has been applied.** Per root `CLAUDE.md` ("write-back at the end of every run")
and google-maps-scrape SKILL.md ("Self-improvement protocol"), this is the drafted text for the three
stores, staged here for the orchestrator to apply at close-out:

| store | target file | section below |
|---|---|---|
| engine bugs / gotchas / facts | `skills/google-maps-scrape/IMPROVEMENTS.md` | **A** |
| the vertical's source profile | `skills/icp-source-planner/library/google-maps--uk-foundation-repair.md` | **B** |
| client state | `clients/atlas-growth/STATE.md` | **C** |

No method change to `SKILL.md` is proposed. Nothing here recurs across two runs yet and nothing has
operator sign-off, which is the gate SKILL.md sets for a method edit; the engine items in A are all
bug/data-shaped and each names its own test and approval.

Numbers that are **not final** are marked **TBD** and must not be applied as facts: the sweep is one
tranche in, and email verification has not run at all (no MillionVerifier / BounceBan keys, and
credits need an explicit operator go).

**Duplicate check against the live `IMPROVEMENTS.md` (2026-09-17):** this run has already logged
*"MEDIUM (owner-finding, three scripts disagree on what 'named' means)"*. A2 below is adjacent to the
OPEN *"MEDIUM (companies-house.js): exact-title matches with punctuation/'&' differences fall to
low_confidence"* (2026-09-16) but is a different defect on a different code path — that one is a
false NEGATIVE (real matches demoted), A2 is a false POSITIVE (wrong matches asserted) — and both
`CH-REPORT.md` §4 and `READ-PLAN.md` open item 2 already call for it to be filed separately. A5 is
the environment half of the OPEN `fetch-sites.js` Tier-3 rung item, not a replacement for it.

---

# A. `skills/google-maps-scrape/IMPROVEMENTS.md` — entries to append

## A1 — HIGH (fetch-sites.js, email coverage): the email regex runs on STRIPPED text and the L2 keywords never reach the contact page — four classes of address are invisible and the page they live on is never fetched

**Status:** OPEN (proved job-side by `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/harvest_emails_deep.py`; engine change not made) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 676 root domains), **HIGH impact — it is the difference between a third and a half of the list being contactable.**

**Problem.** `fetch-sites.js` extracts emails with a plain regex run over the output of `htmlToText()`. That function deletes `<script>` blocks and every tag, i.e. every attribute, *before* the regex sees the page. Four whole classes of address are therefore unreachable by construction, and a fifth never gets fetched at all:

| miss | why |
|---|---|
| `mailto:` href | an attribute; the `<a>` is gone before the regex runs |
| JSON-LD `"email"` | lives in `<script type="application/ld+json">`, which `htmlToText` strips |
| Cloudflare `data-cfemail` | XOR-encoded hex attribute; the visible text is only `[email protected]` |
| `<span>@</span>` splits, `&#64;`, `[at]`, zero-width chars | broken before the regex ever sees an `@` |
| the contact page | the default `site_l2_keywords` list is owner-finding shaped (about / team / meet / …). `contact`, `contact-us`, `get-in-touch`, `enquir` are **not** in it — and a UK trade site puts its mailbox on the contact page, not the about page |

Probed on three live list sites before anything was built (`HARVEST-REPORT.md`, 3-call rule): `khbpiling.co.uk` (mailto), `piledsolutions.co.uk` (cfemail), `southwestunderpinning.co.uk` (JSON-LD). Three sites, three different rungs, and **the engine's rung returned nothing on all three.**

**Measured gain, one list.** 784 leads with a non-shared-host website → 676 unique root domains fetched (one fetch per root domain; branches read their representative), 1,523 page requests, 2.45 pages per reachable domain.

| | |
|---|---|
| addresses kept | 494 over 422 domains |
| **new to the run** (the engine's output did not contain them) | **137** — mailto 49 · tag_split 19 · cfemail **48 (100% of that rung)** · jsonld 19 · raw_html 2 |
| domains that gained an address the engine never had | 119 |
| leads that gained a sendable address | **+103** (+74 ICP, +29 damp-only) |
| ICP segment coverage | 240/686 (**35.0%**) → 314/686 (**45.8%**) |
| damp-only segment coverage | 116/174 (66.7%) → 145/174 (**83.3%**) |
| both segments | 356/860 (41.4%) → 459/860 (**53.4%**) |
| person-shaped addresses | 8 → 14 · own-domain 257 → 330 |

Every single Cloudflare-obfuscated address was new — that rung is pure gain by construction, because the engine can only ever see the placeholder.

**Fix (engine, with a test and an operator go).** Two data/shape changes, no new dependency and no new fetch budget:
1. An `emailsIn(rawHtml)` that runs **before** `htmlToText`, over the raw response body: `mailto:` hrefs, JSON-LD `"email"`, `data-cfemail` (XOR decode), and a tag-split/entity normaliser (`&#64;`, `[at]`, `<span>@</span>`, zero-width) — then union with today's text regex and keep the existing junk / other-domain / third-party rejects. Provenance per address (`mailto | jsonld | cfemail | tag_split | raw_html | text`) so a bad rung can be switched off by evidence.
2. Add `contact`, `contact-us`, `get-in-touch`, `enquir` to the **default** `site_l2_keywords`. The UK config already carries them job-side (ICP-uk.md), which is why the L2 half of the gain was available at all; the defaults should not need a per-client override to find a contact page.

Test fixture: one page per rung plus a negative (an `info@` inside a CDN URL, and a `[email protected]` with no `data-cfemail`, neither of which may be kept). One extraction defect already found and fixed in the job-side version, worth carrying into the test: a `tag_split` match over an inline JS blob swallowed a `>` escape body and produced `u003eenquiries@…`.

**Cost note:** no extra fetch — the rungs read the body already downloaded; only the contact-page L2 adds requests (~1.5 pages per domain here, free).

## A2 — MEDIUM-HIGH (companies-house.js): the **city-only** acceptance path is ~21% wrong, and it is asserted as `matched`, so the reader never judges it

**Status:** OPEN (job-side demotion only — `demote_city_only_ch.py` in this run folder; engine unchanged) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 860 leads), MEDIUM-HIGH impact — **it ships WRONG OWNER NAMES and marks them authoritative.**

**Problem.** `companies-house.js` accepts a candidate on any of three bases and records all three identically as `matched`. Measured against a hand audit of every accepted row (`CH-REPORT.md` §4, 432 accepted):

| acceptance basis | matched | flagged wrong | error rate |
|---|---:|---:|---:|
| postcode in the registered-office snippet | 154 | 4 (3 of them false alarms) | **~0.6%** |
| name overlap ≥ 0.9 | 159 | 0 | **0%** |
| **city / town name only** | **119** | **25** | **~21%** |

A UK town is not a disambiguator in a vertical where every second firm is called `<word> Damp Proofing`: *Rentokil Property Care – Belfast* → BELFAST PROPERTY DEVELOPMENTS LTD, *Phillips Building & Property Maintenance* → ALM BUILDING SERVICES & PROPERTY MAINTENANCE LTD, *PERLINI Damp Proofing* → ABOVEWATER DAMP PROOFING LTD (the same failure the export run already caught), *Bolton Piling* → APPLETON PILING LIMITED, *BNS Groundwork London* → GROUNDWORK EAST LONDON. A 25-row random QA put the fleet-wide wrong rate at 2/25 (8%); the fleet scan put it at ~26 of 432 (~6.0%), **25 of them on this one path**. The scan under-counts — an all-generic pair it cannot see (*P&E Basement Excavation Builders* → HG P&E AGGREGATOR NOMINEES LIMITED, a nominee holding company) was caught by eye.

The damage is not the match, it is the label: `owner-prompt.md` Companies House rule 3 (reject a match whose registered title shares no distinctive token with the business name) is applied by the reader **only to `low_confidence` candidates**. A `matched` record is handed to the reader as authoritative, so the one path that needs judgement is the one path that never gets it.

**Fix (engine, needs operator approval + a test — not applied).** Demote a `cityMatch`-only acceptance to `confidence: low_confidence` with a `demoted_reason: city_only`, unless the name overlap also clears the high bar. It is a labelling change, not a drop: the candidate still reaches the reader, who applies rule 3 to it. Test: three fixtures — postcode-confirmed (stays `matched`), overlap ≥ 0.9 with a city hit (stays `matched` — that combined path measured 0% wrong on 36 rows and must not be demoted with the rest), town-name-only (demotes). Job-side precedent to port: `demote_city_only_ch.py` demoted 83 of 432 on exactly that two-part test, and `inject_ch_directors.py` renders the demoted block with the literal the prompt keys on.

**Related but distinct:** the OPEN 2026-09-16 entry *"exact-title matches with punctuation/'&' differences fall to low_confidence"* is the opposite error — real matches wrongly demoted. Fixing that one (normalised-title equality as an accept) also shrinks this one, because a lead that can be accepted on a normalised title never reaches the city-only path.

## A3 — MEDIUM (stageC / own-domain ranking): the own-domain test is exact-or-subdomain, so an obvious SIBLING domain reads as third-party and the lead ends with no email at all

**Status:** OPEN (not fixed anywhere; 10 leads on this run end empty) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact — small count, but it is a *total* loss on the affected lead.

**Problem.** The own-domain test compares the address's domain to the lead's `root_domain` by exact match or subdomain. A hyphen variant or a `.com`/`.co.uk` twin — both routine on UK trade sites, where the Maps website and the mailbox domain are registered separately — is classified `other_domain` and dropped, and on a lead whose *only* address is that sibling the row ends with nothing:

    khbpiling.co.uk        -> info@khb-piling.co.uk
    dc-edney.co.uk         -> enquiries@dcedney.co.uk
    telforddampproofing.com-> info@telforddampproofing.co.uk
    tflower.uk             -> info@tflower.co.uk
    renlon.co.uk           -> survey@renlon.com

**10 leads** on this run, all of them otherwise contactable.

**Fix (engine, with a test).** Normalise before comparing: lowercase, strip hyphens, and treat the same second-level label as own-domain across `.co.uk` / `.com` / `.uk` (the public-suffix-aware `rootDomain` in `shared-hosts.js` already knows how to take a `co.uk`-style suffix off). Keep it to a sibling test — it must not become a substring test, or `damp.co.uk` starts owning `dampex.com`. Test fixture: the five pairs above as accepts, plus `dampproofing.co.uk` vs `dampproofingltd.co.uk` as a reject.

## A4 — MEDIUM (prep-owner-batches.js ordering): a lead with no page text is dropped **before** Companies House directors are injected, so a registry-only lead is never read

**Status:** OPEN (worked around job-side with `prep_chonly_batches.py` / `prep_pass2_batches.py` in this run folder) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run), MEDIUM impact — **silent lead loss on exactly the leads the registry could answer.**

**Problem.** `prep-owner-batches.js` skips a lead with no evidence text at all (`owner/read/skipped_none.json`) and the registry block is injected into the batches *afterwards*, by a separate step. The two orderings disagree about what counts as evidence: for a UK run, Companies House **is** the evidence, and it is the only evidence the address-less service-area listings will ever have. On this run **262 of 860 leads were skipped for having no text — and 192 of them carried active CH officers** (86 authoritative, 78 `low_confidence` candidates, 28 demoted `city_only`). Those 192 were not judged by anything: not by a reader, and not by the prompt's rule 3. They needed a second, hand-built pass (`prep_chonly_batches.py`, 5 batches) plus a third after the registry's second pass (`prep_pass2_batches.py`, 2 batches of 47) to reach a reader at all — and the pass-2 batches alone named 46 leads that would otherwise have gone to a paid-ish web sweep or nowhere.

The 28 demoted `city_only` records inside that set are the sharp edge: an unjudged town-name-only match (A2) on a lead nothing else can check.

**Fix (engine, with a test and an operator go).** Make the skip test "no evidence of ANY kind" rather than "no page text": either inject `ch_directors` before the skip decision, or give `prep-owner-batches.js` a `--ch <companies_house.jsonl>` input it counts as evidence. Either way `skipped_none.json` should record *why* a lead was skipped, so "no text" and "nothing at all" stop being the same number. Test: a fixture lead with empty `site_text` and one active officer must land in a batch, not in `skipped_none`.

## A5 — FACT / ENVIRONMENT (site-text recovery ceiling): Cloudflare's **Turnstile widget host is not allowed out of this egress**, so a challenge that needs it can never be solved from here — however long it is given

**Status:** RECORDED 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run). Not a bug; a boundary to design against, and the reason not to buy more time on the Tier-3 rung.

**Measured.** `fetch-sites.js` over 1,469 spend rows: **1,206 ok / 263 home-fetch failures**, free retry recovered 22. Failure classes: 403 ×163 · TypeError (DNS/TLS) ×41 · 503 ×22 · 404 ×16 · 500 ×7 · AbortError ×6 · the rest single figures. 153 further leads returned `ok` under 300 characters.

Branching per `web-scrape-triage`:
- **Thin shells got no rung, correctly.** Probed with a full Scrapling render and `network_idle=True`: obsbasements.co.uk / geobond.co.uk / shieldpreservation.co.uk came back at **205 / 63 / 211 characters**. They are near-empty pages, not JS shells a renderer can fill.
- **403 / challenge subset → one Scrapling `StealthyFetcher` attempt each** (0.4.15, `solve_cloudflare=True`, one `StealthySession` per worker so the clearance cookie is reused across that lead's pages): 196 candidates by review count, **126 attempted inside the ~90 min cap, 40 recovered.** `site_text.jsonl` 1,206 → **1,245 ok**; on-site emails 773 → 781; and in the downstream classifier the 40 recovered sites moved **51 rows into tier A**. The rung paid for itself.
- **The ceiling is the egress policy, not the sites.** 39 of the 86 failed attempts returned `502 upstream request failed`, and the proxy's own status endpoint names the cause: `connect_rejected … "gateway answered 502 to CONNECT", host brunhild.challenges.cloudflare.com:443`. The Turnstile widget host is not reachable, so the challenge cannot complete no matter the timeout. Reported, not routed around.
- **TLS/JA3 impersonation clears none of it** (3-call probe, `HARVEST-REPORT.md`): groundworksconstructionlondon.co.uk 403 → 403, groundworkcompanies.co.uk 403 → 403, minipilingsystems.co.uk 202/169 B → 202/169 B. Same result `RUN-NOTES.md` got on petercox / timberwise.
- **Wayback has no mirror rung right now** — re-probed 2026-09-16: `cdx/search/cdx` returns the "Internet Archive: Temporarily Offline" page and `archive.org/wayback/available` returns 429.

**Consequence for planning.** **Residue with no site text: 224 of 1,469 spend rows (15.2%)** — 70 challenge-class leads the deadline cut, 87 attempted and still blocked, 128 thin shells, 67 dead. Site text is **~85% fetchable** for this vertical from a datacentre egress and that number will not move without a residential IP or a hosted unlocker (Firecrawl: no key this run). Budget the residue into the plan instead of paying for a fourth attempt: these leads are not dropped, they go to adjudication on name + Google types with an empty `text`, which the prompt already maps to `unclear`.

## A6 — MEDIUM (build-plusvibe.js `fill`): the `OUTCOME` consistency table hardcodes ONE VERTICAL'S business types, so `flag_outcome_off_trade` is silently inert on every other vertical

**Status:** OPEN (found while writing `clients/atlas-growth/personalize-config-uk.json`; no engine change made) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, STEP 7b), MEDIUM impact — **a silently disabled guardrail, which is worse than an absent one.**

**Problem.** `fill` computes four flags. Three are config-independent (`flag_visit_repeats_trade`, `flag_word_used_3x`, `flag_free_in_visit`). The fourth reads a table baked into the script:

    const OUTCOME = { 'foundation repair': ['repair'], 'basement waterproofing': ['waterproofing'],
      'crawl space repair': [...], 'concrete leveling': [...], 'house leveling': [...], 'slab repair': [...] };
    if (OUTCOME[filled.business_type] && !OUTCOME[filled.business_type].includes(filled.project_type)) …

Those are the US foundation-repair run's `business_type` values. Any other vertical — or the same vertical in another country — produces a `business_type` the table does not hold, the `&&` short-circuits, and the flag **can never fire**. It does not warn, and `fill_report.json` prints `flag_outcome_off_trade: []`, which reads as "checked, clean" rather than "not checked". This is the same client-neutrality defect as the DONE 2026-09-11 `apply-classify.js` fallback: one client's vertical hardcoded into a shared engine script.

It bites now: the UK config's seven trades (`damp proofing`, `structural waterproofing`, `basement waterproofing`, `underpinning`, `structural repairs`, `mini piling`, `subsidence repair`) share exactly one key with the table (`basement waterproofing`), so the flag covers a fraction of one trade and nothing else. The bug it exists to catch is a real one on the US run — batch 4 gave 26 foundation-repair shops "waterproofing".

**Fix (engine, with a test and an operator go).** Read the table from the config instead of the script: an optional `outcome_by_type` block (`business_type -> [allowed project_type, …]`) with the existing US table as the default when the key is absent, **and a loud WARN naming the count of rows whose `business_type` is not in the table** so an unchecked run can never look like a clean one. Config-shaped, not logic-shaped — the same "grow data, not logic" move as `brand_families`. Test: a UK-shaped config where `mini piling -> tanking` must flag, and a config with no block at all where today's US behaviour is unchanged.

**Until then:** the UK config carries the gap in its own `_r.engine_note_outcome_flag` note, and the 7-lead operator test (`_test_plan`) reads `project_type` against `business_type` by eye on every trade in the sample.

---

# B. `skills/icp-source-planner/library/google-maps--uk-foundation-repair.md` — updated profile

The existing profile was written from the **operator-supplied export** (5,999 rows, 175 ICP). This run
is our own scrape and supersedes it on every number. Proposed replacement below, in `_template.md`'s
shape. Sweep and verification lines are **TBD** and must stay TBD until the tranches finish.

```markdown
---
source: Google Maps (scraper.tech `searchmaps.php`), UK — our own tiled scrape; also validated once on an operator-supplied category export
vertical: UK foundation repair — underpinning / subsidence / structural repair / mini piling / basement & structural waterproofing / damp proofing
verdict: validated
last_validated: 2026-09-17
access: Maps via scraper.tech (paid, keyed, pagination on); site text via fetch-sites.js (plain fetch) + a Scrapling StealthyFetcher rung on the 403 subset; owner names via Companies House Public Data API (free key) + LinkedIn-restricted WebSearch sweep
dispatch: google-maps-scrape (full pipeline, STEP 2 onward)
cost_tier: workaround (Maps calls are paid; every enrichment rung on this run was free)
---

# Google Maps × UK foundation repair

**Verdict:** VALIDATED end to end on our own scrape. Client: Atlas Growth (2026-09-16 UK MAPS run).
The earlier export-based validation (2026-09-16, 175 ICP) is kept below as the second data point.

**Coverage:** the whole UK, metro-anchored rather than exhaustively tiled — **150 town anchors + 27
densification tiles = 177 tiles**, zoom 13, single pass, `geo.footprint.mode:"areas"`,
`geo.country:"gb"`, `region_from_city:null`, `region_default:"UK"`. Every town above ~60–70k plus the
regional centres, so no populated area sits more than ~25 km from a tile. Accepted gaps: the Scottish
islands, the far north-west Highlands, the Welsh interior. **Universe 22,193 unique businesses;
final worked list 860** (686 ICP + 174 damp-only).

**Fields:** name / address / postcode / phone / website / google_types / review_count / rating /
claimed / lat-lng → **can**. Owner name, email, employee count, founding date → **can't** (Maps has
none of them; see the owner-finding and email sections). `zip` is present as a column but **empty on
all rows** — the postcode has to be parsed out of `full_address`, and 24% of rows have no address at
all (service-area listings: *"Prime Piling | Covering Essex and London"*).

**Fill rates (from this run, BY DEPTH):** head (Maps fields) 100% except website 94% / postcode 76% ·
mid (on-site text) **~85% fetchable**, 15.2% residue · deep (a named decision-maker) **61.5% after
the free rungs, TBD final**.

**Restrictions:** `offset` pagination works and is load-bearing here — **2.61 calls per runsheet row**,
page-depth `{1:87, 2:1498, 3:483, 4:22}`, **no spike at `max_pages` 6**, so no viewport was left
unexhausted and quadrant splits were 0. 284 `failed` events, all re-bought and healed (20 heal passes,
0 unhealed). **87 `(tile, query)` pairs returned `status:ok` with count 0** — not real zeros: a single
query at a tile that returned hundreds for the other nine. `run-scrape.js` heals only `status != ok`,
so they are invisible to the coverage report; 36 of them were re-bought by hand for 79 calls and
added **+295 businesses**. `country=gb` is a hint, not a filter — the footprint gate is doing primary
work, not cleanup.

**Method (the exact working recipe):**
- **10 queries**, and the volume is in P2, the inverse of the US run: `underpinning` · `subsidence
  repair` · `structural repair` · `foundation repair` (P1, weak UK labels but cheap) · `damp proofing` ·
  `basement waterproofing` · `structural waterproofing` · `cellar tanking` · `mini piling` ·
  `wall tie replacement` (P2, where the list actually comes from). Drop the US-idiom suffix:
  `underpinning`, never `underpinning contractor`.
- **Qualify volume-safe, not precise** — the real ICP judgement is the downstream site-text
  adjudication. Denies first, then the positive allow, then the floor.
- **Review floor 5, not 30.** This trade in the UK is 3-to-10-person owner-operated firms with
  single-digit review counts. Five removes unclaimed ghost pins and nothing else.
- **Generic construction types are refused at the allow and recovered by NAME** (`Construction
  company`, `Contractor`, `Builder`, `Concrete contractor` are ~17% ICP / ~83% noise), plus a separate
  **unrated track** (blank `review_count` + a live website).
- **The funnel, actual:** 22,193 universe → qualify 2,057 + generic recovery 441 + unrated recovery
  344 = **2,842** → footprint gate **1,969** (`far_from_hubs` 872, `wrong_country` 1) → cross-run
  dedupe vs the 175-row export deliverable **1,770** (199 dropped: 109 id + 89 host + 1 phone) →
  collapse 1,469 spend rows + 146 no-website → site text + keyword tiers + model adjudication →
  **686 ICP + 174 damp-only**.
- **Keyword tiers are a pre-filter only, and tier D is the check that they are safe:** A 246 · B 632 ·
  C 117 · D 775. A seeded 100-row random sample of tier D was adjudicated as a false-negative test and
  returned **0 ICP of 100** — the tiers are not hiding a segment. (Export run, same test one tier up:
  tier C yielded 14 yes of 372.)

**Rule lessons (P1–P8, all measured against this run's own drop files, all approved at GATE 3):**
- **P1 — never deny `water damage restoration service` by primary type.** The UK damp trade
  self-labels that way and Google primaries it accordingly: the deny was deleting **516 rows**,
  including all five *Richardson & Starling* branches and both *Rentokil Property Care* branches —
  brand families the client explicitly said to keep and flag. Removing it moved `off_icp_primary`
  2,495 → 2,032. `fire damage restoration service` still stands. Same shape as the pest-control
  lesson one line below.
- **P2 — `pile driving` must be in the allow list.** Google's category is "Pile driving service",
  which does not contain the stem `piling`, so **42 piling firms died on a pure type-stem gap**.
  Precision cost ≈ 0.
- **P3 — `property management company` is a PRIMARY-only deny, never `scope:"any"`.** Of its 84 hits
  only 18 were primary; 66 were a secondary tag and 19 of those carried an ICP allow type. It was
  deleting real firms through their second tag. Moving it also shrank `hard_off_icp_type` 190 → 115,
  which made that bucket honest again.
- **P4 — `drainage` does not belong in the allow.** Its 40 kept rows were handyman generalists whose
  only ICP signal was a secondary drainage tag, and drainage-PRIMARY firms are denied anyway.
- **P5 — `plasterer` belongs in the RECOVERY type allow.** UK damp proofing is very often primaried
  Plasterer (re-plastering is the second half of a damp job): +39 rows with an ICP name token.
- **P6 — damp-SURVEY practices are real trading firms** (*Damp Surveys Ltd*, 133 reviews). Admit them
  via the recovery's name gate (`surveyor` as a recovery type, never a main-pass allow) so a general
  practice with no damp vocabulary still never qualifies. Chartered/quantity surveyors stay out on the
  name deny. **This is a COMPANY-level rule only** — inside a damp firm the surveyor is still the
  wrong person to contact.
- **P7 — a BLANK `review_count` is not a 0.** It failed the floor exactly as a zero did, deleting 417
  unrated listings (107 UK, ICP-named, with a live website). Route blanks to a separate unrated track
  gated on "has a website": +344 rows, 258 of which survive to the final list.
- **P8 — brand names carry no ICP vocabulary**, so branded branches strand in `not_in_icp` where the
  recovery's name gate cannot see them. Add the brand-family terms as recovery name tokens
  (Protectahome ×6, Prokil, Timberwise…). Lengthen ambiguous brand terms (`abbey` → `abbey pynford`)
  and **never** brand-match a manufacturer whose name appears as an accreditation on independents'
  listings (Helifix, Permagard) — a wrong brand label is worse than none.

**Owner-finding (where the names live), yields per rung on 860 leads:**
- **Own site is NOT the first rung here.** UK trade sites name someone on ~4% of ICP sites (16% in the US).
- **Companies House is the registry, and it is free.** Engine pass: **431 of 860 authoritative**
  (50.1%) + 189 low-confidence candidates with directors fetched = a director name on the table for
  620 (72.1%). A postcode is the disambiguator that matters: **54.2% matched where one existed vs
  37.8% where it did not**, and 24% of this run's rows have no address at all.
- **Model reads of the on-disk evidence (free, in-session Haiku, no search):** site-text pass
  **380 of 598**; a registry-only pass over the 192 leads that had no page text **103 of 192**; a
  second registry pass after a looser exact-title match, **46 of 47**. Cumulative **529 of 860
  (61.5%)** before any web search.
- **A second Companies House pass on the unnamed is worth running** and belongs AFTER the reads:
  377 re-searched → 102 matched with active directors (96 on exact-title equality), and the wins are
  the leads the engine had matched to the WRONG company (*Derbyshire Damp Services* was on DERBYSHIRE
  COMPUTER SERVICES LTD). **55 of the 102 are national-brand branches resolving to the national
  parent and must be skipped** — the group board is not the branch's decision-maker.
- **LinkedIn-restricted WebSearch sweep (`--registry linkedin.com`, never `bbb.org` in the UK):**
  tranche 1, 100 of 377 queued leads, **≈24% named — TBD, one tranche of four**. Trim Google-Maps
  title separators out of the query first: 73 of 377 names carry a `|`/`,`/` - ` or run past 45
  characters and return nothing when quoted whole.
- **Combined named: TBD** (529/860 = 61.5% before the sweep; the export run's qualified-only headline
  was 79%).

**Emails:** this scrape carries **no Maps email column at all**, so every address is on-site.
The engine's own harvest reached **35% of the ICP segment**; a deep harvest (mailto / JSON-LD /
Cloudflare `data-cfemail` / tag-split, plus contact-page L2 keywords) lifted it to **46% ICP and 83%
damp-only** — 494 addresses over 422 domains, **137 of them invisible to the engine's rung**, +103
leads made contactable. Person-shaped mailboxes stay rare (14 of 860); the rest are
`info@` / `enquiries@` or free-mail company inboxes. **See `IMPROVEMENTS.md` — the extraction rungs
and the contact-page keywords are engine-shaped, not job-shaped.**

**Cost actuals (per this run):** **4,620 Maps calls** for a 22,193-row universe over 1,770 runsheet
rows = **2.61 calls/row ≈ 208 calls per 1,000 universe rows ≈ 5.4 calls per worked lead**, 8 shards,
20 heal passes, 0 unhealed tiles. Everything after the scrape was **$0**: site text (free fetch +
in-container Scrapling), Companies House (free key), every owner read and the sweep (in-session
Haiku / WebSearch, ~200 WebSearch calls per session ceiling). **Email verification has NOT run** —
no MillionVerifier / BounceBan keys, and credits need an explicit operator go. **TBD.**

**Gotchas:**
- **Site text is ~85% fetchable and the last 15% is not buyable from a datacentre egress.** 403s
  ×163; TLS/JA3 impersonation clears none of them; Scrapling's `solve_cloudflare` recovered 40 of 126
  attempts and then hit a hard ceiling — **the Turnstile widget host
  (`brunhild.challenges.cloudflare.com:443`) is blocked from this egress**, so a challenge that needs
  it can never complete. Wayback was offline/429 as a mirror rung. Budget the residue; do not buy a
  fourth attempt.
- **Thin shells are not JS shells.** A full render with `network_idle=True` returned 63–211
  characters on the ones probed. Do not spend a renderer on them.
- **The city-only Companies House acceptance is ~21% wrong** while the postcode and exact-name paths
  are ~0%. Demote it and let the reader judge, or ship wrong owner names. A UK town is not a
  disambiguator when every firm is `<word> Damp Proofing`.
- **Sole traders never appear in the registry.** 15 unmatched leads carry a personal name
  (*Peter Cross Preservation*, *Davidson's DPR*) — the trading name IS the owner, and those belong to
  the site-read / sweep tracks.
- **A blank `city` breaks downstream personalisation.** 106 of the still-unnamed leads have none and
  207 leads have an entirely empty `full_address`; STEP 7b needs a job-side `city_overrides.json`.

**Runs:**
- 2026-09-16 — Atlas Growth — operator export, 5,999 rows → 175 ICP, 138 named (79%), 151 emails —
  validated qualify + owner-finding; scrape not ours.
- 2026-09-17 — Atlas Growth — own scrape, 22,193 universe → 1,770 net-new → **686 ICP + 174
  damp-only**; 529/860 named (61.5%) before the sweep; 459/860 with an email (53.4%); verification not
  run. **Sweep and verification TBD.**
```

---

# C. `clients/atlas-growth/STATE.md` — drafts

## C1 — replacement "Where the run stands" section

Insert as a new dated section above *"Where the 2026-09-16 UK run stands"* (which covers the export
run and stays as it is). The **Status** table's "Current run" cell should be shortened to point here.

```markdown
## Where the 2026-09-16 UK MAPS run stands (2026-09-17, end of session)

Our own UK scrape. Scripts + the reports in the run folder are tracked; all data (`leads_*.csv`,
`owner/`, `deliverable/`) is gitignored.

| Stage | State | Numbers |
|---|---|---|
| Scrape (177 tiles × 10 queries, 8 shards, pagination on) | done | 22,193 unique · 4,620 calls · 2.61 calls/row · 20 heal passes, 0 unhealed · 87 `ok`+0 events, 36 re-bought (+295) |
| Qualify + recoveries (GATE 3 P1–P8 applied) | done | main 2,057 + generic recovery 441 + unrated recovery 344 = **2,842** |
| Footprint gate + cross-run dedupe + collapse | done | 2,842 → 1,969 → **1,770 net-new** (199 dropped: 109 id + 89 host + 1 phone) → 1,469 spend rows + 146 no-website |
| Site text (+ Scrapling rung on the 403s) | done | 1,245 of 1,469 ok (**~85%**); 224 residue (15.2%): 157 challenge-class, 128 thin shells, 67 dead. Ceiling is this egress: the Turnstile host is blocked |
| Keyword tiers + model adjudication | done | A 246 · B 632 · C 117 · D 775; tier-D 100-row seeded sample **0 ICP of 100** → **686 ICP + 174 damp-only** |
| Emails (on-site only — this scrape has no Maps email column) | done, **unverified** | engine harvest 35% ICP → deep harvest **314/686 (46%)** ICP and **145/174 (83%)** damp-only; 459/860 (53%) overall, 434 unique |
| Companies House (engine pass + demotion) | done | **431/860 authoritative** (50.1%) + 189 candidates = 620 with a name on the table (72%); 83 city-only matches demoted job-side (~21% wrong path) |
| Owner reads (free, in-session Haiku) | done | site-text **380/598** · CH-only **103/192** · CH pass-2 **46/47** → **529 of 860 named (61.5%)** |
| Companies House pass 2 | done | 377 re-searched → 102 with active directors (96 exact-title); 55 brand branches skipped; 47 read |
| LinkedIn sweep (`--registry linkedin.com`, 377 queued, 19 batches of 20) | **tranche 1 of ~4 done** | ~24% named on 100 leads — **TBD**; ≤200 WebSearch per session, 5 batches per tranche |
| Combined named | **TBD** | 529/860 before the sweep; export run's qualified-only headline was 79% |
| Plusvibe upload (STEP 7b) | config drafted, **not filled** | `clients/atlas-growth/personalize-config-uk.json` — UK trade table, pre-test. 3-lead then 7-lead operator test before any full fill |
| Verification (MillionVerifier → BounceBan) | **NOT RUN** — needs keys + an explicit go | ~434 unique addresses |

Open: finish the sweep (3 tranches, ~277 leads); `combine-owner-contacts.js` and
`assemble_deliverable.py` after it; the STEP 7b gated tests; then verification. The engine write-back
for this run is drafted in
`clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/WRITEBACK-DRAFT.md` and is **not applied**.
```

## C2 — deliverables-ledger row

Append to the **Deliverables ledger** table. Nothing has shipped from this run yet, so the row is
staged, not stated — replace the date and the row count when the hand-off actually goes out:

```markdown
| TBD (not yet shipped) | 2026-09-16_uk-foundation-repair-maps | `contacts_final.csv` + `deliverable/` — **860 leads** (686 ICP + 174 damp-only), 529 named (61.5%) before the sweep, 459 with an unverified email (53.4%); Plusvibe upload pending the STEP 7b tests; verification pending an operator go | not sent — sweep tranches 2–4 outstanding |
```

If the run ships in stages, mirror the 2026-09-11 pattern and give each artefact its own dated row
(`contacts_final.csv`, then `emails_final.csv`, then `plusvibe_upload.csv`).

## C3 — one line for "Client directives (standing)"

Only if the operator confirms it, since it reads as a directive rather than a run fact:

```markdown
- **UK runs use the UK vocabulary end to end.** No US label reaches the client: not `foundation
  repair` as a business type, not `inspection` for the first visit (it is a **survey**), not `bbb.org`
  as the sweep registry (LinkedIn), not a review floor of 30 (it is 5). The UK personalisation config
  is `personalize-config-uk.json`; the US one is not edited for UK jobs.
```
