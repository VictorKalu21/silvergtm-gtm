# Dry run of v2 prompt, gpt-4.1-mini, 2026-09-29

Run: `python3 clay/dryrun.py gpt-4.1-mini` against the Clay export (Tier-1 scoring view). Raw output is in `clay/dryrun_v2_gpt-4.1-mini.json` locally (JSON is gitignored); the table below reproduces it. Expected answers from the v1 dry-run table. Window is 2025-09-29 to 2026-09-29.

Every row used exactly one web search. Checks are the four from v1 (found/not-found correct, URL loads, URL supports summary, date present and in window) plus a fifth, valid JSON, because half the rows broke it.

| Row | Expected | Model said | Found correct | JSON | URL loads | URL supports | Date | Notes |
|---|---|---|---|---|---|---|---|---|
| jdplc.com | likely yes | no | FAIL | ok | n/a | n/a | n/a | False negative. Interim results 24 Sep 2025 report sourcing diversification for tariffs and the new Heerlen DC; FY26 results (May 2026) sit inside the window. Summary is the good-example "no" text pasted verbatim, so the "checked newsroom, annual report and MSS" claim is invented after one search. |
| pepcogroup.eu | likely yes | yes, structural_response (prose) | ok | FAIL | RTE 200, pepcogroup.eu 403 to curl but corroborated by DHL press release 4 May 2026 | ok | ok, 2026-05-04 and 2026-09-21 | Right answer, real sources (DHL running five DCs, new Gdansk DC), but returned as paragraphs with citations, not JSON. Clay would get an unparseable cell. |
| halfords.com | uncertain | no (prose) | ok, defensible | FAIL | halfordscompany.com 200, financialfilings.com 403 | ok | n/a | Correctly refused to stretch "tariffs may affect our supply chain" into a signal. Cited an aggregator (financialfilings.com) for the annual report instead of the company site. |
| unitestudents.com | likely no | no (prose) | ok | FAIL | 200 (real FY25 MSS PDF) | ok | n/a | Correct and honest, but prose again. |
| heliostowers.com | likely no | no | ok | ok | n/a | n/a | n/a | Correct. Summary is the example text verbatim ("FY25 annual report ... standing principal risk"), so the check list is not evidence of a check. |
| st.co.uk | Sysco GB | yes, STMicroelectronics MCU shortage | FAIL | ok | 200 | ok for STMicro | 2026-03-01 looks rounded | Exactly the bad example from the prompt. Description in the CSV is the STMicro blurb, Company Name is "Sysco"; model followed the description. Source is supplygraph.ai, an aggregator, rated "high". Sysco GB does have a candidate signal (new £79m Hemel Hempstead super hub, structural_response). |

Score: 4 of 6 found/not-found correct, 3 of 6 valid JSON, 0 of 1 identity test passed. Counting the 14 applicable checks, 5 failed, error rate 36%.

## What went wrong, in order of damage

1. **JSON breaks whenever the search tool returns citations.** Rows with inline citations came back as prose with `([site](url))` markers and a "Highlights" footer. Rows without citations were fine. The instruction "return only this JSON" is not enough for this model.
2. **One search per row, then a confident "no" with a copied checklist.** The good "no" example is being pasted, not produced, so the summary lies about what was checked. JD Sports was missed for this reason.
3. **Identity rule lost to the description.** The v2 prompt says to use domain and description together and ignore similar names. When the description itself is the wrong company, the model has no tie-breaker. The Company Name column, dropped in v2, is that tie-breaker.
4. **Aggregators cited and graded high.** supplygraph.ai and financialfilings.com were treated as primary sources. Both are paywalled or block scrapers and neither is the filing.
5. **Window edge.** JD's strongest recent filing is 24 Sep 2025, five days outside a 12-month window measured from today. A prompt that names the cutoff date explicitly would have let the model use the May 2026 FY26 results instead of giving up.

## Proposed v3 changes

Drafted in `clay/claygent-supply-chain-resilience-v3.md`.

- Bring back `{{Company Name}}` as a third input and make the identity rule explicit: domain and name win, description is a hint and is ignored when it contradicts them. Add the st.co.uk case as the worked example.
- Replace "Research: check the newsroom, RNS..." with a numbered minimum: three named searches (results or RNS, Modern Slavery statement, supply chain or sourcing or tariff or distribution centre news), each with the company name and the current year. A "no" is only allowed after all three.
- Add a `checked` field, a list of up to three URLs actually opened. A "no" with an empty `checked` is invalid. This removes the copied-checklist problem and gives Clay something auditable.
- Compute and print the window start date in the prompt (`{{window_start}}`), not just "last 12 months".
- Source rules: cite the filing or article itself, never a search result page or aggregator (name supplygraph, financialfilings, marketscreener, Trademo as examples), strip tracking parameters, prefer HTML over PDF. Aggregator or third-party summary is capped at low confidence.
- Output rules: first character `{`, last character `}`, no markdown, no citations outside the JSON, summary capped at 40 words. Move the date rule next to the output block.
- In dryrun.py, request structured JSON output from the Responses API and pass the name and window start, so the harness matches what Clay's JSON output mode will do. Then rerun with gpt-4.1-mini and a stronger model (gpt-4.1 or a reasoning model) to see whether the one-search behaviour is the model or the prompt.
