# Company screen — product-vs-services + vertical + size hint (homepage text, cheap model)

You are given a JSON array of companies: `{key, company, domain, homepage_title, homepage_text, jd_evidence, posting_title}`.
`homepage_text` is the first ~3,000 chars of the company's own homepage; `jd_evidence` is the sentence from
their job posting that names Terraform / CloudFormation / Bicep. Judge from the homepage text FIRST; the JD
is a hint only (a consultancy's JD reads exactly like a product company's).

## Decide, per company

`company_type` — one of:
- `product` — sells its own software / SaaS / tech-enabled product or platform to customers. **KEEP.**
- `services` — consultancy, agency, systems integrator, MSP, IT-services, staffing, outsourcing, nearshore dev shop,
  "we help you migrate to the cloud", certified-partner language, "our clients", case studies as the main proof. DROP.
- `regulated` — bank, lender, broker, insurer, asset manager, hedge fund, crypto exchange, payments licensed entity,
  defense contractor, government contractor, hospital / provider / payer. DROP.
- `unclear` — text is thin or ambiguous. KEEP, flag for eyeball.

`vertical` — 2-4 words (e.g. "AI customer support SaaS", "restaurant order integration", "sports team ops software").

`size_hint` — if the text states or strongly implies headcount ("team of 80", "1,000+ employees", "Fortune 500", "global offices in 12 countries") give a band from `1-50 | 51-500 | 500+ | unknown`. Do NOT guess from vibes; `unknown` is the honest default. Size is confirmed later by LinkedIn / Apollo.

`keep` — true when `company_type ∈ {product, unclear}` AND `size_hint != "500+"`.

`reason` ≤ 12 words, quoting a phrase from the homepage when possible.

## Bias
- A wrong drop loses a real lead; a wrong keep costs one LinkedIn look. Only drop on a CLEAR services / regulated read.
- "Platform" in marketing copy does not make a consultancy a product company — look for pricing, product names, "sign up", "free trial", integrations, docs, changelog.
- Fintech is `regulated` only when the company itself lends, holds funds, trades, or insures. A SaaS that sells software TO banks is `product` — but note it in `reason` so the user can apply the client's "sells into finance" call.

## Output
Write `screen.json` — a JSON object keyed by `key` (no BOM, no markdown fences):
```json
{ "ashby:decagon": {"company_type":"product","vertical":"AI customer support agents","size_hint":"unknown","keep":true,"reason":"'Book a demo', product pages, enterprise logos"},
  "lever:coderio":  {"company_type":"services","vertical":"nearshore dev shop","size_hint":"unknown","keep":false,"reason":"'we build software for our clients'"} }
```
Final chat message: one line — kept / dropped counts and the drop breakdown by `company_type`. The file is the output.
