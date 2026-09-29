# QA of second Clay run: v6 prompt, Luna, same 10 rows, 2026-09-29

Same 10 rows as run 1 (v5). This is the before-and-after for the "improve your weakest column" question.

## Cost

Credits per row 0.2 to 0.3, total 2.2 for 10 rows. Time 40 to 120 seconds. Same as v5.

## Row by row, v5 to v6

| Row | v5 | v6 | Verified | Verdict on v6 |
|---|---|---|---|---|
| tvsscs.com | no | no | Investor page 403 to bots; consistent | Correct. v6 explicitly excluded a Caterpillar customer warehouse as a service sold, which is the exclusion rule working. |
| jdplc.com | yes, Middlewich | yes, Heerlen and Middlewich | Page verified in run 1 | Correct, stable. |
| st.co.uk | no | yes, structural_response, medium | bdaily article verified: Sysco signed a 25-year lease on the 479,000 sq ft Hemel 465 warehouse, 12 Jan 2026 | Correct. v5 missed a real distribution centre signal; v6 found it via press search. Identity held again. |
| pepcogroup.eu | yes, date 2026-04-05 | yes, date 2026-05-04, own press release | URL loads | Correct. Date fix worked and the source upgraded from DHL's site to Pepco's own. |
| bromford-flagship.co.uk | yes, consultancy blog, medium | yes, Find a Tender notice, high | Notice verified: BFL planned procurement for an e-procurement and contract management system, published 21 Aug 2026 | Correct. Public-body source fix worked. Different fact from v5 (the £1bn contractor Dynamic Market) and arguably weaker; both are real. |
| clarionhg.com | no | no | Opened the annual report PDF and MSS PDF directly from cdn.clarionhg.com, plus a Find a Tender notice | Correct, and proof that Claygent can read PDFs when the search result links straight to one. |
| evri.com | no | yes, structural_response, medium | BBC verified: £29m Barnsley hub expansion, published 2025-09-29, exactly the window start | Correct by the rule. v5 missed it. Date is on the boundary; one day earlier and it drops out, which is fine and shows the window works. |
| lidlcareers.co.uk | yes, bakery waste | no | Lidl corporate MSS pages load | Correct. The stated-aim test removed the waste story. Also possible v6 simply did not surface the Procurement Magazine article; either way the outcome is right. |
| morrisones.com | no, resolved to M Group Energy | no, resolved to Chet Morrison Contractors, Louisiana | morrisones.com serves a TLS certificate for a different host, so the domain itself is unreadable | Regression on identity. Same verdict, wrong company. The domain gives the model nothing, the description is about Morrisons the grocer, and the name is ambiguous. v5 got lucky. |
| halfords.com | no | no | Landing page again, plus the prelim results RNS and the MSS page | Still a likely false negative. The PDF instruction did not change behaviour: the agent opened the annual report landing page, not the PDF. Clarion shows the tool reads PDFs when a search result points at one, so the gap is finding the PDF link, not reading it. |

## URL check

19 distinct URLs cited. 17 load. 1 is 403 to bots (TVS), 1 is the unreadable morrisones.com domain itself, which the agent did not cite. 0 dead, 0 fabricated, 0 aggregators, 0 staging hosts.

## Error rate

40 checks. Failures: Halfords found (1), Morrison identity (1, verdict happens to be right but the research was of the wrong company). 2 of 40, 5%, down from 7.5% on v5. Signals found rose from 4 to 5 of 10, and two of the v5 positives were replaced by stronger evidence.

## What the fixes did

| Fix | Result |
|---|---|
| ISO date with UK example | Worked. Pepco date correct. |
| Find a Tender for public bodies | Worked. Bromford cited the gov.uk notice at high. Clarion also checked a notice. |
| Stated-aim test for inventory changes | Worked or moot. Lidl dropped. |
| Open the annual report PDF | Did not work for Halfords. Agent still reads the landing page. |

## Two things v7 should change

1. Identity when the domain is dead. Add the LinkedIn slug as a fourth identity input: "LinkedIn: {{LinkedIn URL}}. If the domain does not load, the LinkedIn company slug is the identity anchor." morrisones.com is unreadable, and the slug is morrison-energy-services. This is the one place the LinkedIn column earns its keep in this prompt.
2. PDF discovery. Replace the landing-page sentence with a search instruction: "Search for '{{Company Name}} annual report 2026 pdf' and open the PDF result directly." The tool reads PDFs it is pointed at (Clarion); it does not follow a PDF link from a landing page (Halfords, twice).

## Run-to-run variance

Three rows changed verdict between runs on prompts that differ by five lines: Sysco, Evri, Lidl. Only Lidl is clearly attributable to a prompt change. Sysco and Evri were missed by v5 and found by v6 through the same press search, which points at search-result variance rather than prompt effect. Worth saying in the walkthrough: a single run is not a measurement, and the QA sample should be rerun once before trusting a per-row verdict.
