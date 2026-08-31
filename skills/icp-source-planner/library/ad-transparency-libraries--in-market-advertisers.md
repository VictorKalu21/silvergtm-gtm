---
source: Ad-transparency libraries (LinkedIn Ad Library, Meta Ad Library, Google Ads Transparency, TikTok)
vertical: in-market / actively-advertising companies (buying-intent + competitor intel)
verdict: partial (LinkedIn = validated firsthand; Meta/Google/TikTok mechanics = TO-VERIFY)
last_validated: 2026-07-12
access: server-rendered HTML (LinkedIn, plain curl) + official API (Meta) — web-scrape-triage Tier 1 / Tier 0
dispatch: web-scrape-triage
cost_tier: free
---

# Ad-Transparency Libraries × In-Market Advertisers

Taxonomy **type 16**. The signal: a company *actively running ads* = budgeted + in-market. Ad-transparency
libraries are public by regulatory mandate (EU DSA + political-ad transparency), so they're a free, legally-clean
source class — the opposite side of the line from authenticated LinkedIn (Voyager = STOP). Two uses: (1) an
in-market **prospect signal**, (2) a **double-verify primitive** — confirm a firmographically-sourced list actually
advertises. Firmographic sourcing gives you *who could buy*; the ad library confirms *who's spending now*.

## LinkedIn Ad Library — VALIDATED firsthand (Silver GTM ABM engine, 2026-07)
- **Public, no login.** Plain `curl` + browser UA; data is server-rendered in the HTML.
- Search: `https://www.linkedin.com/ad-library/search?keyword=X&countryCode=us&dateOption=last-30-days`
- **KEY primitive:** `?accountOwner=<company name>` = **exact-advertiser filter** (returns only that advertiser's ads
  — the reliable verify). `keyword=` matches ad **text**, not advertiser identity → unreliable for company verify
  (e.g. "Team Cymru" returned Welsh "Cymru" businesses).
- Card fields: advertiser name in a `font-bold leading-[20px]` div; ad copy in `commentary__content`; ad links
  `/ad-library/detail/{id}`; the LinkedIn company URL is on the detail page.
- Pagination: `paginationToken` did NOT advance in testing — page-1 (~24 ads) was enough per advertiser.
- **Rate limit:** ~429 after 3–4 rapid hits → space 3–4s + backoff.
- **Proven result:** 158 firmographically-qualified ABM companies → **121 confirmed running live ads** via
  `accountOwner` verify (30 no, 7 name-mismatch). Scripts were /tmp parse.js + verify.js (background).

## Meta Ad Library — TO-VERIFY (highest-value: has an official free API)
- Web UI: `facebook.com/ads/library`. Official **Ad Library API** at `facebook.com/ads/library/api`.
- **Unverified mechanics:** exact token/access requirements; whether *general commercial* ads are API-queryable
  without political-ad ID verification (historically the API skewed to political/issue/housing-employment-credit;
  EU DSA widened coverage). Confirm before relying on it. Meta ID/verification may gate the API.

## Google Ads Transparency Center — TO-VERIFY
- Web UI: `adstransparency.google.com` — search ads by advertiser + region + format. API access unclear; likely
  UI/scrape only. To-verify: query grammar, whether advertiser→ad list is enumerable.

## TikTok Commercial Content Library — TO-VERIFY
- `library.tiktok.com` — EU-DSA-mandated ad library with a research API for EU ads. To-verify: access, scope, non-EU coverage.

## Fields / coverage
Advertiser name + (usually) a link to the advertiser's platform page → company. Ad **creative/copy** (personalization
gold). Dates, format, sometimes spend/impression bands (political only). NO firmographics, NO domain → enrich
(name→domain per R4) + Apollo for people.

## Method (the double-verify play, reusable)
1. Firmographic-source a candidate list (Apollo: title + tech-stack, or any type-1..14 source).
2. For each company, hit the ad library's exact-advertiser filter (LinkedIn `?accountOwner=`) → keep only those
   with live ads = confirmed in-market. 3. Pull a sample of their live creative for personalization.

## Restrictions / line
Public/regulatory-mandated = free & clean (logged-out). Rate-limit + space requests. This is the STOP-safe side —
the *authenticated* LinkedIn (feed/Voyager) is the other side; don't cross it.

## Gotchas
- LinkedIn `keyword=` matches ad text, not advertiser → use `accountOwner` for company verify.
- Meta API ≠ "all ads free" — verify the commercial-ad access path before promising it to a client.
- Name→domain still required downstream (R4).

## Runs
- 2026-07-11/12 — Silver GTM ABM engine — 121/158 companies confirmed running live LinkedIn ads (`adlib_verified.csv`). LinkedIn method validated; Meta/Google/TikTok not yet run.
