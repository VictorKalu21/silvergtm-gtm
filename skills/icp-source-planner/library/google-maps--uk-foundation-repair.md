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
the free on-disk reads, 68.1% final** (586 of 860, after the web sweep and the same-company QA).

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
  **17 batches over 331 still-unnamed leads, ~470 WebSearch calls, 70 named = 21%.** Tranche yields
  were flat, so there is no point stopping early or running a fourth: **23/100 · 22/100 · 24/100 ·
  5/31**. Trim Google-Maps title separators out of the query first: 73 of 377 names carry a
  `|`/`,`/` - ` or run past 45 characters and return nothing when quoted whole.
- **Combined named: 586 of 860 (68.1%)** after a same-company QA that removed 13 of the 599 raw names
  (branch-to-national-parent and wrong-company CH matches). **By source: Companies House 504 · web
  search + SERP 68 · website 12 · email local part 2.** The registry is ~86% of every name on this
  list. (The export run's qualified-only headline was 79% on 175 rows.)

**Emails:** this scrape carries **no Maps email column at all**, so every address is on-site.
The engine's own harvest reached **35% of the ICP segment**; a deep harvest (mailto / JSON-LD /
Cloudflare `data-cfemail` / tag-split, plus contact-page L2 keywords) lifted it to **46% ICP and 83%
damp-only** — 494 addresses over 422 domains, **137 of them invisible to the engine's rung**, +103
leads made contactable. Final: **468 of 860 (54.4%) have an email**, **444 unique best addresses** in
`verify_input.csv`, and **367 leads (42.7%) have a name AND an email**. Person-shaped mailboxes stay
rare — **39 of 860**, and 25 of those only after a job-side re-rank; the rest are `info@` /
`enquiries@` or free-mail company inboxes. **See `IMPROVEMENTS.md` — the extraction rungs, the
contact-page keywords and both ranking fixes are engine-shaped, not job-shaped.**

**Cost actuals (per this run):** **4,620 Maps calls** for a 22,193-row universe over 1,770 runsheet
rows = **2.61 calls/row ≈ 208 calls per 1,000 universe rows ≈ 5.4 calls per worked lead**, 8 shards,
20 heal passes, 0 unhealed tiles. Everything after the scrape was **$0**: site text (free fetch +
in-container Scrapling), Companies House (free key), every owner read and the sweep (in-session
Haiku / WebSearch — **~470 WebSearch calls for 70 names, ~6.7 searches per name**, against a
~200-call-per-session ceiling, so the sweep is 3+ sessions of budget). **Email verification:** 444
unique addresses → **370 sendable (83%)**, 39 risky (catch-all), 35 dropped (20 of them persistent
MillionVerifier API errors) — 444 MV + 118 BB credits. **Plusvibe (STEP 7b):** 391 rows (one per
sendable lead), 364 personalised from site text, 27 fallbacks, **27 named** — this vertical is
`info@` / `enquiries@` country, so the send is mostly nameless company mailboxes. **41 of 391 rows
(10.5%) had no city after the fill** (service-area listings with no Maps address): budget a job-side
`city_overrides.json` pass — focused Haiku site re-read (20/31), then a keyless Nominatim reverse
geocode at town level (~1 call/s, district answers rejected), then county / the area in the name.

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
  disambiguator when every firm is `<word> Damp Proofing`. Budget a same-company QA pass over the
  combined names at the end: it removed 13 of 599 here.
- **The web sweep is a 21% rung in the UK, not a 70% one.** It is still worth running (70 names for
  $0), but plan the headline around the registry, not the sweep.
- **Sole traders never appear in the registry.** 15 unmatched leads carry a personal name
  (*Peter Cross Preservation*, *Davidson's DPR*) — the trading name IS the owner, and those belong to
  the site-read / sweep tracks.
- **A blank `city` breaks downstream personalisation.** 106 of the still-unnamed leads have none and
  207 leads have an entirely empty `full_address`; STEP 7b needs a job-side `city_overrides.json`.

**Runs:**
- 2026-09-16 — Atlas Growth — operator export, 5,999 rows → 175 ICP, 138 named (79%), 151 emails —
  validated qualify + owner-finding; scrape not ours.
- 2026-09-17 — Atlas Growth — our own scrape, 22,193 universe → 1,770 net-new → **686 ICP + 174
  damp-only**; **586 of 860 named (68.1%)** (CH 504 · web search/SERP 68 · site 12 · email local part
  2); **468 with an email (54.4%)**, 444 unique best addresses, 367 named+email; verified **370
  sendable** of 444; Plusvibe upload **391 rows** (364 personalised, 27 named, 0 blank cities after
  42 job-side overrides).
