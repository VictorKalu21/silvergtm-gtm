# QA of third Clay run: v7 prompt, Luna, same 10 rows, 2026-09-29

Same 10 rows as runs 1 (v5) and 2 (v6). Credits 0.2 to 0.3 per row, 2.3 total. Time 30 to 122 seconds.

## Verdicts across three runs

| Row | v5 | v6 | v7 | v7 verified | v7 verdict |
|---|---|---|---|---|---|
| tvsscs.com | no | no | no | Used the gov.uk Modern Slavery registry entry, loads | Correct, stable across all three. |
| jdplc.com | yes | yes | yes | Opened the FY26 annual report PDF directly, loads | Correct, stable. PDF search worked here. |
| st.co.uk | no | yes (Hemel warehouse) | no | Sysco results Jan 2026, GB MSS | Missed the Hemel Hempstead lease v6 found. Identity held, and the reasoning explicitly names the LinkedIn slug as the tie-breaker. |
| pepcogroup.eu | yes | yes | yes, medium | Strategic framework page verified: two-speed supply chain, two de-consolidation centres by FY28, DHL at Rawa Mazowiecka and Gyal. Page datePublished 2026-01-20 | Correct fact. Weaker source than v6 (a strategy page instead of the press release) and the date 2026-01-01 is a guess; the page metadata says 2026-01-20. |
| bromford-flagship.co.uk | yes, blog | yes, Find a Tender | no | Checked a different tender (professional services) and an outdated MSS page | Miss. Both the £1bn contractor Dynamic Market (v5) and the e-procurement tender (v6) are real and were not found this time. |
| clarionhg.com | no | no | no | All URLs load | Correct, stable. |
| evri.com | no | yes (BBC, Sep 2025) | yes, high | Press release verified: about £30m in automated sortation at Barnsley, 1.5m parcels a day by Christmas 2026, July 2026 | Correct and the best source of the three runs. |
| lidlcareers.co.uk | yes (waste) | no | no | BBC verified: £150m Leeds warehouse, published 2025-08-27 | Correct by the rule. The model found the strongest possible signal and excluded it because it is 33 days outside the window. That is the window working, and a policy question for the walkthrough. |
| morrisones.com | no, right company | no, wrong company (Louisiana) | no, right company | M Group MSS PDF loads | Fixed. Reasoning names M Group Energy. LinkedIn slug fix worked. |
| halfords.com | no | no | no | Landing page again | Still a likely miss, and worse: the reasoning says the CEO review, operating review and principal risks were reviewed, but the only URL opened is the landing page. The PDF search worked for JD and did not happen for Halfords. |

## URL check

18 distinct URLs. 18 load. 0 dead, 0 fabricated, 0 aggregators, 0 staging hosts.

## Error rate, v7

40 checks. Failures: Halfords found (1), Bromford found (1), Sysco found (1), Pepco date (1). 4 of 40, 10%.

## The honest picture across three runs

| | v5 | v6 | v7 |
|---|---|---|---|
| Signals found | 4 | 5 | 3 |
| Errors of 40 checks | 3 | 2 | 4 |
| Identity correct on the two hard rows | 2 of 2 | 1 of 2 | 2 of 2 |
| Dead or fabricated URLs | 0 | 0 | 0 |

The prompt changes did what they targeted: dates (v6), public tender sources (v6), the waste story (v6), dead-domain identity (v7). What the changes cannot fix is search variance. Sysco, Bromford and Evri each flipped between runs on the same press search with the same model, and the misses in v7 are all rows where a real signal exists and the search simply did not surface it this time. Halfords is the one row where all three runs failed the same way, and it is a tool limitation: the agent does not follow the PDF link from the Halfords landing page, and the direct PDF search that worked for JD did not fire.

## What to say in the walkthrough

- Sample of 10 rows, rerun three times across three prompt versions. Error rate 5 to 10 percent depending on the run. Zero hallucinated URLs in 57 citations.
- Four prompt fixes, each traced to a row, each verified to work on that row on the next run.
- Recall varies run to run by about two rows in ten because web search results vary. For a 14,000-row table that argues for running the column once and rerunning only rows that return "no" with fewer than three checked URLs, rather than rerunning everything.
- The 12-month window is a choice. Lidl's £150m warehouse, 33 days outside it, shows the cost of a hard cutoff. An 18-month window would have caught it; the tradeoff is staler signals.
- One row (Halfords) fails identically on every run because the tool will not open a specific PDF. The fix is a separate step, not more prompt text.

## Stop here

v7 is the final prompt. The remaining 15 rows should run on it once. No further prompt changes before the walkthrough.
