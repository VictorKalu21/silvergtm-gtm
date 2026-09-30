# QA of M&A or restructuring v3 in Clay, all 25 rows, 2026-09-30

Model GPT 5.6 Luna. 14 yes (6 acquirer, 6 restructuring, 2 target), 11 no. 11 of 14 yes at high confidence, 3 medium.

## URL check, 14 source URLs

12 load. The Grocer returns 405 and Reuters 401 to automated fetches; both are paywalls or bot walls on real articles, not dead links. 0 dead, 0 fabricated, 0 aggregators.

## Claim checks

| Row | Verdict | Check |
|---|---|---|
| Howdens (both rows) | yes, acquirer, DIY Kitchens £390m | Verified on the company page. The depot row (howdens.com) correctly resolved to the group. Dedupe step will need to merge these two rows' findings. |
| GTR | yes, target, transfer into public ownership 31 May 2026 | Verified on gov.uk. Correct and a good example of the rule applied to a non-commercial ownership change. |
| Evri, Bromford, Unite | yes, acquirer | Verified in earlier runs, same sources. |
| Pepco | yes, restructuring, Dealz Poland sale | Company release, loads. Classified as restructuring (disposal of a brand); acquirer/target axis does not fit a seller, so the type is right. |
| HSS ProService | yes, restructuring, hire network sold to Endless, assets to Speedy | LSE final results, loads. Correct. |
| JD Sports | yes, restructuring, "about 175 Hibbett stores over three years" | **Claim not supported by the cited page.** The half-year results show Hibbett going from 982 to 962 stores (33 closures) and the figure 175 is the Eastern Europe store count in the same table. The reasoning says "contemporary reporting specifies" the 175 figure, meaning it came from a different page than the one cited. Store closures of smaller sites are real, so the verdict is defensible, but the summary states a number the source does not contain. This is exactly what the URL-check step must catch. |
| International Distribution Services | **no, but the reasoning says yes.** | The Reasoning column names two acquisitions inside the window (35% of ePost Global, 23 Jun 2026; Quadient UK locker network, 23 Sep 2026), argues with itself about the cutoff, and ends "the correct classification should be acquirer, not no signal". The structured fields say no. False negative with the evidence sitting in the same row. |
| Mannok | yes, target, Çimsa buys remaining 5.3% | Regional press, medium. Correct rating: real, but a minority top-up rather than a change of control. |
| Alexander McQueen | yes, restructuring, 60 of 180 Italian roles | Reuters, medium. Meets the floor (number of roles, union consultation). |
| TVS SCS | yes, restructuring, Project One with redundancy costs | Investor presentation PDF, loads. Meets the floor (named programme, redundancy costs). |
| Lidl GB | yes, restructuring, 130 HR roles in consultation | The Grocer, medium. Meets the floor. |
| Card Factory | no; Funky Pigeon completed 15 Aug 2025, outside window | Correct application of the window. |
| Halfords | no; wholesale tyre closure was FY25 | Correct, and consistent with the dry run's reservations about that row. |

## Error rate

25 rows, 4 checks each, 100 checks. Failures: JD claim support (1), IDS found (1). 2 of 100, 2%. Two rows with an issue out of 25.

## Two things worth saying in the walkthrough

1. IDS shows the model can reason its way to the right answer and still write the wrong field. A cheap consistency check (does `signal_found` agree with the last sentence of `Reasoning`?) would have caught it. That is a GPT column, one line, on the 11 "no" rows only.
2. JD shows the summary can carry a number from a page other than the one cited. The URL-check step needs to test the summary's specific claim against the cited page, not just that the page is about the right topic.

## Hiring column

The People Search column is empty on every row and Find Open Jobs returned "No Jobs Found" on the 10 rows it ran. Either the filters are too tight or the enrichments have not run. Check the title filter and the 90-day window on one large employer (JD Sports, 33,000 staff) before concluding there is nothing.
