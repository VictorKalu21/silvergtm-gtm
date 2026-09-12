# 04 · Qualify Reactors → B2B-Verified, Contactable Lead List

**Outcome:** a raw export of people who *engaged* a vendor's content (LinkedIn post reactors, commenters, followers) turned into a list of **real B2B companies you can sell to** — each with its correct website domain AND the specific person to contact — with the vendor's **current customers subtracted**.

**Trigger logic:** engagement with a vendor's founder content is a soft intent signal. The engaged audience of a competitor is a ready-made displacement target — *minus* the people already paying that competitor. But a raw reactor export is mostly noise: freelancers, agencies, coaches, consumers, and "companies" that are personal brands. The value is the qualification, not the scrape.

**When to run:** you have a reactor / commenter / follower / attendee export and want qualified outbound leads from it — especially a competitor-audience displacement play. Not for a clean firmographic list (that's just domain-enrich → Apollo) and not when you only need people at one known company (Apollo people-pull).

Automated by the **`qualify-reactors`** skill (config-driven engine); this SOP is the human-readable process.

---

## Inputs

- A raw people export with, at minimum: name, LinkedIn URL, headline, position, company name.
- The vendor's **current-customer domain list** to subtract (e.g. from their pixel/customer table).
- A `config.json` (copy `qualify-reactors/config.example.json`) naming the columns + files + `keep_verdicts`.

## Pipeline

```
raw export → role-qualify → headline-only cheap drop → free domain resolve
  → free HTTP fetch + heuristic triage → cheap-LLM B2B + brand-match verdict
  → free Scrapling recovery of blocked → person join + customer subtraction
  → web-search re-match of wrong domains → final CSV
```

### Step 1 — Role-qualify (cheap, upstream)
Filter the raw export on title/headline: keep founders/decision-makers, drop obvious fractional-exec-for-hire and one-person agencies. Declare the rule in config.

### Step 2 — Classify-first cheap drop (headline only, NO fetch)
An LLM pass over the headline *text alone* (`references/classify-prompt.md`) that drops the obvious agency / consultancy / freelancer / B2C and **keeps** `b2b_operator` + `unclear`. Bias to keep — a wrong drop permanently loses a real lead; a wrong keep just costs one fetch later.

### Step 3 — Resolve domains (free-first)
Free guess-and-verify resolver (the `name-to-domain` Tier-0.5 script): derive a brand slug, try common domain patterns, fetch, and **accept only if the brand token appears in the fetched page/title**. LLM/web pass on the residual. Never domain-guess without the brand-in-page verify.

### Step 4 — Fetch + heuristic triage (free)
`scripts/fetch-triage.mjs` fetches each homepage and buckets on keyword signals: `b2b / b2b_weak / ambiguous / agency / b2c / thin / blocked / dead`. **The heuristic is only a router**, not the verdict — it mislabels product SaaS with "solutions & services" as agency. Its job is to separate has-real-content from dead/blocked/thin so the LLM only reads what's worth reading.

### Step 5 — Capture text
`scripts/fetch-text.mjs` re-fetches the content-bearing rows and saves pruned page text (`pages.jsonl`).

### Step 6 — B2B + brand-match adjudication (the real verdict)
Split `pages.jsonl` into ~30-row batches; one Haiku subagent per batch with `references/b2b-llm-prompt.md`. Each returns per domain: `brand_match` (does the page belong to this company?), `b2b_verdict`, `confidence`, `reason`. This LLM read **is** the B2B answer; `brand_match` also catches guessed/wrong domains.

### Step 7 — Recover the Cloudflare-blocked (free before paid)
`scripts/scrapling-blocked.py` runs Scrapling `StealthyFetcher(solve_cloudflare=True)` on the `blocked` bucket — a FREE anti-bot rung that recovers ~75–80%. Only the persistent 403/Imperva residual justifies Firecrawl. Adjudicate the recovered pages like Step 6.

### Step 8 — Assemble: join the person, subtract the customers
`scripts/assemble.mjs`: keep rows whose verdict ∈ `keep_verdicts` **and** `brand_match != no`; **join the prospect** back in by matching the reactor `headline` to the original export (headline is near-unique per person); **subtract** the vendor's current-customer domains.

### Step 9 — Re-match the wrong-domain companies
Rows flagged `brand_match=no` are real companies pointed at the wrong site. Feed them to web-search subagents (`references/rematch-prompt.md`) — each finds the company's REAL domain (from the headline `@brand` + the person's LinkedIn), confirms it, and re-judges B2B in one pass. Fold the keepers back in.

## Scripts
- `qualify-reactors/scripts/fetch-triage.mjs` — Step 4 (free fetch + heuristic bucket).
- `qualify-reactors/scripts/fetch-text.mjs` — Step 5 (prune page text for the LLM).
- `qualify-reactors/scripts/scrapling-blocked.py` — Step 7 (free Cloudflare recovery).
- `qualify-reactors/scripts/assemble.mjs` — Step 8 (keep-logic + person join + customer subtract).
- Steps 2/6/9 = LLM subagents driven by the `references/*-prompt.md` files (judgment, not a script).

## Gotchas
- **Subagents sometimes emit a UTF-8 BOM** on their output JSON — strip a leading `﻿` before `JSON.parse` (2 of 35 batches failed silently without it), and tell the subagent "no BOM" in the prompt.
- **Background fetch jobs die if the laptop sleeps** — every script is resume-safe (append + skip-done); a sleep just means re-run the same command.
- **Scrapling before Firecrawl** — try the free `solve_cloudflare` rung first, pay only for the residual.
- **`brand_match` guards guessed domains** — a found domain isn't a verified domain until the page proves the brand; keep `unsure` rows flagged, not silently trusted.
- **Filter cheap, LLM expensive** — never LLM the whole list; heuristic-bucket first, LLM only content rows.

## Worked example — RB2B reactor displacement (2026-09-12)

Source: reactors who engaged RB2B founder content, role-qualified, domain-resolved → 1,222 companies (RB2B's own customers already removed).

| Stage | Count |
|-------|-------|
| Prospects in (customers removed) | 1,222 |
| Fetched — has real content | 1,034 |
| LLM-adjudicated content rows | 1,029 |
| Scrapling recovered (of 50 Cloudflare-blocked) | 39 |
| First-pass B2B-verified | 729 |
| Wrong-domain re-matched back in | +58 |
| **Final B2B-verified, with contact person** | **787** |
| Dropped: wrong business type | 254 |
| Unresolvable (dead / thin / hard-blocked / stealth) | 181 |

Net: **787 B2B-verified prospects**, each with correct domain + the reactor to contact, RB2B customers subtracted — a displacement list no off-the-shelf tool produces. 64% of the role-qualified input converted; the free rungs (HTTP fetch + Scrapling) did the bulk, LLM spend fell only on content-bearing pages.
