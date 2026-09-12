# B2B + brand-match adjudication (read the page text, decide)

You are given ONE batch file: a JSON array of `{domain, company, prior_type, sig, text}`.
`text` is the pruned homepage (TITLE / META / BODY). Judge EACH entry from `text` only — do NOT fetch anything.

For each entry decide two things:

## 1. brand_match — does this page actually belong to `company`?
- `yes` — the page clearly is that company (brand name, or an unambiguous variant, appears in title/body; product matches).
- `no` — the page is a different company, a parked/for-sale page, a registrar, or clearly unrelated.
- `unsure` — too little text to tell (thin/JS-shell), or a generic/short brand name that could collide.

## 2. b2b_verdict — what kind of business is it?
- `b2b_operator` — a real company selling a PRODUCT or SERVICE primarily to other businesses (SaaS, platform, tooling, infra, B2B services with a product-like offering). **KEEP.**
- `agency` — marketing / creative / ad / branding / design / web-dev / SEO / PPC / lead-gen / social / content agency (sells done-for-you client services). DROP.
- `consultancy_si` — consultancy, advisory firm, systems integrator, IT-services shop. DROP.
- `freelancer_solo` — solo operator / freelancer / personal brand / coach / fractional-exec-for-hire / ghostwriter. DROP.
- `b2c_ecom` — sells primarily to consumers / DTC / ecommerce / retail. DROP.
- `not_a_company` — not a company at all (blog, portfolio, event, nonprofit-only, dead/placeholder). DROP.
- `unclear` — real business but the text doesn't say who it sells to. KEEP.

Judgment notes:
- Decide on what the site SELLS, not buzzwords. "Solutions & services" on a product SaaS site is still `b2b_operator`, not `agency` — an agency delivers bespoke client work; a product company sells a repeatable product. (This is the exact trap that mislabeled veriforce.com as agency.)
- A B2B company that also has a login/enterprise motion, "book a demo", API, pricing per seat → `b2b_operator`.
- `sig` (keyword counts b/c/a/prices) is a hint only — the page text is the truth.
- If `brand_match` is `no`, still give your best `b2b_verdict` for whatever the page actually is.

## Output
Write `<same-dir>/llmb-<GROUP>-out.json` — a JSON object keyed by each entry's `domain`:
```json
{
  "acme.com": {"brand_match":"yes","b2b_verdict":"b2b_operator","confidence":"high","reason":"SaaS platform, book-a-demo, per-seat pricing"},
  "foo.io":   {"brand_match":"no","b2b_verdict":"not_a_company","confidence":"high","reason":"domain-for-sale parking page"}
}
```
`reason` ≤ 10 words. Return ONLY a one-line summary (counts by b2b_verdict + brand_match no/unsure count) as your final message — the file you write is the real output.
