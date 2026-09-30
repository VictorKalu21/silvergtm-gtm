# 2026-09-30_uk-generator-installers-maps — run notes

Operator ask (2026-09-30): "pull generator installers in uk — maps and clients/atlas-growth/ICP-generators-uk.md".
That resolves the ICP doc's GATE to **option B: generators only, Google Maps only** (no MCS battery spine).

## Built 2026-09-30 (no API calls, no key in the container)
- `../gen-runsheet-generators-uk.js` → `../atlas-growth-generators-uk-runsheet.csv` (885 rows), a 3-row
  calibration sheet, and 8 shards in `../shards-generators-uk/` (gitignored, regenerate with the script).
  The 177-tile grid is imported from `../gen-runsheet-uk.js`, which now exports its tile arrays
  (its own output is byte-identical to before — verified).
- `../atlas-growth-generators-uk-config.json` (4 rules) + `../recover-unrated-generators-uk-config.json`
  (3 rules); dry-run on an 18-row fixture in `dryrun-results.md`.
- `run-shards.sh` (refuses to launch without `SCRAPER_TECH_KEY`), `merge-shards.js` (copied unchanged
  from the 2026-09-16 UK maps run — `--run` defaults to this folder), `PIPELINE.md`, `GATE1.md`.
- `owner-prompt.md` = `../owner-prompts/uk-generator-installers.md` (built per STEP 6a; UK roles, Companies
  House authoritative, QS / sales-engineer / hire-desk traps).

## Operator go (2026-09-30)
Key supplied (in `skills/google-maps-scrape/.env`, gitignored) and "use floor 5". `generator shop` kept, offer
wording as the ICP doc. Still needed before PIPELINE STEP 5: the two UK foundation deliverables (gitignored)
restored into their run folders as the dedupe memory.

## Calibration (2026-09-30) — GATE1.md §6
`calibration/` (3 rows, 5 calls, 70 rows) + `calibration2/` (2-row probe of the London zero, 4 calls, 36 rows).
London-centre is a genuinely thin tile (0 and 5 rows on two queries) while Manchester gives 30–31 per query; the
universe is sparse and radius-expanded (national + 3 US pins). Config tuned from the evidence and re-qualified at $0.
**Full sheet launched 2026-09-30 via `run-shards.sh`** (885 rows, 8 workers, ≈1,600 calls expected).

## Probes
The calibration sheets are the probe (9 calls, output in GATE1 §6 and `calibration*/run_log.json`).

## Full run (2026-09-30) — funnel in GATE1.md §7
885 rows / 1,789 calls → 7,022 unique → qualify 2,138 + unrated 282 = 2,420 → geo 1,285 + 16 blank-address UK
recoveries = **1,301 in footprint** → collapse **1,146 owner-finding rows** + 81 no-website. The London
calibration zero was a transient `ok` empty response (51 rows on the full run) — GATE1 §6 corrected.
Job-side recovery `recovered_geo_blankaddr.csv`: 16 of 108 blank-address rows (UK phone or UK domain) appended to
`leads_clean_qualified_infootprint.csv` before collapse; the engine gap is the OPEN 2026-09-20 footprint-gate item.
**Stopped at GATE 3: dedupe memory absent, no owner-finding started, no credits spent beyond the 1,798 Maps calls.**
