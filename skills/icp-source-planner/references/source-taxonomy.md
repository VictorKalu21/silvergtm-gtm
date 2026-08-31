# Source Taxonomy

Source TYPES + heuristics for mapping an ICP to them. This file rarely changes (new
TYPES only). Validated per-source knowledge lives in `../library/`.

## Source types

| # | Type | What it holds | Free tier | Typical access | Best for |
|---|---|---|---|---|---|
| 1 | Google Maps | Local/physical businesses: name, category, reviews, site, phone | Free via scraper.tech key | `google-maps-scrape` skill | Any business with a storefront/service area |
| 2 | Business/agency directories (Clutch, DesignRush, Sortlist, The Manifest, GoodFirms) | Agencies/service firms: team size, budgets, ratings, domain | Free (HTML/JSON-LD; some Cloudflare) | `directory-lead-sourcing` skill | Agencies, dev shops, service providers |
| 3 | Review sites (G2, Capterra, TrustRadius; Trustpilot for consumer) | Software vendors + their customer reviews | Free to read; anti-bot varies | web-scrape-triage | Finding software companies by category; VOC mining |
| 4 | Job boards & ATS (Indeed, LinkedIn Jobs, Greenhouse/Lever/Ashby boards, niche boards) | Who's HIRING what role; tool mentions in JDs | Free via SERP dorks (`site:boards.greenhouse.io`) | web-scrape-triage (WA-03 dorking) | Hiring signal; tool-usage signal (e.g. "uses Clay") |
| 5 | Associations & registries (trade assocs, licensing boards, chambers) | Member/licensee lists, often with location + credential | Usually free, sometimes gated | web-scrape-triage | Regulated/credentialed verticals (contractors, brokers, clinics) |
| 6 | Government/public datasets (SEC Form D/ADV, CMS, state corp registries, contract awards) | Filings: funding, AUM, facilities, licenses | Free, bulk-downloadable | web-scrape-triage / direct file | Funded cos, financial firms, healthcare facilities, gov vendors |
| 7 | Tech marketplaces & partner directories (Shopify partners, Salesforce AppExchange, HubSpot/Klaviyo partners, Clay experts) | Companies BY the tool they use/integrate with | Free | web-scrape-triage | "Sells to users of X" ICPs |
| 8 | VC/PE portfolio pages | Funded companies by investor | Free | web-scrape-triage | Funding-stage ICPs; investor-quality proxy |
| 9 | Vertical SaaS ecosystems (customer pages, case studies, "powered by" footprints) | A vendor's named customers | Free | web-scrape-triage | Competitor-customer or tool-user lists |
| 10 | Award lists & rankings (Inc 5000, industry top-N lists) | Growth/quality-signaled companies | Free | web-scrape-triage | Growth-signal ICPs; small curated seeds |
| 11 | Event exhibitor/sponsor lists | Companies that PAY to reach a vertical | Free | web-scrape-triage | B2B verticals with strong trade shows |
| 12 | Franchise directories | Multi-location operators + franchisees | Free | web-scrape-triage | Multi-location/services ICPs |
| 13 | LinkedIn | Everything, but locked down | Effectively NO free scrape path here | Manual/Apollo downstream | Last resort; prefer Apollo for people anyway |
| 14 | Data brokers (Apollo, ZoomInfo) | Firmographics + contacts | PAID | Recommend-only (never procure) | Size-gating and the people layer AFTER this skill's output |
| 15 | App stores (iOS App Store, Google Play) | App publishers + ratings, reviews, permissions, versions, update dates | Free hidden API | web-scrape-triage (Tier 0) | App-owner ICPs; app-health/rescue signals |
| 16 | Ad-transparency libraries (Meta Ad Library, Google Ads Transparency, LinkedIn/TikTok) | Who's actively advertising + ad creative | Free (Meta has a Graph API) | web-scrape-triage | In-market / active-advertiser signal; competitor intel |
| 17 | Web mirrors (Common Crawl, HTTP Archive) | The web at rest — pages, domains, tech-per-site | Free (DuckDB / BigQuery 1TB-free) | web-scrape-triage (Tier 0.7) | Technographic reverse-lookup ("every company using tool X"), domain enumeration |

**Access via web-scrape-triage maps to specific rungs (2026):** registries/gov data → Tier 0.5 · web mirrors → Tier 0.7 · hidden APIs & known-open platform endpoints (app stores, Shopify `/products.json`, headless CMS, Algolia keys) → Tier 0 · footprint (crt.sh/DNS/favicon) → Tier 2. Name the rung when you dispatch.

## ICP → source-type heuristics

- Local / physical / service-area business → 1 (Maps), + 5 if licensed, + 12 if franchise.
- Agency / dev shop / creative / consulting → 2 (directories), + 4 for hiring signal.
- Software company by category → 3 (review sites), + 4 (JD tool-tags), + 8 if funded.
- "Companies that USE tool X" → **17 (HTTP Archive / Common Crawl reverse-lookup — FREE, cheapest realization)** + 7 (partner dirs) + 4 (JD dorks: `"X" <role> site:<ats>`) + 9 (X's customer pages). Don't pay BuiltWith for what HTTP Archive gives free.
- App publishers / "has a mobile app" ICP → 15 (app-store APIs; reviews RSS = health/rescue signal).
- In-market / actively advertising → 16 (ad libraries; Meta Graph API).
- "Every site on platform X / TLD / using tech Y" → 17 (web mirrors).
- Recently funded / by stage → 6 (Form D) + 8 (portfolios).
- Regulated vertical (health, finance, construction) → 6 (gov data) + 5 (registries).
- E-commerce brands → 7 (Shopify ecosystem) + 3 (Trustpilot) + tech-detection footprints.
- Growth-signal ICP ("scaling companies") → 10 (award lists) + 4 (hiring velocity).
- B2B niche with trade shows → 11 (exhibitor lists) — often the highest-intent free list that exists.

## Selection rules

1. Free-first: free/public > free-with-workaround > paid-recommend-only.
2. Propose 2–3 source types per run (multi-source is the norm); rank by
   (ICP coverage × required-field coverage × cost).
3. A source that can't deliver a MUST-HAVE field can still rank if another source
   or a workaround (see catalog) covers the gap — say which.
4. Check `../library/_index.md` BEFORE researching: a fresh validated profile
   outranks everything.
