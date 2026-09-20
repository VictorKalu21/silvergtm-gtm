---
source: Australian state building-licence registers (NSW Fair Trading verify.licence, WA Building and Energy register PDF; VBA, QBCC, SA CBS, ABN Lookup checked)
vertical: Australian home-services trades (underpinning, restumping, foundation repair) — the OWNER name behind a Maps listing (the Companies House substitute)
verdict: partial
last_validated: 2026-09-20
access: NSW = keyless hidden JSON API (Tier 0); WA = daily register PDF (Tier 0.5); VIC = Cloudflare / Salesforce community that does not boot from a datacentre egress (Tier 3); QLD = host refused at the proxy (Tier 3 / other egress); SA = reCAPTCHA gate; ABN = keyless JSON needs a free GUID, no officers
dispatch: web-scrape-triage
cost_tier: free
---

# Australian state licence registers × foundation-repair owner names

**Why it matters:** Australia has no Companies House. ASIC officer data is paid and Cloudflare-walled. But every
state licenses building contractors, and the licence record names the **individual** behind the company — a
Director and/or a Nominated supervisor — which for a 3-to-10-person underpinning or restumping firm is the owner.
Two of the five states are free and scriptable from a datacentre egress; the two biggest Victorian/Queensland
registers are not (yet).

| register | state | reachable? | what it gives | how |
|---|---|---|---|---|
| **Fair Trading `verify.licence.nsw.gov.au`** | NSW | **YES, keyless JSON** | licence rows (licensee, type, class, status, suburb, postcode, ABN/ACN) and, per licence, `associatedRoles` = Licensee / **Director** / **Nominated supervisor** with the person's name and suburb | `POST /publicregisterapi/api/v1/licence/search/advQuery` `{"licenceGroup":"Trades","search":"<ONE token>","autoComplete":false,"pageNumber":0,"pageSize":10,"licenceTypes":[]}` → `GET .../licence/search/details/{licenceType url-encoded}/{licenceId}` |
| **Building and Energy (DEMIRS) register** | WA | **YES, PDF** | 6,456 current building contractors: entity, business address (suburb + postcode), first registered, **nominated supervisor(s)** "BPnnn - Surname, Forenames" | `GET https://contenthub.demirs.wa.gov.au/downloads/cals/BuilderRegister.pdf` (5.4 MB, 1,389 pages, refreshed daily) → `pdftotext -layout` → fixed-width parse of SECTION 1 |
| VBA `bams.vba.vic.gov.au` / `vba.vic.gov.au/tools/find-practitioner` | VIC | no (from this egress) | practitioner register incl. Domestic Builder classes | front page Cloudflare 403; the BAMS Salesforce community answers 200 but the Lightning app never boots (its static hosts are outside the egress policy) — needs Firecrawl or another network |
| QBCC online licence search | QLD | no (from this egress) | licensee, class ("Foundation work (piling and anchors)" etc.), nominee | `onlineservices.qbcc.qld.gov.au` refused at the proxy (CONNECT 502); ASP.NET postback form — Firecrawl with actions, or another egress |
| CBS `OccLicPubReg` | SA | gated | licence search form | reCAPTCHA v2 before the form; an operator-solved session cookie may carry a pull |
| ABN Lookup JSON | national | needs a free GUID | entity name, ABN status, type, state, postcode — **no officers** | `abr.business.gov.au/json/` (connection reset through this proxy) |
| ASIC Connect | national | out of scope | officers (paid) | Cloudflare 403; paid extracts |

## NSW — the three facts that cost a session to learn

1. **`pageSize` must be ≤ 10.** Anything larger returns `{"results":[]}` with no paging block and no error.
2. **`pageNumber` is zero-based.** `"underpinning"` → page 0 = 10 rows, page 1 = the remaining 4, page 2 = `[]`.
3. **The search term is matched as ONE token** against the licensee name. A space in the term returns `[]`
   (`"Underpinning Solutions"` → 0; `"underpinning"` → 14 incl. UNDERPINNING SOLUTIONS PTY LTD; a licence
   number as the term → 0). So search the business name's 1–2 most distinctive tokens, union the hits, then
   match on token overlap + suburb/postcode.

Also: the licence-class filter takes the class **object** as `licenceClass` returns it, not a code string —
`"licenceClassSearch":[{"classCodes":["HBS_CON_Underpinning and Piering","AMR-TRADES-036"],"displayName":"Contractor Licence - Underpinning and Piering","licenceTypes":["Contractor Licence"]}]`
with `"status":["Current"]` → **122 current NSW-licensed underpinning contractors in 13 pages** (individuals named
directly; also interstate firms holding NSW licences). The details path takes the licence TYPE, not the group
(`details/Contractor%20Licence/1-3RH70OX`; `details/Trades/...` is a 404). Probe 2026-09-20: UNDERPINNING
SOLUTIONS PTY LTD → Director + Nominated supervisor Markos Abelas; Buildfix Group Pty Ltd → Director Dale Allan
Stewart + two nominated supervisors.

## WA — the register is the whole universe, as a PDF

Every WA builder must hold a BC registration with a nominated supervisor; WA has no underpinning class, so the
register is a **name-join** source. Parse: SECTION 1 only; columns by header offsets (`STATUS REG NO FORMER
NAME OF ENTITY BUSINESS ADDRESS FIRST NOMINATED SUPERVISOR`); continuation lines carry address/name/supervisor
overflow; single-line rows overflow the FIRST REGISTERED date into the address column (strip `dd/mm/yyyy`
before parsing the suburb). 6,382 of 6,456 entities carry a supervisor; 143 carry two.

## Join method (both registers)

Normalise (lowercase, `&`→and, strip punctuation), drop stop-words INCLUDING the trade nouns (underpinning,
restumping, foundations…), generic business words (solutions, services, group) AND the words that collide with
surnames or places (house, home, level, east/west…). `exact_title` → matched; all distinctive tokens of the
shorter name in the longer AND suburb or postcode agree → matched (`name_overlap`); token overlap without
location → `low_confidence` only for ≥2 shared tokens or one ≥5-char token covering the whole lead name; else
no match. The first cut matched "Sydney House Levelling" to an individual surnamed House — the stop list and
the location requirement exist because of that. Supervisor-only names are `gm` unless a second signal makes
them the owner (owner-prompt rule 2); a `Director` role is the owner outright.

**Runs:** 2026-09-20 — Atlas Growth AU Maps run — scripts `registry_nsw.py` / `registry_wa.py` in the run folder,
functional probes passed (3 names each); bulk join pending the scrape. Named-rate contribution to be appended.
