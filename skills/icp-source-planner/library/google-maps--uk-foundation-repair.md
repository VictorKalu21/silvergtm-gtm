---
source: Google Maps export (operator-supplied "Foundation, Concrete contractor, Waterproofing service" pull, UK)
vertical: UK foundation repair — underpinning / subsidence / structural repair / basement waterproofing & damp-proofing contractors
verdict: validated (qualify + owner-finding); scrape not run by us
last_validated: 2026-09-16
access: site text via fetch-sites.js (plain fetch); owner names via Companies House Public Data API (free key) + LinkedIn-restricted WebSearch sweep
dispatch: google-maps-scrape (STEP 5b onward)
cost_tier: free (Companies House, in-session reads); Maps export supplied
---

# Google Maps × UK foundation repair

**Verdict:** VALIDATED for qualify + owner-finding on a supplied export. Client: Atlas Growth (UK sub-scrape, 2026-09-16).

## What the Maps category pull looks like
The query "Foundation, Concrete contractor, Waterproofing service" returns a mostly off-ICP universe: 5,999 rows →
2,865 after dedupe and a $0 non-trade/supplier deny (charities answer "Foundation"; colleges, mosques, hospitals,
retail) → **175 ICP (2.9% of the export, 6% of the trade universe)**. "Foundation repair" barely exists as a UK trade
label; the ICP self-labels as damp-proofing / structural waterproofing (60%), general builders with a structural
repairs line (17%), underpinning & piling (8%), structural repair specialists (8%). 37 US service-area pins bled into
the "UK" export carrying UK region tags — gate on UK postcode / 0-prefixed phone / .uk domain.

## Owner-finding (where the names live)
- Own site names someone on ~4% of ICP sites (7 of 175). Weaker than the US (16%).
- **Companies House is the registry.** Directors named for 112 of 175 (64%) at $0: engine match 97, a looser
  exact-title pass on the residue +17 (the engine leaves "X Ltd." vs "X LIMITED" as low_confidence — see
  IMPROVEMENTS). Reject low-confidence candidates whose title shares no distinctive token with the business (4 wrong
  owners caught: "Crown Preservation" → ABOVEWATER DAMP PROOFING).
- LinkedIn-restricted WebSearch sweep on the residue named 16 more (30% of 53). Sole traders whose business name IS
  the person (Darryl C Price) are the easy wins. Web snippets rarely name UK trade owners otherwise.
- Combined **138 of 175 named (79%)**, 133 owner_or_partner.

## Emails
Maps export carried an email for 57% of rows; on-site harvest confirmed 69% of those and added an email for 211
companies that had none (7% of universe). Person-shaped mailboxes are rare (6 of 151 on the ICP); the rest are
info@/enquiries@ or free-mail company inboxes.

## Gotchas
- ~14% of trade sites fail a plain fetch; 271 of 394 are 403s that also block Scrapling's stealth browser from a
  datacenter egress. Recover from a residential IP or Firecrawl, or accept the loss (they cannot qualify without text).
- Keyword tiering is a pre-filter only; tier C (new foundations / groundworks) model-read yielded 14 yes of 372.
