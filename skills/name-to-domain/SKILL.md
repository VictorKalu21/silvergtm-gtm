---
name: name-to-domain
description: >-
  Enrich a list of company names into verified website domains so the list is Apollo-ready
  (domain-match beats name-match on every people tool). Use this WHENEVER you have companies
  or leads without domains and need each real website — right after scraping a directory / job
  board / Google Maps, before an Apollo (or ZoomInfo / Clay) people-pull, or any time the user
  says "find the websites for these companies", "get domains for this list", "resolve domains",
  "name to domain", "make this list Apollo-ready", or hands over a CSV of company names that has
  no domain column. Cheap by design: a persistent cache plus parallel Haiku web-verify subagents,
  no paid API keys. Prefer this over guessing a domain from the company name, or reaching for a
  paid enrichment API like Clearbit (its autocomplete returns wrong/spoofed results).
---

# Name → Domain enrichment

Turn a column of company names into an Apollo-ready CSV with a verified `domain` for each. This is the
step that sits between "I scraped a list of companies" and "I pulled contacts in Apollo." It matters
because every downstream people tool matches far more reliably on domain than on a company name string,
and because raw scrapes carry names that are NOT the domain (an applicant-tracking-system slug like
`getbuilt`, a legal entity like `11855760-canada-inc`, a brand written five different ways).

Proven at ~98% on real lists (Industrial Defender OT registry sample; a 145-company Clay-users list).

## When this applies

Use it whenever the input is "companies without domains and I need the real site." Typical upstreams:
a directory scrape (Clutch/DesignRush), a job-board/SERP scrape, a Google Maps pull with missing sites,
a conference exhibitor list, a registry export.

Do NOT use it when the list already has good domains, when you need *people/emails* (that's the Apollo
pull this feeds, not this step), or when you need firmographics (size/revenue) rather than the website.

## The design, and why it is cheap

Two tiers. The whole point is to spend as little model time as possible on what is a mechanical lookup.

1. **Cache first (free).** A persistent `domain_cache.csv` keyed by a normalized company name. Companies
   recur across list builds, so over time most rows are answered for zero cost and zero latency. Always
   pass `--cache` so each run both reads and grows the same file.

2. **Tier 1 — parallel Haiku web-verify subagents (cheap).** Only cache misses go here. Split them into
   batches and dispatch one subagent **per batch on the Haiku model** (`model: haiku`). Each subagent
   web-searches with the harness `WebSearch`/`WebFetch` tools — these are keyless, so no SERP key or
   scraper.tech key is needed — resolves the real company, and returns `{domain, resolved, confidence}`.

Why not a big model? The first version of this ran general-purpose subagents on the session model doing
agentic browsing and burned ~270k tokens on 145 rows. The task doesn't need that horsepower — Haiku
verifies a homepage just as well for a fraction of the cost. Why not Clearbit? Its free autocomplete
ranks the wrong domain first (e.g. Cobalt's real `cobalt.io` came 5th behind a credit union) and returns
spoofed lookalikes, so it creates cleanup work instead of saving it. Web-verify with a cheap model is
both cheaper in practice and more accurate.

## Workflow

### 1. Inspect the input
Read the CSV header. Identify the **name column** and any **context columns** that help disambiguate —
usually a job title or a source URL, which frequently contain the real brand when the name column is a
slug. Decide which columns to **pass through** to the output (keep the caller's other fields intact).

### 2. Prep the batches
```
node scripts/prep_batches.js --in <input.csv> --name <name_col> \
  --context <title,url> --batch 25 --out <workdir> --cache <path/to/domain_cache.csv>
```
This normalizes names, answers what it can from the cache, and writes the remaining misses to
`<workdir>/batches/batch-<N>-in.json` (arrays of `{key,name,<context...>}`). It prints how many were
cache hits vs. misses and how many batches it created.

### 3. Dispatch one Haiku subagent per batch (in parallel, same turn)
For each `batch-<N>-in.json`, spawn a subagent with `model: haiku`. Use the prompt in
`references/subagent-prompt.md` — it tells the subagent to read its input file, resolve the real company,
web-verify the domain, and **write** `<workdir>/batches/batch-<N>-out.json` keyed by `key`. Launch all
batches in one turn so they finish together.

Key instructions that keep accuracy high (all spelled out in the reference prompt):
- The scrape name is often NOT the domain. The **real brand usually lives in the context/title**
  (`getbuilt`→Built Technologies, `joinbeam`→Beam AI, `ohio`→OH.io, `asg`→Actabl,
  `11855760-canada-inc`→Tali AI). Resolve the brand first, then find its site.
- Return the **primary marketing domain** people would email, not the ATS link, not LinkedIn, not a
  spoofed lookalike (`airteb1e.tech`, `alpha-airtable.com`).
- **Blanks, not guesses.** If it can't be confidently verified, leave `domain` empty. A wrong domain is
  worse than a blank one downstream — it sends mail to the wrong company. Mark `confidence` high/medium.

### 4. Merge and update the cache
```
node scripts/merge_domains.js --in <input.csv> --name <name_col> \
  --work <workdir> --cache <path/to/domain_cache.csv> --out <output.csv> --passthrough <title,url>
```
This joins cache hits + all `batch-*-out.json` back to the source rows, writes the Apollo-ready CSV
(`<name_col>, resolved_company, domain, confidence, <passthrough...>`), and appends every newly resolved
company to the cache (under both the input key and the resolved brand, to maximize future hits). It prints
the fill rate and lists any rows left blank.

### 5. QA the residue
Look at the blanks and the `medium`-confidence rows. Blanks are usually genuine (defunct site, brand
collision, a placename false-positive) — resolve by hand or drop. This is also the natural place to flag
rows that resolved fine but aren't real target accounts (the tool company itself, recruiters posting for
an unnamed client, staffing shops) — a domain being found doesn't make a row in-ICP.

## Scaling notes
- ~25–30 companies per batch is a good size; more batches = more parallelism but more subagent overhead.
- The concurrency cap means very large lists queue naturally — just dispatch them all.
- The cache is the compounding asset. Keep ONE stable `domain_cache.csv` path across all your list builds
  (e.g. alongside your data folder) rather than a fresh one per run, so hits accumulate.
- Stubborn residue (a handful of obscure companies Haiku can't verify) can be escalated to one subagent on
  a stronger model as a rare fallback — not the default.

## Files
- `scripts/prep_batches.js` — cache check + split misses into batch input files.
- `scripts/merge_domains.js` — merge results back to source rows + write output + grow the cache.
- `references/subagent-prompt.md` — the exact prompt template for the Haiku web-verify subagents.
