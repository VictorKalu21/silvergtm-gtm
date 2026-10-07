# Plan: Trial Task 3, Mexican supplier sourcing and RFC enrichment

Client folder: `clients/cabot-insights/`. Run folder: this one. Runs under `icp-source-planner` sample mode: one gate, then execute. Everything below the gate is machine work in one Claude Code session, except the SAT upload, which the operator does in a browser.

Deliverable: `results.csv` with the brief's eight columns, plus `EXPLANATION.md`. Both gitignored except the explanation (no PII in it).

## What the brief is actually grading

Phase 1 and Phase 2 are graded equally. Correctness beats coverage. A validated RFC on 40% beats a guess on 90%. Every RFC must have a checkable source and must pass the SAT bulk validator. "NOT_FOUND" is a legitimate result. Never reformat a candidate to fit the 12-character pattern.

So the plan optimises for: a clean 30-company list with a specific source each, a pipeline that produces few RFCs with evidence, and a write-up that is honest about the hit rate.

## Step 0: probes before any design (15 min)

CLAUDE.md rule: tool behaviour is tested, not remembered. Three calls each, output pasted into `probes.md`. The design below assumes these pass; if one fails, that rung is replaced, not worked around.

| Probe | What it decides |
|---|---|
| INEGI DENUE API: `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/{condition}/{entidad}/{inicio}/{fin}/{token}` with a free token from inegi.org.mx | Can we pull companies by activity and state without scraping? Does the record carry `Razon_social` (legal name) separately from `Nombre` (trading name)? |
| GLEIF API: `https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=MX&filter[entity.legalName]=...` | Keyless? Does the Mexican record carry the RFC in `registeredAs` or an `otherEntityNames` field? |
| SAT bulk validator page `https://www.sat.gob.mx/aplicacion/79615` | What file format does it accept (the brief says RFC plus name pairs, up to 5,000)? Operator checks in a browser and pastes the format into `probes.md`. We only need the shape to build the file. |

Also probe one state transparency source and CompraNet search with `curl` to see whether they are server-rendered or JS shells. That decides whether Phase 2 rung 3 is a fetch or a SERP job.

## Phase 1: source the list (1 to 1.5 hours, mostly machine)

Target: 30 companies, so 25 survive QA. Six sectors from the brief. At least three states, aim for five: Ciudad de México, Nuevo León, Jalisco, Estado de México, Querétaro.

Rung 1, DENUE API (primary). Query by SCIAN activity code per sector, per state, filter to larger size bands (DENUE carries an employee-range field). Record for each: `Nombre`, `Razon_social`, SCIAN description, state, municipality, DENUE record id and URL. The DENUE URL is the checkable source.

SCIAN codes to query, confirm against the DENUE activity list at probe time:
- Construction: 2362 non-residential building construction
- MEP and maintenance: 2382 electrical, plumbing and HVAC installation; 5617 services to buildings
- Security: 5616 investigation and security services
- Cleaning and janitorial: 5617 (sub-codes for cleaning)
- Landscaping: 5617 landscaping sub-code
- Waste: 5621 waste collection, 5622 treatment
- Logistics: 4841 general freight trucking, 4931 warehousing

Rung 2, cross-check each candidate on one more source so the entry has two anchors: the company's own website or a trade association directory (CMIC for construction, AMESP for security, CANACAR for trucking). This also catches DENUE records that are dead or sole traders.

Rung 3, QA by a Haiku batch reader (the repo pattern, never regex): is this a real operating company, does it plausibly supply a facilities operation, is the sector right. Drop anything uncertain. Stratify the final 25 across sectors and states and show the counts in the explanation.

Output: `sourced.csv` with company, sector, state_city, source URL, legal_name_candidate, denue_id.

## Phase 2: resolve RFCs (2 to 2.5 hours, machine with operator at the end)

The pipeline is a cascade. Each rung records what it tried and what it found, per company, in `enrichment_log.jsonl`. A company stops at the first rung that yields an RFC with evidence.

Rung A, legal name anchor. From DENUE `Razon_social` where present. Where DENUE gives only the trading name, search the company site footer and legal notice page (Aviso de Privacidad pages almost always state the legal name and often the RFC). Record the legal name and its source. No RFC search starts without a legal name.

Rung B, GLEIF. Query by legal name, country MX. If an LEI record exists and carries an RFC, record it with the LEI record URL as source. Expect a handful at most; the brief says so.

Rung C, government and transparency sources, in this order, each a fetch or a SERP query with the exact legal name in quotes:
1. The company's own Aviso de Privacidad page (often has the RFC verbatim).
2. CompraNet and state procurement portals: supplier registries (padrón de proveedores) publish RFC alongside legal name. State padrones for CDMX, Nuevo León, Jalisco are public PDFs or tables.
3. Diario Oficial de la Federación and state gazettes: search exact legal name.
4. IMSS registered employer lists and SAT's own published lists (69-B lists are for non-compliant taxpayers, still a legitimate RFC source if the name matches exactly).
5. Public tender award documents (actas de fallo) which list winning bidders with RFC.

Rung D, match discipline. An RFC is accepted only if the legal name on the source matches the anchored legal name exactly after normalising case, accents, punctuation and the entity suffix (S.A. de C.V., S. de R.L. de C.V.). A fragment match, a similar name, or a different suffix is rejected and logged as `near_miss` with both names shown. Then a format check: 3 letters, 6 digits, 3 alphanumerics. A value that fails the format is never corrected; it is logged and marked NOT_FOUND.

Rung E, SAT bulk validation. Build `sat_upload.csv` in the format from the probe, RFC plus legal name pairs for every candidate. Operator uploads it in the browser, downloads the result, drops it in the run folder. A script merges the result back: `sat_validated` is Yes only for rows SAT returns as valid. Any RFC SAT rejects is downgraded to NOT_FOUND with the rejection recorded in `rfc_source(s)`, because the brief says a wrong RFC presented with confidence is worse than a gap.

Confidence label: high = SAT valid and source is a government or company primary page; medium = SAT valid but source is a secondary listing; low is not used for a delivered RFC. NOT_FOUND rows carry the rungs tried.

## Outputs

`results.csv`: company, sector, state_city, source, rfc, confidence, rfc_source(s), sat_validated. One row per sourced company, 25 to 30 rows.

`EXPLANATION.md`, under 600 words: sources used for Phase 1 and why; the cascade in Phase 2 with the hit count per rung; the honest coverage rate; where manual research was needed; the near-miss examples that the matching rule rejected; what would raise coverage at scale (paid registries, not more searching).

## Scripts (all in this run folder, after `.skill-check` exists)

- `denue_pull.py`: DENUE API by SCIAN and state, writes candidates.
- `qa_batches.py`: builds Haiku batch files for the fit read, repo pattern.
- `legal_name.py`: anchors legal names from DENUE plus site legal pages.
- `gleif_lookup.py`: GLEIF API by legal name.
- `rfc_search.py`: rung C fetches and SERP queries, writes evidence per company.
- `match_check.py`: name normalisation and exact-match gate, format check, near-miss log.
- `sat_file.py`: builds the upload file and merges the SAT result back.
- `assemble.py`: writes `results.csv` and the per-rung counts for the explanation.

Engine gaps found on the way go to `skills/icp-source-planner/IMPROVEMENTS.md`, not into run scripts.

## Gate

One approval on this plan, then it runs end to end. The only pause is the SAT upload. Expected shape of the result, stated now so nobody is surprised: 25 to 30 companies, RFCs found and validated on roughly 8 to 12 of them, the rest honest NOT_FOUND with the rungs logged. That is the result the brief says to expect.

## Phase 7 write-back

A source profile `skills/icp-source-planner/library/mx-denue-gleif-rfc--facilities-suppliers.md` recording what DENUE and GLEIF return, the SCIAN codes that worked, and which transparency sources carried RFCs. `clients/cabot-insights/STATE.md` updated at the end.
