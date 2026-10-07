# Atlas Growth — scoping: damp proofing + mould remediation, UK and US

Status: **PHASE 0–1 DRAFT, 2026-10-07 — at the Phase 1 gate.** Nothing bought, nothing scraped;
every number below is from a free probe pasted in the session transcript (3-call rule) or from the
source library. Parent docs: `ICP.md` (offer), `ICP-uk.md` (UK damp is already the majority of the
UK foundation-repair ICP), process rules R1–R4 of `skills/icp-source-planner`.

## 0. ICP contract

| | UK | US |
|---|---|---|
| Entity | Owner-operated remedial contractor that sells a **survey-led homeowner job**: damp proofing, structural waterproofing, timber, condensation/mould remediation | Same, but the trade splits by label: **mold remediation** (licensed in TX, NY, LA, FL and a few more) and **basement waterproofing / crawlspace / moisture control** ("damp proofing" is not a US trade name) |
| Buyer | Managing Director / Director / Owner (Companies House) | Owner / President (BBB, licence qualifying party) |
| First visit (the thing Atlas books) | **damp and mould survey** (UK trade says "survey") | **mold inspection** / **moisture inspection** |
| Job value | £1.5k–£6k damp; £500–£3k mould treatment; £3k–£10k with re-plastering/ventilation | $1.5k–$6k mold remediation; $3k–$15k waterproofing |
| Urgency driver | Awaab's Law (2025, social landlords; private landlords 2026), mortgage/survey flags, health | State licensing + insurance claims + sale-of-home inspections; health |
| Keep + flag | brand families (Peter Cox, Rentokil, Timberwise, Kenwood, Prokil…) | franchise families (SERVPRO, ServiceMaster, PuroClean, 1-800 Water Damage, Mold Busters, AdvantaClean, Basement Systems, Groundworks) |
| Drop | assessment-only surveyors, labs, product suppliers, landlord-compliance consultancies, carpet/cleaning firms with a "mould" page | mold **assessment**-only licensees (NY SH125, TX assessment files), labs, training providers, commercial-only restoration |
| Must-have fields | name, city, phone, website, **email**, owner name, fit verdict | same |
| Nice-to-have | Companies House number, PCA skills, review count | licence number + status + expiry, state, franchise flag |

## 1. What is already built (dedupe universe — do not re-buy)

- **UK damp proofing is done.** `2026-09-16_uk-foundation-repair-maps`: 22,193-row Maps universe
  bought on 10 queries incl. `damp proofing`, `basement waterproofing`, `structural waterproofing`,
  `cellar tanking` → **898 worked leads (715 ICP + 183 damp-only)**, 68% named, 435-row Plusvibe
  upload sent 2026-09-17. ~60% of that list self-labels as damp proofing. A fresh "damp proofing UK"
  run would be ~95% duplicates of a list the client already holds.
- **PCA register (UK)**: re-pulled today, keyless, 10 calls — **463 members, 402 contractors, 322 with
  the Damp Control skill, 25 Residential Ventilation (the condensation/mould sub-trade), 36 Flood
  Protection/Recovery.** Email on every contractor. No "mould" skill exists on the register; mould
  firms sit inside Damp Control + Residential Ventilation.
- **US waterproofing**: `2026-09-11_foundation-repair` (10 states, 1,104 ICP incl. basement
  waterproofing/crawlspace, 845 named) + the OEM/dealer networks (Basement Systems 105, Supportworks 99).
  The US "damp" side is therefore also largely in the universe for those 10 states.

**So the new ground is: (a) UK mould/condensation specialists, (b) US mold remediation.**

## 2. Ranked sources (free-first) — probed 2026-10-07

### US mold remediation
| # | Source | Probe result | Fields | Verdict |
|---|---|---|---|---|
| 1 | **Texas TDLR licence data files** `tdlr.texas.gov/dbproduction2/vsMoldRemediationCompany.csv` | 200, 86 KB, **598 rows, 472 CURRENT**, refreshed daily (file dated 10/6/2026); Houston 85 · San Antonio 37 · Austin 26 · Dallas 18 | licence no., status, expiry, company, address, county, **phone 100%**; no email, no website | **Tier 0, $0** — membership = licensed remediator (R3) |
| 2 | **New York DOL mold licences (Socrata `ikqx-ispy`)** `data.ny.gov` | 200; **942 Active SH126 remediation contractors** (+798 assessment SH125 to exclude), updated 2026-10-06 | business name, DBA, address, phone, status, dates | **Tier 0, $0**, SoQL filter `license_type like 'Mold Remediation%' AND license_status='Active'` |
| 3 | **Louisiana LSLBC** (known email-bearing board) | roster endpoint answered 200 (`RosterRequest_482289.CSV` issued for keyword `mold`); the search page lists a **"Mold Remediation License Certificate"** classification | company, **email**, qualifying party | **Tier 1, $0** — pull by classification, not keyword, next |
| 4 | Florida DBPR mold remediator (MRSR) | datamart redirects to a login (`loginFLDBPR.do`) | — | needs the public "licensee file" route or a free account — to verify |
| 5 | Google Maps `mold remediation` / `mold removal` / `mold inspection` / `water damage restoration` | not run; scraper.tech key on file | the usual Maps fields, no email | **paid**; for states without a licence roster. Water-damage restoration is franchise-saturated; expect heavy brand flagging |
| 6 | IICRC certified-firm locator | page 200 but the locator is a JS widget, no endpoint in the HTML | — | parked |
| — | Arkansas roster | no mold classification (3 name mentions only) | — | not a source for this vertical |

### UK mould / condensation
| # | Source | Probe result | Verdict |
|---|---|---|---|
| 1 | **PCA Damp Control + Residential Ventilation** | 322 + 25 contractors with email, already on disk | $0 spine; cross-join to Maps |
| 2 | **Google Maps**, new queries only: `mould removal`, `mould remediation`, `mould specialist`, `damp and mould survey`, `condensation specialist` | not run; the 177-tile UK sheet exists (`gen-runsheet-uk.js`); ~150 metro anchors × 5 queries ≈ 750 calls, ~2.6 calls/row | **paid**, the only volume source; dedupe vs the 22,193 universe will remove most damp-proofers and leave the mould-led firms |
| 3 | BDMA (British Damage Management Association) corporate members | find-a-member 404; `/membership-and-accreditation/accredited-corporate-members/` exists, not yet read | flood/fire restoration firms, mostly insurer-facing — likely low fit |
| — | Checkatrade / Yell / Trustmark | Cloudflare 403 from this egress (library) | dead |

## 3. Proposed Phase 3–4 (needs the gate below)

**US — registry-first, $0 before any Maps spend.** TX (472) + NY (942) + LA (classification pull) →
franchise flag → `name-to-domain` (free resolver + Haiku verify, R4) → site text → fit classifier
(residential remediation vs assessment-only / commercial / franchise branch) → **stratified 50-row
test by state and metro** → owner (BBB sweep, LA qualifying party) → emails (on-site + LA filed) →
verify → Plusvibe with "mold inspection" wording. Maps only afterwards, for the states with no roster.

**UK — 20-tile calibration first.** 20 metro tiles × 5 mould queries = ~100 Maps calls → dedupe vs
the 22,193 universe → see how many *new* mould-led firms exist before buying the full sheet. If the
new-row rate is under ~15%, UK mould is a re-send to the existing list with mould wording, not a new
scrape.

## 4. Gate — decisions needed
1. UK damp proofing = dedupe-only (no re-buy): confirm.
2. US scope: registry-first TX + NY + LA (recommended), or Maps nationwide from the start.
3. Franchise branches: keep and flag (as every Atlas run so far), or drop SERVPRO-class brands.
4. Wording: "damp and mould surveys" (UK) / "mold inspections" (US) as the booked visit.
5. Spend: ~100 UK Maps calls for the calibration; $0 on the US side until the test passes.
