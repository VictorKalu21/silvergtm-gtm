---
source: MCS "Find an Installer" register (mcscertified.com)
vertical: UK MCS-certified home battery / solar installers (backup-power ICP, Atlas Growth option A)
verdict: validated
last_validated: 2026-09-30
access: hidden JSON API (WA-02) — admin-ajax.php `filter_installers`, nonce read from the public page, keyless
dispatch: google-maps-scrape (back half only: qualify → collapse → site text → fit → Companies House → owner read → emails)
cost_tier: free
---

# MCS register × UK home battery installers

**Coverage:** every MCS-certified installer with the battery technology flag — **2,794 on 2026-09-30** (5,627 on the
register in total). Registry membership proves the trade (rule R3). Mix: battery+solar 2,198 · +heat pump 577 ·
battery-only 15; ENG 2,281 · SCT 256 · WLS 236 · NIR 21. This IS the universe — no Maps scrape needed.
**Fields:** name ✓ · **email ✓ (100%)** · phone ✓ (99%) · website partial (55%, scheme-less) · full address + postcode ✓ ·
lat/lng ✓ · certification number + body ✓ · 13 technology flags ✓ · 12 region-served flags ✓ · no owner name, no size.
**Fill rates (BY DEPTH):** flat — every page identical (12 rows/page, 233 pages).
**Restrictions:** none met at 600 ms between calls (233 calls, 0 errors). Nonce is per page load; either of the two
page nonces works. Data is the live register (freshness = MCS).
**Method:** `GET https://mcscertified.com/find-an-installer/` → regex `var mcsAjax = {..."nonce":"<hex>"}` →
`GET /wp-admin/admin-ajax.php?action=filter_installers&nonce=<hex>&form_type=installers&technology[]=technology_battery&page=N`
with `X-Requested-With: XMLHttpRequest` + the page as Referer → `data.data[]` rows, `data.pagination.total_pages`.
Puller: `clients/atlas-growth/2026-09-30_uk-battery-installers-mcs/pull-mcs.js` (resumable, normalises to the engine
lead shape, `place_id = mcs:<installer_id>`, prefixes `http://` on scheme-less websites).
**Cost actuals:** $0 and ~3 minutes for the pull. Back half on 2,704 net-new: Companies House 84% matched (register
names are legal names — far better than Maps names); site text 1,262/1,470 plain fetch, +113 Firecrawl (~200 credits);
email-domain rung derived a fetchable site for 914 of 1,231 website-less rows for $0; name-to-domain found 222 of 317
freemail rows (97 free resolver, 125 Haiku). Fit (stronger model, 48 batches): residential 1,464 · commercial-only /
not-installer 205 · heat-pump-led / general electrician / unclear 531. Owner read (55 Haiku batches):
**1,661 of 1,965 named (84.5%), 2,875 contacts, 2,541 from Companies House.** Emails: **1,944 of 1,965 with an
address** (register 1,901 · on-site 503 · reader 63), 553 on the owner's own mailbox.
**Gotchas:** (1) websites are scheme-less → `fetch-sites.js` silently skips them (IMPROVEMENTS OPEN 2026-09-30) —
normalise on pull. (2) 44% of rows have no website; their email domain usually IS the site (914/1,231) — derive
before name-to-domain. (3) A dedupe against a Maps run must key on host + phone (`mcs:` ids never match Maps ids);
do not treat `.co.uk` as a shared host. (4) The national suppliers and social-housing arms are on the register
(British Gas Social Housing, E.ON Installation Services, Octopus Energy Services) — name-deny them.
**Runs:** 2026-09-30 — Atlas Growth — 2,794 pulled → 1,965 ICP (1,464 residential-confirmed + 501 registry-only) — deliverable built, verification pending keys.
