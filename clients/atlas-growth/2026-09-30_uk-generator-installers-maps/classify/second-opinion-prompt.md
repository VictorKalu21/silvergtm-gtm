# STEP 5e — SECOND OPINION on contested fit verdicts (UK generator installers)

You are the second, stronger reader. A first pass (Haiku) classified 1,146 UK businesses with
`classify-prompt.md` (read it first — the rubric and the verdict table are unchanged). Its verdicts were
audited and found unreliable on the rows in your batch: it labelled online generator shops, a substation
contractor and a marine engineer `residential_generator`; it labelled firms whose text says "generator
installation" `not_generator`; it put a national standby-power installer in `hire_only`; and some of its
`why` lines are templated ("Home generator service") rather than quoted.

Read `<RUN>/classify/second/in/batch_<NNN>.jsonl`. Each line: `{place_id, name, city, google_types,
first_verdict, first_why, text}`. Re-judge EVERY row from `text` alone, ignoring `first_verdict` except as a
hint of what to double-check. Apply the rubric in `classify-prompt.md` strictly, with these clarifications:

- `residential_generator` needs BOTH (a) a quotable phrase showing the firm sells/installs/services
  standby, backup or home generators (permanent sets — not portable retail), AND (b) a homeowner /
  domestic / home / house / residential / farm-and-home word in the text. Domestic + commercial → keep.
  Quote the generator phrase in `why`, and name the domestic word.
- Generator sales/install/maintenance with NO domestic word anywhere → `commercial_only`.
- An ONLINE SHOP (basket, cart, "buy online", "free delivery", "shop by kVA") with no installation
  service → `small_engine_shop`. If it also states an installation/site-survey service → judge on that.
- Hire AND permanent install → not `hire_only`.
- Generator repair/parts/rewinds only (no sales/install) → `not_generator` unless it says it services
  generators for homes (then `residential_generator`, medium confidence).
- Substation / HV / switchgear / UPS / solar with no generator sales/install → `not_generator`.
- Plumbing/heating firms with no generator mention are `not_generator`, NOT `plumber_gas_only`
  (that label is only for a gas firm that mentions generator/LPG hookup without its own install service).

Write `<RUN>/classify/second/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line, every
place_id present, none added:
`[{"place_id":"…","business_type":"…","confidence":"high|medium","why":"≤20 words, quoting the text"}, …]`
Plain UTF-8, no BOM, written with the Write tool. Do the work YOURSELF: do NOT spawn, launch, or delegate
to other agents; do NOT use web search or fetch any URL. Reply with exactly one line: the counts per
business_type and how many verdicts you changed.
