---
source: State contractor licence boards (LA LSLBC, AR CLB; MS MSBOC and AL GC/HBLB checked)
vertical: home-services contractors (foundation repair, waterproofing, concrete) — licensee EMAIL + qualifying party
verdict: partial
last_validated: 2026-09-12
access: LA = plain POST/GET + roster CSV (Tier 1); AR = nightly bulk CSV (Tier 0.5); MS = Cloudflare-walled; AL-GC = no email field; AL-HBLB = Azure WAF
dispatch: web-scrape-triage
cost_tier: free
---

# State contractor licence boards × home-services contractor emails

**Why it matters:** the one registry that exposes a company EMAIL (not just an address) for small contractors, for
free, with the qualifying party's name. Vendors (QuickEnrich, AI Ark, TryKitt) index ~20% of these owners; the
board carries the licensee's own filed address.

| Board | Email? | How | Notes |
|---|---|---|---|
| **Louisiana** `arlspublic.lslbc.louisiana.gov` | **YES**, `EmailAddress` on record and in roster CSV | `POST /Public/_DetailedLookupRoster/` (`CompanyName=<keyword>`, `SearchType=ByName`, header `X-Requested-With: XMLHttpRequest`) → `RosterFileUri` → `GET /Storage/RosterStorage/RosterRequest_{id}.CSV`; per-record `POST /Public/_DetailedSearch/` → `GET /Public/_DisplayOnlineDetails/?key=` | no anti-bot; results capped 1,500 → keyword rosters (Foundation 95, Concrete 372, Waterproofing 65, Pier 52, Structural 38, Leveling 19, Slab 7, Crawl 5). Columns incl. `QualifyingParty`, `ClassificationName`, `Status`. |
| **Arkansas** `aclb2.arkansas.gov` | **YES**, `Email` in nightly CSV (98% filled); NOT on the HTML search | `GET http://aclb2.arkansas.gov/latestroster.csv` (6 MB; first line is a title, second blank, then header) | plain HTTP; `Officers` column ("President: Robert Stroud"); `aclb.arkansas.gov` itself is Cloudflare-walled and irrelevant |
| Mississippi `search.msboc.us` | NONE on the record template | ColdFusion `Detail.cfm?ContractorID=` | whole host Cloudflare "Just a moment" 403 |
| Alabama GC `licensesearch.alabama.gov/genconbd` | NONE | `/genconbd/Details/{id}`, `/genconbd/FullRosterReport` CSV | no qualifying party either |
| Alabama HBLB `alhobv7prod.glsuite.us` | not verified | GLSuite ASP.NET | Azure Application Gateway WAF 403 |

**Join method:** normalise names (drop llc/inc/co, trade stop-words), require overlap on all-but-one distinctive
token, prefer a city match; verify every address through MillionVerifier → BounceBan before use.

**Runs:** 2026-09-12 — Atlas Growth — only 22 leads in LA/AR on a 10-state spillover list; see run STATE.md for the
join result. High value for any LA- or AR-heavy build.
