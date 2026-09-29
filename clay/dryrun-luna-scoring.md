# Dry run of v3 and v4 on GPT 5.6 Luna, 2026-09-29

Same six rows. API id `gpt-5.6-luna`. In Clay: 0.1 AI credits, about 0.4 Claygent credits, against 1 for GPT 4.1 Mini and about 6.8 for GPT 4.1.

## Behaviour

Luna is a different animal from the 4.1 models in this harness. It made 2 to 7 search calls per row and used 23k to 51k tokens, so it actually read the pages it lists. Both 4.1 models made one call and used about 2k tokens. This is the first run where the `checked` field means something.

## Results, v3 and v4 (identical verdicts on both prompts)

| Row | Expected | Luna said | Source | URL loads | Claim verified | Notes |
|---|---|---|---|---|---|---|
| jdplc.com | yes | yes, structural_response | HY27 results, 23 Sep 2026 | 200 | yes, text on page matches | Six-day-old filing both 4.1 models missed. Heerlen automation, Menen wind-down. |
| pepcogroup.eu | yes | yes, structural_response | Pepco press release, 4 May 2026 | 403 to curl | yes, via DHL mirror in v2 run | Company site blocks bots. URL checker must handle this or it flags a true positive. |
| halfords.com | uncertain | yes: v3 supplier_governance from MSS 2025, v4 structural_response from FY26 annual report | 200 | PDF, not verified from here | v4 claim (dual sourcing, nearshore teams, safety stock) is a real signal if the text holds. v4 also listed a staging azurewebsites URL in checked, which is a leak of a non-public host. |
| unitestudents.com | no | yes, supplier_governance | FY25 MSS PDF, 15 May 2026 | 200 | PDF, not verified | Peak-season modern slavery audit, 37 suppliers trained. Meets category 3 as written. |
| heliostowers.com | no | yes, supplier_governance | MSS PDF dated 10 Mar 2026 (file named 2024) | 200 | PDF, not verified | 80% certification of high and medium risk third parties, pilot audits. Meets category 3 as written. |
| st.co.uk | Sysco GB | yes, supplier_governance | Sysco GB MSS, Jan 2026, on a brakeshosting.co.uk subdomain | TLS error from here | not verified | Identity solved cleanly, and it went to Sysco GB not Sysco Corp. The host is an odd CDN subdomain the URL checker will hate. |

JSON valid 6 of 6 on both prompts. Identity passed. Every positive has a primary source with a date inside the window. Zero aggregators cited.

## The real finding

Luna did not hallucinate the two "expected no" rows. It found real Modern Slavery statement content that satisfies category 3 as we wrote it. The problem is the definition: every UK company over £36m turnover publishes a statement every year, and every statement reports "progress" (a new audit, more training, a new KPI). Category 3 therefore fires on close to 100% of the list and carries no scoring information.

Two options:

1. Tighten supplier_governance to material changes only: a new third-party audit programme where none existed, a regulator or auditor finding, a named supplier terminated or remediated, a Procurement Act or CSDDD programme with a budget or headcount. Routine year-on-year progress in a Modern Slavery statement is explicitly not a signal.
2. Keep it but cap it at medium confidence and give it fewer points in the 40-point total.

Option 1 is right for a signal column. Option 2 hides the problem in the score.

## Model recommendation

Luna at about 0.4 Claygent credits. It out-performed GPT 4.1 at roughly a seventeenth of the cost on this sample, and it is the only cheap model that read pages, held identity, and found the two true positives. The gather-then-judge split is no longer needed to get accuracy out of a cheap model; it is still worth it if you want one research pass to feed all three signal columns.

Caveats for the walkthrough:
- Six rows. Two of the six "yes" verdicts depend on PDFs I could not text-extract here; confirm inside Clay.
- Luna listed a staging host once. Add "never cite a staging, preview or test hostname" to the source rule.
- Company sites that block bots (Pepco) and odd CDN hosts (Sysco GB) will fail a naive URL checker. The checker should fetch with a browser user agent and treat 403 with a matching domain as "loads, manual check" rather than "fail".

## v5 changes

- Rewrite category 3 per option 1 above.
- Add the staging-host rule.
- Re-run the six rows on Luna. Expected: JD yes, Pepco yes, Halfords yes on the annual report sourcing paragraph, Unite no, Helios no, Sysco GB no unless the Hemel Hempstead hub story qualifies as structural_response.
