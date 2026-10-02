# AI column prompt: CRM note (v1)

AI column, no web access, cheapest model. Renders the dedupe output as a short HTML note. Dates and URLs come from the original signal columns and are attached by origin, since the dedupe step did not carry them.

Inputs: `{{Company Name}}`, `{{Total Score}}`, `{{Findings JSON}}` (the whole dedupe output cell), `{{SC Source Url}}`, `{{SC Source Date}}`, `{{MA Source Url}}`, `{{MA Source Date}}`, `{{today}}`.

At 14,000 rows this is a JavaScript formula, not an AI column. The structure is fixed and the inputs are structured.

---

Format the findings below as a short HTML note for a CRM company record. Output only HTML. No markdown, no commentary, no code fences, no styles, no scripts. Use only the text given. Do not add, reword or reorder facts.

Company: {{Company Name}}
Total score: {{Total Score}} out of 40
Date: {{today}}
Findings: {{Findings JSON}}
Supply chain source: {{SC Source Url}} dated {{SC Source Date}}
M&A source: {{MA Source Url}} dated {{MA Source Date}}

STRUCTURE

<div>
<p><strong>{{Company Name}}</strong> · Signal score {{Total Score}}/40 · {{today}}</p>
one <h4> per theme that has at least one finding, in this order and with these headings:
  account_maturity → Account maturity
  supply_chain → Supply chain
  ma_restructuring → M&amp;A or restructuring
  hiring_leadership → Hiring and leadership
under each <h4>, a <ul> with one <li> per finding
</div>

RULES FOR EACH <li>
- Text is the finding's summary, unchanged.
- If origins contains "supply_chain", append: <a href="SC URL">source</a> and the supply chain date.
- If origins contains "ma", append: <a href="MA URL">source</a> and the M&A date. A finding with both origins gets both links.
- If origins is "leadership" or "jobs", append "(LinkedIn, via enrichment)". No link.
- If origins is "firmographic", no source and no date.
- If merged is true, append "(two signals merged)".
- If a URL input is empty, omit the link rather than inventing one.

If the dropped list is non-empty, add after the last section: <p><em>One or more findings withheld: source check failed.</em></p>

If findings contains only the account_maturity entry, the note is the header line, the Account maturity section, and one line: <p>No verified signals in the last 12 months.</p>

EXAMPLE

Company: Example Parcels. Total score: 27. Date: 2026-10-02. Findings: {"findings":[{"theme":"account_maturity","summary":"Formal procurement and compliance teams with budget; a core buyer.","origins":["firmographic"],"merged":false},{"theme":"supply_chain","summary":"Invested about £30m in automated sortation at its Barnsley hub in July 2026.","origins":["supply_chain"],"merged":false},{"theme":"ma_restructuring","summary":"Completed its merger with a rival parcel network on 1 October 2025.","origins":["ma"],"merged":false}],"dropped":[],"finding_count":2}. Supply chain source: https://www.example-parcels.co.uk/press/results dated 2026-07-13. M&A source: https://www.example-parcels.co.uk/press/merger dated 2025-10-01.

<div>
<p><strong>Example Parcels</strong> · Signal score 27/40 · 2026-10-02</p>
<h4>Account maturity</h4>
<ul><li>Formal procurement and compliance teams with budget; a core buyer.</li></ul>
<h4>Supply chain</h4>
<ul><li>Invested about £30m in automated sortation at its Barnsley hub in July 2026. <a href="https://www.example-parcels.co.uk/press/results">source</a>, 2026-07-13</li></ul>
<h4>M&amp;A or restructuring</h4>
<ul><li>Completed its merger with a rival parcel network on 1 October 2025. <a href="https://www.example-parcels.co.uk/press/merger">source</a>, 2025-10-01</li></ul>
</div>
