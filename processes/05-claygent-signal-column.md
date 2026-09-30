# 05 — Claygent signal column: define, prompt, dry-run, QA, improve

Build one Claygent research column that returns a yes/no buying signal per company with a verifiable source. Repeatable for any signal family. Proven on the Clay Trial Task 5 supply chain resilience column (worked example at the bottom).

## When to run it

You need a signal column in a Clay table: "does this company show X in the last N months, with a URL that proves it". One column per signal family. Do not start writing the prompt until step 1 is done.

## What we learned, in one paragraph

A cheap model can do the whole job in one Claygent pass if the prompt is narrow, the identity rule is explicit, and the definition excludes the things every company says. The prompt is not the main source of error once it is past v3; search variance is. The same prompt on the same rows flips two rows in ten between runs. Expect that, measure it, and design the QA sample and the rerun policy around it. Model choice matters more than prompt length: GPT 5.6 Luna at about 0.4 Claygent credits read pages and held identity where GPT 4.1 Mini defaulted to "no" and GPT 4.1 at 6.8 credits was no better. Every prompt change must trace to a row that failed, and be verified on that row on the next run.

## Steps

### 1. Define the signal before prompting (30 min)

Write three things on paper first. If you cannot, the column will not discriminate.

- **Sub-types.** Two to four concrete kinds of event. Each must be datable and citable. Name them with snake_case labels; they become the `signal_type` field.
- **The universal-noise list.** What does every company in the segment say that sounds like the signal but is not? For supply chain it was "resilient and sustainable supply chain" copy, a standing principal-risk line, and routine Modern Slavery statement progress. This list is where most of the false positives live.
- **The boundary with the other columns.** What belongs to a sibling signal (hiring, M&A) and must be excluded here.

Then map **where the evidence actually lives**, by company type. UK plcs: RNS via londonstockexchange.com or the investor results centre. All companies: gov.uk Modern Slavery statement registry. Public contracting authorities (housing associations, rail, NHS): Find a Tender and Contracts Finder. Private companies: Companies House filing list (readable) but not the PDFs. Vertical trade press by the Industry column. The prompt's research steps are this map, written as searches.

### 2. Write the prompt from the template (20 min)

Use `clay/claygent-supply-chain-resilience-v7.md` as the template. Keep every section; change only the signal-specific content.

| Section | Keep | Change |
|---|---|---|
| Inputs | Domain, Name, LinkedIn URL, Description | nothing |
| Identity rule | domain and name win, LinkedIn slug when the domain is dead, description is a hint | nothing |
| Signal definition | three sub-types, each with a "counts" and "does not count" | the content |
| Not a signal | universal-noise list, sibling-column exclusions, "services they sell" | the content |
| Research | numbered searches, PDF by direct search, public-body tender search | the search terms |
| Sources and confidence | primary high, named press medium, aggregators low, no staging hosts | nothing |
| Output | single JSON, fixed fields, 40-word summary, `checked` list, ISO date with UK example, empty fields on "no" | nothing |
| Examples | three good (two yes, one no), four bad with the reason | fictional companies, signal-specific facts |

Rules that came from failures and must not be dropped: examples use fictional domains (a real one gets copied verbatim); "no" is only allowed after the numbered searches; `checked` must not be empty; aggregators are capped at low not banned (banning does not stop citation, capping makes it visible).

### 3. Dry-run outside Clay on 6 rows (30 min, optional but cheap)

`clay/dryrun.py` runs the prompt through OpenAI's Responses API with web search. Pick six rows: two expected positives, two expected negatives, one broken-identity row, one borderline. It tests JSON discipline, identity and the "no when there is none" line. It does not test page reading well (the API search tool reads snippets) and it cannot be combined with JSON mode, so JSON has to come from the prompt. Treat it as a prompt lint, not a measurement. Skip it if the prompt is a clone of a proven one.

### 4. Run in Clay on 10 rows (15 min, ~2.5 credits)

Model: GPT 5.6 Luna. Include the hardest identity rows in the 10. Export the table to CSV as soon as it finishes.

### 5. QA the export (45 min)

Four checks per row, scored 1 or 0: found/not-found correct, source URL loads, page supports the summary, date correct and inside the window. Error rate = failed checks / (rows × 4). Do it in this order:

1. Fetch every cited URL with a browser user agent. 403 with the right domain is bot-blocking, not a dead link; 404 is a fabrication.
2. Grep the page text for the specific claim (a number, a place name, a date). PDFs: use a text extractor; if none works, mark unverified rather than assumed.
3. Read the `Reasoning` column on every "no". A "no" that lists documents it did not open is a lie the model tells to satisfy the search rule.
4. Write the QA note: row table, URL check counts, error rate, one line per failure naming the cause.

### 6. Fix only what a row proves (15 min)

One prompt change per failure cause, traceable to the row. Rerun the same 10 rows. A fix is verified only when the target row changes on the rerun. Stop when a full run has no failure that a prompt line can fix. Two or three rounds is the norm. Anything left is either search variance (rerun policy, not prompt) or a tool limit (separate column, not prompt).

### 7. Run the rest, then set the rerun policy

Run remaining rows once. Rerun only rows that returned "no" with fewer than three `checked` URLs. Do not rerun the whole table; the variance is in search results, and a second pass buys about two extra finds in ten at full cost.

## Cost model

Per row per column on Luna: 0.2 to 0.3 Claygent credits, 30 to 170 seconds. Three signal columns: about 0.8 credits per row. At 14,000 rows: about 11,000 credits for the three columns, plus the QA rerun tail. If credits bind, one gather Claygent feeding three cheap judge columns (AI columns, not Claygent) is about 0.7 per row; not needed for accuracy, only for cost.

## Worked example: supply chain resilience, Clay Trial Task 5, 2026-09-29

25 UK companies, 10-row QA sample rerun three times across prompt versions v5, v6, v7 (all in `clay/`). Full notes in `clay/clay-run-1-qa.md`, `-2-`, `-3-`.

| | v5 | v6 | v7 |
|---|---|---|---|
| Signals found (of 10) | 4 | 5 | 3 |
| Errors (of 40 checks) | 3 (7.5%) | 2 (5%) | 4 (10%) |
| Hard identity rows correct (of 2) | 2 | 1 | 2 |
| Dead or fabricated URLs (of 57 total citations) | 0 | 0 | 0 |
| Credits (10 rows) | 2.4 | 2.2 | 2.3 |

Fixes and what they did: ISO date with UK example (v6, fixed Pepco's swapped date); Find a Tender for public bodies (v6, Bromford went from a consultancy blog to a gov.uk notice); stated-aim test for inventory changes (v6, removed a Lidl waste story); LinkedIn slug identity fallback (v7, fixed Morrison Energy Services after its dead domain sent v6 to a Louisiana contractor); direct annual report PDF search (v7, worked for JD, never fired for Halfords across three runs, a tool limit).

Rows that flipped between runs on the same search with no relevant prompt change: Sysco (Hemel Hempstead warehouse lease), Bromford (two real tenders), Evri (three different real sources). That is the search variance the rerun policy exists for.

Model comparison on the API harness, same v3 prompt, six rows: GPT 4.1 Mini 0 of 2 true positives and identity failed; GPT 4.1 2 of 2 and identity passed at ~6.8 credits; GPT 5.6 Luna 2 of 2, identity passed, read 20k to 50k tokens per row at ~0.4 credits.
