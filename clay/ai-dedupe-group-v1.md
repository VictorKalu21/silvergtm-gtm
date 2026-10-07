# AI column prompt: dedupe and group (v1)

AI column, no web access, GPT 5.6 Luna or 4.1 Mini. Four inputs, all pre-gated by formula: a summary is blank when its signal is "no" or its source check failed. Dates, URLs and confidence are not passed; the note step pulls them from the original columns.

Inputs: `{{Firmographic Score}}`, `{{SC Summary}}`, `{{MA Summary}}`, `{{New Leadership}}`.

---

You are summarising what is known about one company for a sales note. You get up to three pieces of evidence and a maturity score. Decide which pieces describe the same event, label each remaining finding with a theme, and say what the maturity score means. Do not add anything you know about the company. Use only the text below.

Maturity score: {{Firmographic Score}} out of 10. What the score means:
- 0 to 2: too small to have a dedicated procurement or H&S function. Not a buyer today.
- 3 to 5: first dedicated roles exist; buys only under regulatory pressure.
- 6 to 7: formal procurement and compliance teams with budget. Core buyer.
- 8 to 10: group-level functions, thousands of suppliers, regulator-facing. Priority account.

Evidence:
Supply chain: {{SC Summary}}
M&A or restructuring: {{MA Summary}}
New leadership: {{New Leadership}}

STEPS
1. List each non-empty piece of evidence as a finding. New leadership is one finding per person named.
2. Merge findings that describe the same real-world event: the same deal, the same programme, the same site, or the same person. Keep one finding, keep the fuller wording, and list both origins. Two different events at the same company are not merged.
3. Give each finding one theme from this list only: ownership_change, cost_and_restructuring, network_investment, supplier_governance, leadership_change.
4. Write fit as one sentence from the maturity band, in plain English, without the number.

OUTPUT. Return one JSON object and nothing else. First character "{", last character "}".

{"fit":"","findings":[{"theme":"","summary":"","origins":["supply_chain|ma|leadership"],"merged":false}],"finding_count":0}

Rules: summary is the evidence wording, trimmed to one sentence, never embellished. If all three inputs are empty, findings is an empty list and finding_count is 0. Do not invent a finding from the maturity score.

EXAMPLES

Score 7. Supply chain: "In July 2026 the company invested about £30m in automated sortation at its Barnsley hub." M&A: "On 1 October 2025 the company completed its merger with a rival parcel network." Leadership: empty.
{"fit":"Formal procurement and compliance teams with budget; a core buyer.","findings":[{"theme":"network_investment","summary":"Invested about £30m in automated sortation at its Barnsley hub in July 2026.","origins":["supply_chain"],"merged":false},{"theme":"ownership_change","summary":"Completed its merger with a rival parcel network on 1 October 2025.","origins":["ma"],"merged":false}],"finding_count":2}

Score 8. Supply chain: "In May 2026 the group moved distribution for five sites to a new logistics partner." M&A: "In May 2026 the group outsourced its European distribution centre operations to a third-party logistics provider." Leadership: "Maria Lopez, Chief Procurement Officer".
{"fit":"Group-level functions and a large supplier base; a priority account.","findings":[{"theme":"network_investment","summary":"Moved distribution for five European sites to a new third-party logistics partner in May 2026.","origins":["supply_chain","ma"],"merged":true},{"theme":"leadership_change","summary":"Maria Lopez joined as Chief Procurement Officer.","origins":["leadership"],"merged":false}],"finding_count":2}

Score 2. All evidence empty.
{"fit":"Too small to have a dedicated procurement or H&S function; not a buyer today.","findings":[],"finding_count":0}
