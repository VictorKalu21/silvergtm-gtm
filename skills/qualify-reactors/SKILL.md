---
name: qualify-reactors
description: >-
  Turn a raw export of people who ENGAGED a vendor's content (post reactors / commenters /
  followers — e.g. everyone who reacted to a founder's LinkedIn posts) into a B2B-verified,
  contactable lead list: each real B2B company with its correct website domain AND the specific
  person (the reactor) to contact, with the vendor's CURRENT customers subtracted. Use this
  WHENEVER you have a reactor/engager/audience export and want qualified outbound leads from it,
  when asked to "qualify reactors", "clean this engager list", "who of these post-reactors is a
  real B2B company we can sell to", to build a displacement/competitor-audience play off a rival
  vendor's fans, or to source prospects from a founder's engaged audience. Cheap by design:
  free HTTP fetch + heuristic pre-filter, cheap-LLM adjudication only on what survives, free
  Scrapling before any paid unlocker. For plain name→domain enrichment see name-to-domain; for
  the anti-bot ladder see web-scrape-triage.
metadata:
  version: 1.0.0
---

# Qualify Reactors

A raw list of people who engaged a vendor's content (LinkedIn post reactors, commenters, followers,
webinar attendees) is a goldmine of intent — but it's mostly noise: freelancers, agencies, coaches,
consumers, and people whose "company" is a personal brand. This skill filters that raw export down to
**real B2B companies you can actually sell to**, attaches **the correct website domain** and **the
specific person to contact**, and **removes the vendor's existing customers** (so a displacement play
targets prospects, not current users).

Proven on the RB2B reactor job: 1,222 role-qualified reactor companies → **787 B2B-verified prospects**
(64%), each with domain + contact person, RB2B's own customers subtracted.

## When this applies
Use it whenever the input is "people who engaged X, now who's worth contacting." Typical sources: a
LinkedIn post-reactor/commenter export (PhantomBuster/TexAu/HeyReach), a follower scrape, an event
attendee list, a community roster. The vendor angle is usually a **displacement play** — target the
engaged audience of a competitor, minus that competitor's current customers.

Do NOT use it for a clean firmographic company list (that's just [[name-to-domain]] → Apollo), or when
you only need the people at ONE known company (that's an Apollo people-pull).

## The pipeline (engine = fixed scripts, behavior = `config.json`)
Everything client/vendor-specific lives in `config.json` (see `config.example.json`); the scripts never
change. Copy the example into your run folder, edit it, then run the stages in order. Each stage writes
its output into the run folder and is resume-safe.

```
raw reactor export
  1. role-qualify        (keep decision-makers, drop fractional/agency-solo)   -> role_qualified.csv
  2. classify-first      (headline-only LLM drop, NO fetch)                     -> classify/*.json
  3. resolve domains     (free guess-and-verify, then LLM residual)            -> domains
  4. fetch + triage      scripts/fetch-triage.mjs   (free Tier-1 + heuristic)  -> b2b_verify.jsonl
  5. capture text        scripts/fetch-text.mjs     (prune pages for the LLM)  -> pages.jsonl
  6. B2B + brand adjud.  Haiku subagents on references/b2b-llm-prompt.md       -> llmb/*-out.json
  7. recover blocked     scripts/scrapling-blocked.py (free Cloudflare solve)  -> pages_blocked.jsonl
  8. assemble            scripts/assemble.mjs  (join person + subtract custs)  -> *_B2B_VERIFIED.csv
  9. re-match wrong dom  references/rematch-prompt.md (web-search subagents)   -> rematch/*-out.json
```

### 1–3: reduce cheaply before spending anything
- **Role-qualify** the raw export on job title/headline — keep founders/decision-makers, drop obvious
  fractional-exec-for-hire and one-person agencies. (Upstream filter; declare the rule in config.)
- **Classify-first** with `references/classify-prompt.md`: a headline-ONLY LLM pass (no web fetch) that
  drops the obvious agency/consultancy/freelancer/B2C and KEEPS `b2b_operator` + `unclear`. Bias to keep
  — a wrong drop loses a real lead; a wrong keep just costs one fetch later.
- **Resolve domains** with the free guess-and-verify resolver from [[name-to-domain]] (Tier 0.5), then a
  cheap-LLM/web pass on the residual. Never domain-guess without the brand-in-page verify.

### 4–6: the real B2B verdict (fetch, then read)
- `scripts/fetch-triage.mjs` — free Tier-1 homepage fetch + a keyword heuristic that buckets
  `b2b / b2b_weak / ambiguous / agency / b2c / thin / blocked / dead`. **The heuristic is only a router,
  never the verdict** (it mislabels product SaaS with "solutions & services" as agency). It exists to
  separate "has real content" from dead/blocked/thin.
- `scripts/fetch-text.mjs` — re-fetch the content-bearing rows and save PRUNED page text (`pages.jsonl`)
  so a cheap model can read them.
- **Adjudicate**: split `pages.jsonl` into ~30-row batches and dispatch one Haiku subagent per batch with
  `references/b2b-llm-prompt.md`. Each returns, per domain: `brand_match` (does the page belong to the
  company?), `b2b_verdict`, `confidence`, `reason`. This LLM read IS the B2B answer; it also catches
  guessed/wrong domains via `brand_match`.

### 7: recover the Cloudflare-blocked (free before paid)
`scripts/scrapling-blocked.py` runs Scrapling's `StealthyFetcher(solve_cloudflare=True)` on the `blocked`
bucket — a FREE anti-bot rung (see [[reference_scrapling_antibot]]). It typically recovers ~75–80%; only
the persistent 403/Imperva residual would justify Firecrawl. Adjudicate the recovered pages like stage 6.

### 8: assemble — join the person, subtract the customers
`scripts/assemble.mjs`:
- Keeps rows whose verdict is in `config.keep_verdicts` (default `b2b_operator`, `unclear`) **and**
  `brand_match != no`.
- **Joins the prospect back in** by matching the reactor `headline` to the original export → attaches
  `first_name, last_name, position, linkedin_url, headline, location, is_founder`. Headline is the join
  key because it's near-unique per person (proven 988/988 exact match).
- **Subtracts the vendor's current customers** (`config.vendor_customers` domain list) so the output is
  prospects only.

### 9: re-match the wrong-domain companies (the recovery loop)
Rows flagged `brand_match=no` are real companies pointed at the WRONG site. Feed them to web-search
subagents with `references/rematch-prompt.md` — each finds the company's REAL domain (from the headline's
`@brand` + the person's LinkedIn as hints), confirms it, and re-judges B2B in one pass. Fold the keepers
back into the final CSV. (Recovered ~65% on the RB2B run.)

## Output
`<run>/reactors_B2B_VERIFIED.csv` — one row per verified B2B prospect:
`domain · company · b2b_verdict · brand_match · confidence · source · first_name · last_name · position ·
linkedin_url · reactor_headline · location · is_founder`.

## Gotchas (all learned the hard way)
- **Subagents sometimes write a UTF-8 BOM.** Always strip a leading `﻿` before `JSON.parse` on
  `*-out.json` — two of 35 batches failed silently without it. Tell subagents "no BOM" in the prompt too.
- **Background fetch jobs die if the laptop sleeps.** Every script here is resume-safe (append + skip-done)
  — a sleep just means re-run the same command; it continues.
- **Scrapling before Firecrawl.** Try the free `solve_cloudflare` rung first; only pay for the residual.
- **`brand_match` guards guessed domains.** A found domain is not a verified domain until the page proves
  the brand. Keep `brand_match=unsure` rows flagged, not silently trusted.
- **Filter cheap, LLM expensive.** Never LLM the whole list — heuristic-bucket first, LLM only the
  content-bearing rows; the dead/thin/blocked can't be read anyway.

## Files
- `config.example.json` — copy to your run folder as `config.json` and edit.
- `scripts/fetch-triage.mjs` — Tier-1 free fetch + heuristic bucketing → `b2b_verify.jsonl`.
- `scripts/fetch-text.mjs` — capture pruned page text for the content rows → `pages.jsonl`.
- `scripts/scrapling-blocked.py` — free Scrapling Cloudflare recovery → `pages_blocked.jsonl`.
- `scripts/assemble.mjs` — keep-logic + person join + customer subtraction → final CSV.
- `references/classify-prompt.md` — stage-2 headline-only cheap drop.
- `references/b2b-llm-prompt.md` — stage-6 B2B + brand-match adjudication.
- `references/rematch-prompt.md` — stage-9 correct-domain re-match.
