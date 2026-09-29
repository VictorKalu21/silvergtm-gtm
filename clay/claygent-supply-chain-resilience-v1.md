# Claygent prompt: Supply chain resilience signal (v1)

Paste the block under **Prompt** into a Claygent column. Map the inputs at the top to your table columns. Set the output to JSON with the fields listed under **Output schema** so Clay can split them into columns.

Inputs used: `{{Company Name}}`, `{{Company Domain}}`, `{{Company Description}}`, `{{Industry}}`

---

## Prompt

You are a B2B research analyst. Find out whether this company shows a **supply chain resilience signal** in the last 18 months (since March 2025). Today is {{today}}.

Company name: {{Company Name}}
Domain: {{Company Domain}}
Description: {{Company Description}}
Industry: {{Industry}}

IDENTITY RULE: The company is the one that operates the domain and matches the description. If the name conflicts with the domain or description, trust the domain and description and ignore the name. If the domain is a single depot, careers site, or brand page of a larger group, research the parent operating company and say so in the summary.

WHAT COUNTS AS A SIGNAL (any one of these, dated within the last 18 months):

1. Disruption or exposure. A named supplier failure or insolvency, stock or component shortage, freight, port or shipping disruption, tariff impact on inputs, supplier cyber incident, or product recall traced to a supplier, that the company itself reported or that was reported about the company specifically.
2. Structural response. Nearshoring or reshoring, supplier diversification or dual sourcing, a new distribution centre or warehouse opening, an inventory or stockholding strategy change, supplier consolidation, or a named procurement or supply chain transformation programme.
3. Supplier governance. A new or expanded supplier audit or due diligence programme, a Modern Slavery statement describing material changes to supplier controls, supplier due diligence for Scope 3 or sustainability regulation, Procurement Act 2023 readiness work, or a regulator or auditor finding about the company's sourcing or suppliers.

WHAT DOES NOT COUNT:
- Generic statements that the company has a "resilient", "robust", "sustainable" or "responsible" supply chain with no specific event, programme, date or number behind them.
- A standing "supply chain" line in an annual report principal risks table with no change or event described.
- Anything dated before March 2025, or undated.
- Hiring, new leaders or job adverts (covered by another column).
- Mergers, acquisitions, disposals or restructuring (covered by another column).
- Supply chain services the company sells to customers. Only the company's own sourcing and supply base counts.

HOW TO RESEARCH:
- Search the company's own newsroom, investor or RNS announcements, latest annual report, and Modern Slavery statement first. Then search UK national and trade press.
- Prefer one strong, specific source over several weak ones. Open the page and confirm it says what you are claiming before you cite it.
- If you find nothing that meets the rules above, return signal_found "no". Do not guess and do not stretch a weak mention to fit.

CONFIDENCE RULE:
- high: annual report, RNS or stock exchange announcement, gov.uk, HSE, Companies House, or the company's own press release, with a clear date.
- medium: a named national newspaper or trade publication article naming the company.
- low: a blog, aggregator, third party summary, or a company page with no date.
- If signal_found is "no", confidence describes how thoroughly you searched: high if you checked newsroom, annual report and press; low if you could only check one of them.

OUTPUT: return only this JSON, nothing else.

{
  "signal_found": "yes" or "no",
  "signal_type": one of "disruption", "structural_response", "supplier_governance", or "none",
  "summary": two sentences maximum. Sentence one: what happened and when. Sentence two: why it matters for this company's supply chain. If no signal, write "No supply chain resilience signal found in the last 18 months." and name what you checked.
  "source_url": the exact URL of the single page that best supports the claim, or "" if no signal,
  "source_date": the publication date of that page as YYYY-MM-DD, or "" if none,
  "confidence": "high", "medium" or "low"
}

---

## Output schema (for Clay's JSON output settings)

| Field | Type | Values |
|---|---|---|
| signal_found | string | yes, no |
| signal_type | string | disruption, structural_response, supplier_governance, none |
| summary | string | max 2 sentences |
| source_url | string | full URL or empty |
| source_date | string | YYYY-MM-DD or empty |
| confidence | string | high, medium, low |

`signal_type` is one extra field beyond the five the task asks for. Keep it, since the dedupe and grouping column downstream needs it, and it gives you a cheap check on whether the model is stretching category 3.

## Dry run rows and what a correct answer looks like

| Row | Expect | Why it is in the sample |
|---|---|---|
| jdplc.com JD Sports | likely yes | Tariffs and Asian sourcing feature in trading updates. Tests category 1. |
| pepcogroup.eu Pepco | likely yes | Pepco Global Sourcing and Asian sourcing offices. Tests category 2. |
| halfords.com Halfords | uncertain | Bike and parts supply. Tests whether the model stretches a weak mention. |
| unitestudents.com Unite Students | likely no | Student housing. A yes here is a hallucination. |
| heliostowers.com Helios Towers | likely no for UK sourcing | Tests the "services they sell do not count" rule. |
| st.co.uk labelled Sysco | messy | Tests the identity rule. Should research Sysco GB, not STMicro. |

Score each row on four checks: found or not-found correct, URL loads, URL supports the summary, date present and within window. Error rate is failed checks over total checks.

## Known gaps to fix in v2 if the dry run shows them

- Model returns yes on a boilerplate annual report line: tighten the "does not count" list with the exact phrase it fell for.
- Model cites a search results page or PDF that will not load: add "do not cite search result pages; cite the article or filing itself, and prefer HTML over PDF where both exist."
- Model returns old news: move the date rule to the first line and repeat it in the output instructions.
- Summary runs long: cap at 40 words instead of two sentences.
