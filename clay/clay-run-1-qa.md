# QA of first Clay run: v5 prompt, Luna, 10 rows, 2026-09-29

Export: Clay table, 10 of 25 rows run. Columns returned: Signal Found, Signal Type, Summary, Reasoning, Source Url, Source Date, Confidence, URLS checked, credits, time.

## Cost and speed

| | |
|---|---|
| Credits per row | 0.2 to 0.3 |
| Total for 10 rows | 2.4 |
| Time per row | 53 to 168 seconds |
| Projected 14,000 rows, this column | about 3,400 credits |

Cheaper than the 0.4 estimate. Two to three Claygent tool calls per row.

## Results

| Row | Found | Type | Conf | Verified from here | Verdict |
|---|---|---|---|---|---|
| tvsscs.com | no | | high | 2 of 3 URLs 403 (bot block), MSS PDF loads | Correct. Group is Indian-listed; UK MSS routine. |
| jdplc.com | yes | structural_response | high | Page text matches: Outdoor DC consolidated from Grand Central into Middlewich, HY27 results 23 Sep 2026 | Correct. Different fact from the API run (Heerlen), both real. |
| st.co.uk | no | | high | All 3 URLs load. Found Sysco GB MSS Jan 2026 | Correct, and identity held: Sysco not STMicro. Excluded the Restaurant Depot acquisition correctly. |
| pepcogroup.eu | yes | structural_response | high | DHL page verified in an earlier run; blocks curl from this container | Correct fact, wrong date. Clay wrote 2026-04-05; the release is 4 May 2026. Day and month swapped. |
| bromford-flagship.co.uk | yes | structural_response | medium | Page verified: PME notice for a £1bn Dynamic Market for contractor services, 5 Jan 2026 | Correct. Source is a tender consultancy blog; the primary notice exists on Find a Tender and should have been cited at high. |
| clarionhg.com | no | | high | All 3 URLs load | Correct as far as checked. |
| evri.com | no | | high | All 3 URLs load | Defensible. Excluded DHL merger and Coll-8 acquisition correctly. Barnsley hub sortation automation is arguably structural_response; a strict reading says no. |
| lidlcareers.co.uk | yes | structural_response | medium | procurementmag.com returns 403 to every fetch from here | Borderline. Bakery demand planning cutting waste 30% is an inventory strategy change by the letter of the rule, but it is a waste story not a resilience story. Likely false positive by intent. Careers domain resolved to Lidl GB correctly. |
| morrisones.com | no | | high | All 3 URLs load | Correct, and the hard identity case passed: resolved to Morrison Energy Services under M Group Energy despite the description being Morrisons the grocer. |
| halfords.com | no | | high | All 3 URLs load | Likely false negative. The API run on the same prompt found dual sourcing, nearshore sourcing teams and UK safety stock in the FY26 annual report PDF. Clay's agent opened the annual report landing page, not the PDF, and saw only the summary. |

## URL check

20 distinct URLs cited. 16 load with 200. 3 return 403 to automated fetches (TVS twice, Procurement Magazine), all real pages behind bot protection. 1 (DHL) times out from this container but was verified earlier. 0 return 404. 0 fabricated. 0 aggregators as source. 0 staging hosts.

## Error rate

Four checks per row (found correct, URL loads, URL supports claim, date correct), 40 checks. Failures: Halfords found (1), Lidl found (1, counted against), Pepco date (1). 3 of 40, 7.5%. By row: 3 of 10 have an issue, 1 of them a clear miss.

## Fixes for v6

1. Annual report PDF. Add to research step 1: "If the results page is a landing page, open the annual report PDF itself and read the strategic report and principal risks sections." Halfords miss.
2. Date format. Add: "source_date is ISO YYYY-MM-DD. UK sources write day before month: 4 May 2026 is 2026-05-04." Pepco slip.
3. Public bodies. Add to research step 3: "For housing associations, NHS, rail and other public contracting authorities, also search Find a Tender and Contracts Finder by buyer name; a tender notice is a primary source at high confidence." Bromford upgrade.
4. Intent test for structural_response. Add: "An inventory or planning change counts only if the stated purpose is availability, continuity, lead time or supplier risk. Waste, cost or sustainability programmes do not count." Lidl.

## What to say in the walkthrough

Sample of 10, 3 with issues, 1 clear false negative, 0 hallucinated URLs, identity held on the two hardest rows in the list. Fixes 1 to 4 came directly from the sample.
