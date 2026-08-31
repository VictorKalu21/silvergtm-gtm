# Google Maps × US marketing/advertising agencies (local-serving)

**Verdict:** VALIDATED (universe stage). `last_validated: 2026-07-09`
**Client first run:** db2b house outbound.

## ICP
US marketing/advertising agencies serving LOCAL businesses — broad, incl. non-digital:
marketing agency, advertising agency, internet marketing service, sign shop, commercial printer,
promotional products supplier, print shop, marketing consultant.

## Coverage / method
- Source: scraper.tech `searchmaps.php` via `google-maps-scrape` engine, `areas` mode.
- Footprint: true top-50 US metros, 79 tile centers (multi-center on big sprawl metros), zoom 12.
- 8 category queries × 79 centers = 632 base tiles; MAX_DEPTH=1 auto-split on saturation.
- Yield: 129,278 raw → **77,001 unique** (place_id) → **59,947 qualified** → **59,732 in-footprint**.
- Website fill: **81%** have a Maps website (19% no-website → recovery track).

## Fill by field (Maps stage)
name/place_id/category/city 100%; website 81%; review_count sparse (B2B — do NOT size-gate on it).

## Qualify design that worked
- NO review floor (B2B professional services — agencies get few Google reviews).
- Deny: enterprise holdcos/PR giants (WPP/Omnicom/Ogilvy/Accenture/Deloitte Digital/Edelman…),
  retail self-serve print/ship chains (UPS Store/FedEx Office/Staples/Vistaprint), + client-specific
  (SpeedPro excluded as existing case-study relationship).
- **google_types ALLOW-LIST is mandatory, not optional** (see gotcha).
- Establishment + local-serving fit = Clay-stage, NOT Maps: `serves_local_smb`, solo_operator=false,
  years_in_business>=3, real website.

## Gotchas
- **Deny-only qualify leaks radius-fill junk.** With deny rules but no allow-list, the API's
  radius-expansion (it pads sparse category searches with nearby businesses) shipped ice-cream cafes
  and a 7-Eleven into a "marketing agency" list. Fix = a `google_types` contains_any ALLOW-list
  (matches ANY tag): keeps mis-primaried real agencies, drops junk carrying no marketing/print/sign tag.
  Cut 8,898 leaks (77,001→59,947). This is the same lesson as google-maps-scrape IMPROVEMENTS (LH) —
  now recurred on a 2nd vertical: **always pair denies with a google_types allow-list.**
- Slow API window: scraper.tech Maps hit ~23s/call one evening; the sequential engine → ~11h + total
  data loss on interrupt. Workaround = split runsheet into N shards, run N concurrent `run-scrape.js`
  workers (each persists own file). ~8× speedup, resumable. Recovered to ~90 min.

## Downstream
Deliverable `leads_netnew.csv` is domain-first, Apollo/Clay-ready. Next = Clay serves_local_smb classify
+ owner-finding (needs offer + target-role: agency owner/founder/principal/creative director).
