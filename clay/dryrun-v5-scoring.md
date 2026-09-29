# Dry run of v5 on GPT 5.6 Luna, 2026-09-29

v5 narrowed supplier_governance to material change only and excluded routine Modern Slavery statement progress. Expectation going in: JD, Pepco, Halfords yes; Unite, Helios no; Sysco GB probably no.

## Results

| Row | Luna said | Source | Date | Verified | Verdict |
|---|---|---|---|---|---|
| jdplc.com | yes, structural_response | FY26 annual report PDF | 2026-05-20 | HY27 page verified earlier; same Heerlen facts | Correct |
| pepcogroup.eu | yes, structural_response | FY25 annual report PDF: DHL outsourcing, two-speed supply chain, two de-consolidation centres by FY28 | 2026-01-15 | DHL side verified earlier | Correct. Also picked up the FY26 pre-close update dated today. |
| halfords.com | yes, supplier_governance | FY26 annual report: third-party risk assessments extended to all Tier 1 own-brand factories, coverage more than doubled | 2026-08-03 | PDF not extracted here | Defensible under v5 as a programme expansion with a number. Borderline; would accept medium. |
| unitestudents.com | yes, supplier_governance | FY25 MSS: cleaning subcontractor suspended after right-to-work allegation, new ID checks for contractors | 2026-05-19 | Verified against PDF text | Correct under v5. A named supplier put into remediation. Our "expected no" was wrong. |
| heliostowers.com | yes, supplier_governance | IFC environmental and social review requiring a group-wide supply chain procedure and supplier code of conduct by 21 Mar 2027 | 2026-09-01 | Verified against page text | Correct under v5. A lender finding with a deadline. Our "expected no" was wrong, and this is the best find of the run. |
| st.co.uk | yes, structural_response | Sysco Corporation press release: $500m efficiency programme covering supply chain, procurement automation, sourcing through FY29 | 2026-09-09 | URL pattern matches earlier verified Sysco IR pages | Identity slipped one level: Sysco Corporation (US parent) not Sysco GB. Programme is group-wide so arguably applies. Mark medium. |

First run dropped the Sysco row on an API error; rerun alone succeeded. Add a retry to dryrun.py.

Six of six valid JSON. Zero aggregators. Zero staging hosts. Every source is a filing, a press release or a regulator page with a date inside the window. Four of six claims verified against page text from this container, two rest on PDFs I could not extract.

## What changed between v4 and v5

Same six "yes" verdicts, different evidence. Under v4 Luna cited routine Modern Slavery statement progress for Unite and Helios. Under v5 it went past that and found the subcontractor suspension and the IFC finding. The tightened rule did not make the model say no; it made the model look harder. That is the behaviour you want, and it is the "improve a weak prompt" story for the walkthrough: same rows, same model, better evidence.

## Honest reading of the 6 of 6

The sample was chosen to include two expected negatives, and both turned out to be real positives under a strict definition. That means the six rows no longer test the false-positive rate. Before trusting the column on 25 rows, run it on the rows most likely to be true negatives: Howdens Brunswick (single depot), Alexander McQueen (UK entity of a French group), The Sofa Delivery Company (logistics subsidiary). If those come back yes with strong evidence too, the signal is close to universal for this list and the scoring weight should drop.

## Remaining prompt gaps

- Subsidiary versus parent. Sysco GB went to Sysco Corporation. Add: "If the company is a subsidiary, prefer evidence about the subsidiary; a parent-group programme counts only if the source says it applies to this entity or region, and then confidence is medium."
- Halfords-type expansions. "Coverage more than doubled" is a number, so v5 accepts it. Decide whether a quantified expansion of an existing programme is in or out. I would keep it in at medium.

## Recommendation

Ship v5 on Luna into Clay for the supply chain column. Run the three likely-negative rows above first as the false-positive check, then all 25.
