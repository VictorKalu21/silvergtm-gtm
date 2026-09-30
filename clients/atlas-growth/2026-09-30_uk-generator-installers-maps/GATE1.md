# GATE 1 — read-back before any API call (SKILL STEP 3, "read-back before spending")

Run: `clients/atlas-growth/2026-09-30_uk-generator-installers-maps/` · Client: Atlas Growth ·
Spec: `../ICP-generators-uk.md` **option B — generators only, Maps only** (operator, 2026-09-30:
"pull generator installers in uk / maps").

Nothing has been scraped. **No `SCRAPER_TECH_KEY` exists in this container** (`skills/google-maps-scrape/.env`
is absent; `run-shards.sh` refuses to launch without it). The operator supplies the key, then the
calibration runs first, then this sheet.

## 1. Footprint — what will be bought

| | |
|---|---|
| Mode | `areas` (tiles are the footprint), `geo.country: gb` |
| Tiles | **177** = the 2026-09-16 UK foundation grid, imported unchanged from `gen-runsheet-uk.js` (150 anchors + 27 densify) |
| By nation | ENG 130 · SCT 25 · WLS 13 · NIR 9 · London 13 tiles |
| Zoom | 13, pagination on (`max_pages 6 × limit 150`), one quadrant split max |
| Queries | **5**, generator-intent only: `generator installation` · `standby generator installer` · `backup generator` (P1) · `generator engineer` · `generator shop` (P2) |
| Rows | **885** (177 × 5) → 8 round-robin shards of ~111 rows (`../shards-generators-uk/`) |
| Expected calls | 885 rows × 1.5–2.6 calls/row (UK foundation measured 2.61 on a dense trade; generators are sparse) ≈ **1,300–2,300 Maps calls** |
| Calibration first | `../atlas-growth-generators-uk-calibration-runsheet.csv` — 3 rows (London / Manchester / Glasgow, one query each) ≈ 3–9 calls |

## 2. Qualification — `../atlas-growth-generators-uk-config.json` (PROVISIONAL until calibration is read)

1. **Primary-type deny** — hire yards, merchants, DIY sheds, small-engine/garden/agri dealers, vehicle/caravan/marine electrics, utilities, manufacturers, engineering consultancies.
2. **Name deny** — `" hire"` (leading space: catches *Speedy Hire*, *ABC Plant Hire*, never *Cheshire*), hire brands, merchants, DIY sheds, utilities, vehicle/leisure vocabulary. No OEM names (an "approved dealer" is ICP signal), no chain drop (flag, never drop).
3. **Allow on any google_type** — generator · electric · energy · solar · power · contractor · engineer · gas · heating · plumb · installation service.
4. **Review floor 5** (ghost filter, the UK foundation floor) — **not** the US generator run's 30. Blank-review rows recovered by `../recover-unrated-generators-uk-config.json`.

Dry-run on an 18-row fixture (`dryrun-results.md`): 6 keep / 12 drop, every drop the intended
reason, shire names untouched, unrated row recovered.

## 3. Downstream (unchanged from the UK foundation run)

Footprint gate 0.75° → cross-run dedupe vs the two UK foundation deliverables → collapse-domains →
site text → STEP 5e fit (**residential generator install is a real service** = keep; hire-only,
commercial/industrial-only, portable-retail, electrician-with-no-generator-service = drop) →
owners (Companies House first, then the read, then the sweep; prompt `owner-prompt.md`) → on-site
emails → MillionVerifier → BounceBan → Plusvibe (UK wording: quote / site-survey appointments).

## 4. Decisions the operator confirms before the 885-row spend

| # | decision | default in the config |
|---|---|---|
| a | **Option B confirmed** — generators only, no MCS battery spine, no battery query | yes (this run) |
| b | Review floor **5** (UK ghost filter) vs **30** (US generator floor) | 5 |
| c | Keep the `generator shop` query? It text-matches Google's *Electric generator shop* category, which in the UK is hire-heavy — the config denies hire, but it is the query most likely to buy junk rows | keep (P2) |
| d | Offer wording for the UK list — "generator estimate appointments" → "generator quote / site-survey appointments" (Plusvibe stage) | as ICP doc |
| e | Expected size: **low hundreds** of real installers nationwide (ICP doc). Confirm that is worth the spend before launching the full sheet — the calibration will say | — |

## 5. Launch sequence (after the key is in `skills/google-maps-scrape/.env`)

```bash
cd /home/user/silvergtm-gtm
# 1. calibration (≈3–9 calls) — read calibration/leads_clean.csv + run_log.json, then decide 4b/4c
node skills/google-maps-scrape/run-scrape.js \
  --runsheet clients/atlas-growth/atlas-growth-generators-uk-calibration-runsheet.csv \
  --config   clients/atlas-growth/atlas-growth-generators-uk-config.json \
  --out      clients/atlas-growth/2026-09-30_uk-generator-installers-maps/calibration --max-retries 3
node skills/google-maps-scrape/qualify-leads.js \
  --in     clients/atlas-growth/2026-09-30_uk-generator-installers-maps/calibration/leads_clean.csv \
  --config clients/atlas-growth/atlas-growth-generators-uk-config.json \
  --out    clients/atlas-growth/2026-09-30_uk-generator-installers-maps/calibration
# 2. full sheet, 8 workers (exit 0 = every shard COMPLETE)
bash clients/atlas-growth/2026-09-30_uk-generator-installers-maps/run-shards.sh
# 3. then PIPELINE.md, step by step
```

## 6. Calibration result (2026-09-30, key supplied by the operator; floor 5 confirmed by the operator)

Two sheets, **9 Maps calls, 106 unique businesses**, every tile `ok`, coverage COMPLETE:

| tile × query | rows | pages | note |
|---|---:|---:|---|
| London-centre × generator installation | 0 | 1 | genuine thin tile, not an API fault — see next row |
| London-centre × standby generator installer | 5 | 2 | central London holds hire yards, not installers; the 12 outer-London densify tiles cover the ring |
| Manchester × standby generator installer | 30 | 2 | |
| Manchester × generator installation | 31 | 2 | the query works; the London zero is the tile |
| Glasgow × generator engineer | 40 | 2 | |

**The universe is sparse and Maps widens its radius to fill:** the Manchester standby query returned firms in
Tenby, Southampton, Colchester, Aylesford and Peterborough, and three US listings (Oak Ridge NJ, Chicago) — the
0.75° footprint gate removes the foreign pins (PIPELINE STEP 4). Calls/row measured **1.8** (9 calls / 5 rows),
so the 885-row sheet should land near **1,600 calls**.

**Rule tune from the evidence ($0, re-run over the same 106 rows):** the bare `electric` stem admitted a motor
rewinder and the bare `gas` stem admitted a lab-gas supplier via a secondary tag → stems tightened to
electrician / electrical / electric-vehicle-charging and gas-installation / gas-engineer / gas-fitter; 19 primaries
added to the deny (rewinds, machine/compressor repair, vehicle repair trading as "Generator Services", electronics /
chemical / precision / marine engineering, pool contractor, lab equipment, handyman, hydro turbines, diesel-engine
repair on primary only). `power station` removed from the deny — it matched Google's *Power Station Equipment
Supplier*, the type UK standby-power suppliers carry.

After the tune: calibration 1 → **21 keep / 49 drop** (too_small 22 · off_icp_primary 25 · name_deny 2);
calibration 2 → **19 keep / 17 drop** (too_small 14 · off_icp_primary 2 · name_deny 1). Kept rows are electrical
contractors and named generator firms (Generator Installations (UK) Ltd, Hampshire Generators, Solent Power, DTGen,
Pleavin Power, Euro Generators (UK), Osprey Power Services, Wallace Power Services, Phaser Industrial Power).

**Cost of floor 5, measured:** 9 named generator firms with 1–4 reviews drop as `too_small` in calibration 1 alone
(UK Power Generators, WB Power Solutions Manchester, Ingram Installations, Standby Power Systems, Harper Generator
Services, RGH Diesel Generator Service, Kings Power Solutions, Hampshire Generators (Wales), Generator & Electrical
Services). This trade sells mostly to businesses, so its Google review counts run low (SKILL STEP 1.5: review
floors are for consumer-facing ICPs). Operator chose floor 5 knowing the US floor was 30; the 1–4 band stays
re-checkable at $0 by re-running qualify at 0 over `excluded_officp.csv` if the final list is too small. Blank-review
rows (8 of 70 here, e.g. KVA Power Installations, LMK Power, Standby Power Solutions) are the unrated-recovery track.

**Decision: launch the 885-row sheet** (operator go = key + "use floor 5", 2026-09-30).
