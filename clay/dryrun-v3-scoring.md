# Dry run of v3 prompt, 2026-09-29

Same six rows as v2. Run with `OPENAI_API_KEY=placeholder python3 clay/dryrun.py <model> <csv> v3`. Raw output in `clay/dryrun_v3_<model>.json` (gitignored). Window start 2025-09-29.

Two harness findings first, because they change how to read everything below:

- **OpenAI refuses JSON mode together with web search** (`Web Search cannot be used with JSON mode`). So JSON discipline has to come from the prompt alone. In Clay, Claygent's JSON output setting does this for you, so this is the harder condition.
- **Every row used exactly one web search call and about 2,200 total tokens, on both models.** That token count means the model read search snippets, not the pages it lists in `checked`. The "run all three searches" instruction cannot be obeyed with OpenAI's search tool as wired here. Claygent does open pages, so this harness under-tests page reading and over-tests snippet reasoning. Treat found / not-found and identity as meaningful, and URL quality as indicative only.

## gpt-4.1-mini, v3

| Row | Expected | Said | Found | JSON | Identity | Notes |
|---|---|---|---|---|---|---|
| jdplc.com | yes | no | FAIL | ok | ok | Latest MSS (Sep 2026) not found. Checked list is plausible but one URL is a guess. |
| pepcogroup.eu | yes | no | FAIL | ok | ok | Regression from v2, which found the DHL five-DC expansion. |
| halfords.com | uncertain | no | ok | ok | ok | `source_date` filled with today's date on a "no". Field discipline slip. |
| unitestudents.com | no | no | ok | ok | ok | One checked URL is a 404 (annual-reports index). Fabricated. |
| heliostowers.com | no | no | ok | ok | ok | Cited stockanalysis.com transcript, an aggregator the prompt bans. |
| st.co.uk | Sysco | no | n/a | ok | FAIL | Still researched STMicroelectronics despite the identity rule. |

Score: 6 of 6 valid JSON (up from 3). 4 of 6 found correct (same as v2) but the two misses are now the two true positives. Identity still failed. The model treats "no" as the safe default once the prompt makes it easy to produce a compliant "no".

## gpt-4.1, v3

| Row | Expected | Said | Found | JSON | Identity | Notes |
|---|---|---|---|---|---|---|
| jdplc.com | yes | yes, supplier_governance | ok | ok | ok | Cited the 2024 MSS at a URL that 404s. The current MSS is Sep 2026 at jdplc.com/wp-content/uploads/2026/09/. Right verdict, stale and dead source. |
| pepcogroup.eu | yes | yes, structural_response | ok | ok | ok | DHL May 2026 press release, German-language URL. English version was verified in the v2 run. |
| halfords.com | uncertain | no | ok | ok | ok | Clean. Both checked URLs load. |
| unitestudents.com | no | no | ok | ok | ok | Clean. Both checked URLs load. |
| heliostowers.com | no | no | ok | ok | ok | Clean. All three checked URLs load. |
| st.co.uk | Sysco | no | ok | ok | ok | Identity rule worked. Went to Sysco Corporation US investor site rather than Sysco GB. Acceptable for a first pass. |

Score: 6 of 6 valid JSON, 6 of 6 found correct, identity passed. One dead URL and one stale date out of two positives.

## gpt-5-mini

Not run. The OpenAI organisation is not verified for that model. Verify at platform.openai.com if you want the comparison.

## Reading

1. The one-search behaviour is the tool, not the prompt. Both models made one call. Do not spend more prompt words on "search three times" for this harness; in Clay, test whether Claygent's own browsing does it.
2. v3's format fixes worked on both models. Keep them.
3. gpt-4.1-mini cannot hold identity or find true positives from snippets alone. gpt-4.1 can. Either run gpt-4.1 (check Clay's credit multiple), or run mini and accept a false-negative rate that this sample puts at 2 of 2 positives.
4. Source URL quality is the weak spot on the stronger model too. This is the argument for the separate URL-check column the task asks for: the Claygent finds, the checker verifies, and a dead or stale URL flags the row rather than passing.

## Proposed v4 (small)

- Add "source_date must be empty when signal_found is no" as an explicit line. Halfords slip.
- Add "the most recent Modern Slavery statement means the latest one published; if you find one older than 18 months, search for a newer one before citing it." JD slip.
- Move the aggregator list to the CONFIDENCE line so a cited aggregator is forced to low, not banned outright. Banning did not stop mini citing stockanalysis.com; capping confidence at least makes the row visible.
- Otherwise leave v3 as is and take it into Clay.
