---
name: directory-lead-sourcing
description: >
  Build an ICP-qualified B2B lead list — companies WITH firmographics (team size, deal/project size, ratings, location) AND decision-maker contacts — by scraping a business/agency/service directory (Clutch, DesignRush, The Manifest, Sortlist, DesignRush alternatives, etc.), filtering to fit, enriching with the real website domain, and handing off to Apollo for the people. Use this WHENEVER the user wants to source agencies or companies from a directory, build a targeted or high-ticket lead list for cold outbound, says "find me agencies/companies that…", wants to scrape Clutch or DesignRush, needs a list with firmographics + emails for a niche, is sourcing a campaign's prospect list from a directory, or wants to productize a lead-list service — even if they only describe the outcome (a qualified list of companies plus who to email). Prefer this over a raw paid lead export, because the value is the ICP-scoring + real contacts, not just a list.
---

# Directory Lead Sourcing

Turn a B2B directory into a scored, contact-ready prospect list. The directory gives firmographics that double as qualification; the real domain + Apollo give the people. The differentiator over a raw list is the *fit-scoring* — sell/deliver intelligence, not rows.

Uses the **web-scrape-triage** skill for every fetch (cheapest path first). The bundled scripts in `scripts/` are working, proven templates — read and adapt them, don't rewrite from scratch.

## Pipeline
`pick directory + ICP → recon URL grammar → scrape cards → ICP-filter → enrich (rating/reviews/domain) → Apollo-ready CSV → Apollo contacts (decision-maker + sales-team check) → score & cut`

## Step 1 — Resolve ICP + pick the directory (do this with the user first)
Nail the ICP before scraping: service **categories**, **geos**, **deal-size floor** (e.g. $10k+), **team-size band**, any vertical. Then pick the directory by data + scrapeability:
- **DesignRush** — best starting point: server-rendered (plain fetch, free), exposes a **Minimum Project Budget** signal per card, country path segments, simple `?page=N`. Tier-1.
- **Clutch** — deepest universe (200k+ agencies) but Cloudflare-blocked → **Firecrawl** (Tier-3).
- The Manifest / Sortlist / DesignRush alternatives — same model; recon each.

## Step 2 — Recon the URL grammar (web-scrape-triage)
Find: category slugs, how geo is applied (path vs query), pagination, and which fields live in the card vs the profile page. (DesignRush proven grammar: `/agency/<category>/<cc>?page=N`; cc is a path segment, `uk`=`gb` alias; cards carry `data-agency-name`/`data-agency-id`, profile link `/agency/profile/<slug>`, budget bracket, team band; rating/reviews live in a single page-bottom `application/ld+json` ItemList keyed by profile URL; the real website is only on the profile page.)

## Step 3 — Scrape the cards
Plain fetch (DesignRush) or Firecrawl (Clutch). Split the HTML on a per-card marker, extract name, id, profile slug, **budget bracket**, **team band**, completed-projects. Paginate to the page cap; dedup by id; track which categories/countries each agency appeared in.
→ Adapt `scripts/designrush-scrape.js` (handles pagination, redirects, the JSON-LD rating map, the high-ticket budget filter).

## Step 4 — ICP filter
Keep cards whose **budget bracket lower-bound ≥ your floor** (e.g. drop "$1,000–$10,000", keep "$10,000–$25,000" and up). Undisclosed-budget cards: keep but flag — qualify later. Apply the team-size band.

## Step 5 — Enrich
- **Rating + review count + completed projects** — from the page's JSON-LD ItemList, matched to each card by profile slug. Only agencies *with reviews* get a rating, so a present rating is itself a credibility/activity signal.
- **The real website domain** — the gold for Apollo matching. It's only on the profile page, as the outbound link with `?utm_source=DesignRush` appended, inside the agency's own `<h1 class="title">` (NOT a sidebar/featured-agency link — anchor on the H1 or you'll grab the wrong domain).
  → Run `scripts/enrich-domains.js` (fetches each profile, extracts the H1 website link, ~100% accuracy, resume-safe, concurrency-limited).

## Step 6 — Apollo-ready CSV
Output one row per company: **name · country (full) · domain · budget · team · rating · reviews · completed · categories · profile**. Domain present = Apollo matches reliably; without it Apollo falls back to fuzzy name match.

## Step 7 — Apollo for contacts (the people layer)
Upload to Apollo, match by domain, pull two title sets:
- **Decision-makers (who to EMAIL):** `Founder` · `Co-Founder` · `Owner` · `CEO` · `Managing Director` · `Managing Partner` · `President` · `Partner`
- **Sales-team check (presence ⇒ they run outbound ⇒ prioritize):** any of `Sales`, `Business Development`, `New Business`, `Growth`, `Revenue` at Director+ / Head / VP / C-Suite. ≥1 hit → flag `has_sales_team = yes`.
  (Apollo title filter is *contains*-match — use function roots + Management Level facet, not seniority-prefixed strings, and stop at Director level.)

## Step 8 — Score & cut
Rank on `confirmed-deal-size (gate) × team-size-sweet-spot × has-sales-team × rating/reviews`, take the top N. A "rated + confirmed high-ticket + has-sales-team" agency is the cream.

## No directory? Source by signal instead
When the target isn't in a directory (e.g. "companies that use tool X"), pivot to SERP: Google public ATS boards for job posts naming the tool, harvest the company from the ATS URL. → `scripts/clay-jobs-serp.js` (scraper.tech Search key; `<tool> "<role>" site:jobs.lever.co|boards.greenhouse.io|jobs.ashbyhq.com`). Then enrich + Apollo the same way.

## Guardrails
Politeness + resume-safe writes + dedup-by-domain + filter-cheap-enrich-expensive (all per web-scrape-triage). Directory scraping violates ToS — proceed knowingly. Don't sell a raw list as the product; the fit-scoring + verified contacts are what make it worth paying for.
