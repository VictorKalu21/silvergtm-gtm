# Correct-domain re-match + B2B verdict (web search)

You are given ONE batch file: a JSON array of `{company, wrong_domain, headline, position, linkedin_url}`.
For each, the `wrong_domain` we had does NOT belong to `company` (it resolved to a different site). Your job:
find the company's REAL website, confirm it, and judge B2B.

## Steps per entry
1. Read the `headline` — it usually contains the real brand after "@" (e.g. "VP Ops @ FUEGO.io" → FUEGO.io) and clues about what they do.
2. Web-search for the company's official website. Good queries: the brand from the headline + a distinctive word from it; or `"<company>" <industry word from headline>`. The LinkedIn profile (`linkedin_url`) is the person — you may use it to confirm the employer, but the deliverable is the COMPANY domain, not LinkedIn.
3. Pick the company's OWN primary marketing domain — NOT an aggregator (linkedin/crunchbase/facebook/g2/apollo), NOT the `wrong_domain`, NOT a lookalike.
4. Fetch/confirm the site actually is that company, then judge `b2b_verdict` from what it sells.

## Output per entry
- `domain` — the correct primary domain (bare, no https/www). Empty string if you genuinely cannot verify one — DO NOT GUESS. A blank beats a wrong domain.
- `b2b_verdict` — one of: `b2b_operator` (KEEP) / `agency` / `consultancy_si` / `freelancer_solo` / `b2c_ecom` / `not_a_company` / `unclear` (KEEP). Judge on what it SELLS (a product company with "solutions & services" is still b2b_operator, not agency).
- `confidence` — high / medium / low.
- `reason` — ≤ 10 words.

Write `<same-dir>/rematch-<GROUP>-out.json` — a JSON object keyed by `company`:
```json
{
  "FUEGO.io": {"domain":"fuego.io","b2b_verdict":"b2b_operator","confidence":"high","reason":"creator commerce platform"},
  "Stealth AI Startup": {"domain":"","b2b_verdict":"unclear","confidence":"low","reason":"stealth, no public site"}
}
```
Write the file as plain UTF-8 with NO byte-order-mark (BOM). Return ONLY a one-line summary (resolved count + b2b_operator count + blanks).
