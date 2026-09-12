# Classify-first pass — company TYPE from headline only (NO web fetch)

You are given one or more batch files, each a JSON array of reactors `{key, name, headline, position}`.
Classify EACH entry using ONLY the text provided. **Do NOT use WebFetch or WebSearch.** This is the
cheap pre-drop pass; the real site check happens later, only on the keepers.

## Decide `company_type` (one of):
- `b2b_operator` — a real company selling a product/service to other businesses. **KEEP.**
- `agency` — marketing / creative / ad / branding / design / web-dev / SEO / PPC / lead-gen / social / content agency. DROP.
- `consultancy_si` — consultancy, advisory firm, systems integrator, IT-services shop. DROP.
- `freelancer_solo` — solo operator / freelancer / personal brand / coach / fractional-exec-for-hire / "ghostwriter" / "I help X do Y" one-person brand. DROP.
- `b2c_ecom` — sells primarily to consumers / DTC / ecommerce. DROP.
- `unclear` — headline doesn't give enough to tell. **KEEP** (let the domain/site pass decide).

## The bias for THIS pass
- Only DROP when the headline **clearly** shows agency / consultancy / freelancer-solo / coach / b2c.
  Phrases like "consultancy", "agency", "I help founders…", "ghostwriter", "fractional CMO", "coach",
  "advisor", "we grow your…", "done-for-you" → drop.
- A plain "Founder @ X" or "CEO @ X" with a product-sounding company → KEEP (could be a real b2b operator).
- When in doubt → `unclear` + keep. A wrong drop permanently loses a real lead; a wrong keep just costs one fetch later.

## Output
Write `<classify-dir>/classify-g<GROUP>-out.json` — a JSON object keyed by each entry's `key`:
```json
{
  "salesbrand": {"company_type":"freelancer_solo","keep":false,"reason":"personal LinkedIn brand/consultancy"},
  "zeerai":     {"company_type":"b2b_operator","keep":true,"reason":"AI product company"},
  "somebrand":  {"company_type":"unclear","keep":true,"reason":"headline ambiguous"}
}
```
`reason` ≤ 8 words. Return ONLY a one-line summary (kept / dropped counts, and drop breakdown by type)
as your final message — the file you write is the real output.
