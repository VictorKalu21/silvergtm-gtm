# Dry run of M&A or restructuring v3 on GPT 5.6 Luna, same six rows, 2026-09-29

v3 added one line: restructuring must affect people, sites or an operating business; dormant entities, finance vehicles and holding companies do not count.

| Row | v1 | v2 | v3 | v3 verdict |
|---|---|---|---|---|
| evri.com | yes | yes | yes, acquirer, 1 Oct 2025 | Correct, stable across three runs. |
| bromford-flagship.co.uk | yes | yes | yes, acquirer, 29 Jan 2026, now also cites the LSE RNS | Correct, stable, best source yet. |
| st.co.uk | yes | no | yes, acquirer, Fairfax Meadow £54m | Correct. The v2 miss was search variance; back this run with a trade press corroboration. |
| southernhousing.org.uk | no | yes (dormant entity) | no | Correct. Explicitly rejected the Optivo Finance name change and a repairs transformation programme. The new line worked. |
| halfords.com | yes (cost line) | yes (programme) | yes, restructuring, 43 underperforming garages plus wholesale tyre closure | Correct and now quantified. |
| unitestudents.com | yes | yes | yes, acquirer, Empiric, 7,700 beds | Correct, stable, cites the HTML article rather than the PDF. |

6 of 6 correct against verified facts. JSON 6 of 6. Identity 6 of 6. 0 aggregators. One URL in a `checked` list (a Southern Housing strategic plan PDF, on the "no" row) returns 404; DHL blocks fetches from this container but was verified earlier. Every source_url loads.

v3 is final for M&A. Two prompt lines from two dry runs, each traced to one row and verified on the rerun. Run it in Clay on the same 10 QA rows as supply chain.
