---
source: <source name>
vertical: <vertical/ICP shape>
verdict: validated | failed | partial
last_validated: YYYY-MM-DD
access: <triage rung + WA-IDs, e.g. "hidden JSON API (WA-02) + WA-06">
dispatch: google-maps-scrape | directory-lead-sourcing | web-scrape-triage
cost_tier: free | workaround | paid
---

# <Source> × <Vertical>

**Coverage:** <what it holds vs this ICP; estimated max volume>
**Fields:** <field → can/partial/can't, vs a typical required set>
**Fill rates (from test/run, BY DEPTH):** head <…> / mid <…> / deep <…>
**Restrictions:** <rate limits, pagination ceiling, anti-bot, ToS notes, freshness>
**Method:** <exact working recipe: URL grammar / endpoint / dork patterns / params>
**Cost actuals:** <per-1k rows: tokens/credits/time>
**Gotchas:** <the things that bit us>
**Runs:** <date — client — rows — outcome> (append per run)
