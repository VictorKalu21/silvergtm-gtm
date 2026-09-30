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

## Waiting on the operator
1. `SCRAPER_TECH_KEY` → `skills/google-maps-scrape/.env` (gitignored). STATE.md says the key pasted on
   2026-09-24 was to be rotated — supply the current one.
2. GATE1.md §4 decisions (floor 5 vs 30; keep `generator shop`; offer wording).
3. The dedupe memory files (two UK foundation deliverables, gitignored) restored into their run folders
   before PIPELINE STEP 5.

## Probes
None yet — the calibration sheet IS the 3-call probe (GATE1 §5). Network from this container reaches
`api.scraper.tech` (403 without a key, i.e. the host answers).
