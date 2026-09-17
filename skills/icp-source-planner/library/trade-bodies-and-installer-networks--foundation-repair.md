---
source: Trade bodies + manufacturer installer networks (UK: PCA, TBIC, ASUC, Newton/Delta/Helifix/Triton; US: NFRA, Supportworks, Basement Systems, Groundworks)
vertical: foundation repair / damp / structural waterproofing / underpinning contractors — company + EMAIL + phone + address
verdict: partial
last_validated: 2026-09-17
access: PCA = hidden JSON API (Tier 0, keyless); Supportworks = hidden JSON API (Tier 0, keyless); NFRA = public Google-Sheet CSV (Tier 0); TBIC = server HTML; ASUC/Newton/Delta = JS-rendered, not enumerated; Triton/Groundworks/Yell/Checkatrade = 403 from a datacentre egress
dispatch: web-scrape-triage
cost_tier: free
---

# Trade bodies + installer networks × foundation repair (UK + US)

**Why it matters:** a trade-body member list is the ICP by definition (a PCA "Damp Control / Structural
Waterproofing / Structural Repair" contractor IS the UK ICP), and the body publishes the member's **own filed
email** — the field Google Maps never carries and an on-site harvest reaches for ~54% of leads. Small
universes, near-perfect precision, emails for free. Use as the FIRST pass and as an email join onto a Maps run,
never as the only source (a Maps universe is 20-50× larger).

| Source | Reachable | What it gives | Volume | Email? |
|---|---|---|---|---|
| **PCA — Property Care Association (UK)** `property-care.org` | **YES**, hidden API, keyless | memberName, tradingName, memberCategory, skills[], **email**, phone1, website, fullAddress, cityTown, postalcode, county, linkedIn, googleBusiness, profile url | **457 members; 397 contractors; 290 with a Damp Control / Structural Waterproofing / Structural Repair skill** | **397/397 contractors (100%)**, 155 person-shaped |
| **Supportworks dealer network (US/CA)** `foundationsupportworks.com` | **YES**, hidden API on `hub.supportworks.com`, keyless | name, address, lat/lon, phone, url, hours, associations[] | **99 unique dealers** (164 state rows US, 18 CA, 1 ZA — multi-state dealers repeat) | no (site url → fetch-sites) |
| **NFRA — National Foundation Repair Association (US)** `foundationrepair.org` | **YES**, public Google-Sheet CSV behind the map | Business Name, Phone, Website, Street, City, State, Zip, Lat, Long, Renewal Date, status | **159 rows, 154 with website, 34 states** (mix of contractors + inspectors + suppliers; a `SUSPENDED` flag column) | no |
| **Basement Systems dealer network (US/CA/UK)** `basementsystems.com` | **YES**, server-rendered state pages, plain fetch | dealer name, service-area text, profile url (`data-company` id); the profile shows the NETWORK's 1-800 number and **no dealer website or email** → `name-to-domain` | **105 unique dealers** over 66 state/province pages (48 serve several states) | no |
| BHA — Basement Health Association (US) `basementhealth.org` | page 200, but the locator is a Bullseye Locations ASP.NET web-forms embed (postback, no client key in the page) | — | not enumerated | — |
| TBIC — The Basement Information Centre (UK) `basements.org.uk` | YES, server HTML | member list → profile page with website, phone, **one contact email** (e.g. `richard@…`) | small (tens; mostly suppliers/consultants + a few waterproofing contractors) | yes, per profile |
| ASUC — underpinning contractors (UK) `asuc.org.uk/search-members/` | page 200, list **not** in the HTML (WP member-directory plugin, `adn_md_action=filter_members` returns the empty shell) | — | ~100 members claimed | untested |
| Newton NSBC / Delta installers / Helifix installers (UK) | pages 200, but the installer list is a JS/map widget; no member links in the HTML | — | tens each | — |
| Triton (UK), Groundworks (US), Yell, Checkatrade | **403 / Cloudflare** from this egress | — | — | — |
| Facebook business pages | **400** on 3/3 from this egress; **through Firecrawl the page renders only the logged-out "This content isn't available right now" wall** — dead as a rung | — | — | — |
| Yell (UK) | Cloudflare 403 direct; **renders through Firecrawl (37 KB) with 0 emails** — Yell lists no addresses by design; Checkatrade likewise | — | — | no |

**Method (PCA):**
```
GET https://www.property-care.org/umbraco/api/pcamembersearch/search
    ?MapAlias=memberDirectoryItem&Count=50&Page=<n>&Latitude=54.5&Longitude=-2.5&SearchRadius=1000&SearchUnits=mi&sessionId=
Referer: https://www.property-care.org/member-search?mode=list   (a prior GET of that page sets the session)
```
Without Latitude/Longitude the API answers `resultCount: 0` (probe 1); with a UK-centre point and a 1000-mile
radius it returns every member, 50 per page (`resultCount 457`, pulled in 10 pages, all unique). Each hit is
`{title, url, location, position{lat,lng}, properties{…}}`. `memberCategory` and `skills` are LISTS. Filter
`memberCategory` contains `Contractor` and `skills` ∩ {Damp Control, Structural Waterproofing, Structural
Repair} for the foundation-repair ICP; `Invasive Weed Control` / `Flood` / `Spray Foam` are other trades.

**Method (Supportworks):**
```
GET https://hub.supportworks.com/ws/fetchData.php?data=statelist            → {countries[{regions[{name_abbr, dealers[{id,name}]}]}]}
GET https://hub.supportworks.com/ws/fetchData.php?data=dealerlist&state=VA  → [{id,name,location{address,position},phone,url,hours,associations,summary}]
GET https://hub.supportworks.com/ws/fetchData.php?data=dealer&dealerid=<id>
```
Found in the page's own `data.js`. 3-call probe: statelist 12.5 KB / VA 5 dealers / TX 2 dealers, <1 s each.

**Method (Basement Systems):** `GET https://www.basementsystems.com/basement-waterproofing/contractors.html` lists the state pages
(`/basement-waterproofing/<state>-<xx>.html`, 66); each carries `<div class="directory-dealers--company" data-company="<id>">`
blocks with the dealer name, a service-area paragraph and a profile link. Dedupe on `data-company`. 66 plain calls, ~1.5 s each.

**Method (NFRA):** the find-a-pro page fetches
`https://docs.google.com/spreadsheets/d/e/2PACX-1vRzHpuX4D5WiyB7Cpb0UGxBewE6PQeUA_xXPon2TdUIFJ2hmr6Cxvvx29EZ_EbHVPbpih6XVo8yXi5u/pub?gid=0&single=true&output=csv`
(the URL is in the page source; it can rotate — re-read the page before each pull). 159 rows.

**Measured against the Atlas Growth UK Maps run (860 worked leads):** 136 leads match a PCA contractor by
website host. **89 of those had no sendable email in our deliverable and PCA supplies one**; 7 more had only a
generic mailbox where PCA gives a person-shaped address; 39 PCA addresses are identical to ours. 42 ICP-skill
PCA contractors were not in the 22,193-row Maps universe at all (regional damp/preservation firms with weak Maps
presence). So on this vertical the PCA join is worth roughly +90 emails on the existing list and +42 companies,
for 11 free calls.

**Restrictions:** PCA data carries a `purchasedPostcodes` / `suppressedPostcode` block (the member pays for
listing areas) — the emails are business contact addresses the member chose to publish, but keep the pull
gitignored like every client list and verify before any send. Supportworks and NFRA give no email — they are
company/website feeds for `fetch-sites.js`.

**Gotchas:**
- PCA `memberCategory` is a list; `== 'Contractor'` matches nothing (bit us once — 0 overlap until fixed).
- PCA profile pages carry no mailto — the email is ONLY in the API payload.
- NFRA rows include inspectors, engineers and suppliers; qualify on name + website before treating as a
  contractor. A trailing unnamed column holds `SUSPENDED`.
- Supportworks: one dealer appears under every state it serves — dedupe on `id` (183 rows → 99).
- Everything Cloudflare-fronted (Checkatrade, Yell, Groundworks, Triton) needs the unlocker rung; nothing here
  replaces it.

**Runs:** 2026-09-17 — Atlas Growth — PCA 457 members pulled to
`clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/deliverable/pca_members_contractors.csv` (397
contractors, gitignored); Supportworks statelist + 2 states and NFRA sheet probed only, not joined.
