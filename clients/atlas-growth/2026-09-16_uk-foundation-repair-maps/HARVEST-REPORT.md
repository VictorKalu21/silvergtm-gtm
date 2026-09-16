# Deep on-site email harvest — atlas-growth UK foundation-repair Maps run (2026-09-16)

`harvest_emails_deep.py` — free site fetches only. No scraper.tech, no finder API, no verification
credits, no Firecrawl, no Scrapling. Data files (`owner/emails_deep.jsonl`, the contacts CSVs and
their `*.pre-deep.csv` backups) are gitignored; only this report and the script are committed.

## Why the engine's harvest was thin

This scrape carries no Maps email column, so every address comes from the on-site harvest in
`skills/google-maps-scrape/fetch-sites.js`. That harvest runs a plain regex over the page text
*after* `htmlToText()` — which deletes `<script>` blocks and every tag, i.e. every attribute.
So four whole classes of address were invisible to it, and a fifth was never fetched:

| miss | why |
|---|---|
| `mailto:` href | it is an attribute; the `<a>` tag is gone before the regex runs |
| JSON-LD `"email"` | lives in `<script type="application/ld+json">`, which `htmlToText` strips |
| Cloudflare `data-cfemail` | XOR-encoded hex attribute; the visible text is `[email protected]` |
| `<span>@</span>` splits, `&#64;`, `[at]`, zero-width chars | broken before the regex ever sees an `@` |
| the contact page | `fetch-sites.js`'s L2 keyword list is owner-finding oriented (about/team/meet/…). `contact`, `contact-us`, `get-in-touch`, `enquir` are **not** in it — and that is where a UK trades site puts its email |

## Probe (3-call rule), 2026-09-16 — the extractor on 3 live list sites

    === https://khbpiling.co.uk/   (root_domain=khbpiling.co.uk)
      home: status=200 bytes=256209 | contact-like links: /contact-us/, /about-us/ (200, 200)
        info@khb-piling.co.uk                  mailto     drop (other_domain — sibling domain, see residue)
      what the ENGINE text-regex rung alone would have seen: NOTHING

    === http://www.piledsolutions.co.uk/   (root_domain=piledsolutions.co.uk)
      home: status=200 bytes=49129 -> https://www.piledsolutions.co.uk/ | contact-us.html (200)
        info@piledsolutions.co.uk              cfemail    KEEP (own)
      what the ENGINE text-regex rung alone would have seen: NOTHING

    === https://southwestunderpinning.co.uk/   (root_domain=southwestunderpinning.co.uk)
      home: status=200 bytes=186906 | /contact-us, /about-us (200, 200)
        info@southwestunderpinning.co.uk       jsonld     KEEP (own)
      what the ENGINE text-regex rung alone would have seen: NOTHING

Three sites, three different rungs, and the engine's rung returned nothing on all three.

Second probe — **is a curl_cffi rung worth adding for the 403s?** No:

    groundworksconstructionlondon.co.uk   requests (403, 5753 B)   curl_cffi impersonate=chrome (403, 6031 B)
    minipilingsystems.co.uk               requests (202,  169 B)   curl_cffi impersonate=chrome (202,  169 B)
    groundworkcompanies.co.uk             requests (403, 5743 B)   curl_cffi impersonate=chrome (403, 6000 B)

TLS/JA3 impersonation clears none of them — the same result `RUN-NOTES.md` got on petercox/timberwise.
So there is no fallback rung here: a 403/challenge is recorded and skipped. Nothing is lost by that,
because the merge **unions** the deep emails with the old site emails; a failed re-fetch leaves the
row exactly as it was.

Sanity check on the ported `shared-hosts.js` suffix test: it agrees with the engine's own
`website_class` and `root_domain` columns on all 813 websites in the two files, 0 mismatches.

## Targets and fetch outcomes

784 leads have a website that is not a shared host -> **676 unique root domains** fetched
(one fetch per root domain: `collapse-domains.js` already paid for one fetch per domain and a branch
row reads its representative — same domain, same mailbox). Priority order: no email (303 domains),
free-mail/third-party only (98), already has a generic own-domain address (245 — a person-shaped
address on the contact page beats `info@`, and the Plusvibe name rule only names a row when the
local part is the person's).

| domain-level outcome | n |
|---|---|
| ok | 562 |
| home_failed:403 | 70 |
| home_failed:ERR:ReadTimeout | 13 |
| home_failed:ERR:ConnectionError | 9 |
| home_failed:404 | 6 |
| home_failed:ERR:ProxyError | 6 |
| home_failed:401 | 4 |
| home_failed:500 | 3 |
| home_failed:ERR:SSLError | 2 |
| home_failed:426 | 1 |
| **total** | **676** |

1,523 page requests: 1,355× 200, 78× 403, 32× 202 (JS shells), 16× 404, 14 read timeouts,
10 connection errors, 6 proxy errors, 5× 401, 3× 500, 2 SSL, 1 challenge, 1× 426.
2.45 pages per reachable domain (homepage + the contact-like pages, cap 5).

## Emails found, by source

494 addresses kept over 422 domains. `mailto` dominates because it is first in the provenance
order — an address that appears both as a `mailto` and in the text is credited to `mailto`.
The load-bearing column is the second one: addresses the engine's output did **not** contain.

| source | kept | of which new to this run |
|---|---|---|
| mailto | 335 | 49 |
| tag_split (`<span>@</span>`, `&#64;`, `[at]`) | 78 | 19 |
| cfemail (Cloudflare XOR) | 48 | **48** |
| jsonld | 29 | 19 |
| raw_html (attribute / inline JS blob) | 2 | 2 |
| entity | 2 | 0 |
| **total** | **494** | **137** |

Every single Cloudflare-obfuscated address was new — that rung is pure gain by construction, since
the engine can only ever see the `[email protected]` placeholder.
119 domains gained at least one address the engine never had.

Rejected at harvest time (stageC's own rules, applied before ranking): 280 junk (image/CDN/vendor),
109 other-domain, 21 BAD-regex, 4 third-party.

## Before / after coverage

| segment | rows | email before | email after | person-shaped | own-domain |
|---|---|---|---|---|---|
| `leads_qualified_contacts.csv` (ICP) | 686 | 240 (35.0%) | **314 (45.8%)** | 6 -> 11 | 175 -> 231 |
| `leads_damp_only_contacts.csv` | 174 | 116 (66.7%) | **145 (83.3%)** | 2 -> 3 | 82 -> 99 |
| both | 860 | 356 (41.4%) | **459 (53.4%)** | 8 -> 14 | 257 -> 330 |

+103 leads now have a sendable address (+74 ICP, +29 damp-only), person-shaped addresses nearly
double (8 -> 14), own-domain addresses +73.

109 rows changed their winning email; 103 of them had none before. The winning-email source mix on
those rows: mailto 34, cfemail 47, jsonld 18, tag_split 8, raw_html 2.

Merge integrity: both files keep all 686 / 174 rows and every original column, plus one new column
`email_deep_source`. Across all 860 rows, **zero non-email cells changed**. Originals are kept as
`leads_qualified_contacts.pre-deep.csv` / `leads_damp_only_contacts.pre-deep.csv`.

### 10 examples (business -> email -> source)

    Piled Solutions Ltd                      info@piledsolutions.co.uk             cfemail    was (none)
    Prime Piling                             info@primepiling.co.uk                jsonld     was (none)
    JPD Developments Ltd                     lisa.jpdltd@gmail.com                 cfemail    was (none)
    SW Underpinning & Piling Solutions Ltd   info@southwestunderpinning.co.uk      jsonld     was (none)
    Crownstone Construction                  hello@crownstonegroup.co.uk           mailto     was (none)
    London Elite Trades Ltd                  info@londonelitetrades.co.uk          cfemail    was (none)
    Crownstone Group                         hello@crownstonegroup.co.uk           mailto     was (none)
    Crystal Damp Proofing & Basements Ltd    info@crystaldampproofing.co.uk        cfemail    was (none)
    Pro Sage Damp Proofing                   prosagedampproofing@hotmail.com       jsonld     was (none)
    Anglian Preservation                     dave.anglian4@gmail.com               mailto     was (none)

## A different own-domain address than the one already there

18 leads already had an own-domain address and the deep harvest found a **second** own-domain
address on the same site. The replicated ranking chose the **existing** one in all 18 — the new
finds are departmental boxes (`tenders@`, `bookings@`, `surveys@`, `pumps@`, a branch `swansea@`),
which score below a named generic. **0 own-domain swaps.** They are all still in `all_emails` /
`site_emails_all` if the operator wants a second address per company. Examples:

    Wing Waterproofing            info@wingwaterproofing.co.uk   + pumps@wingwaterproofing.co.uk    [mailto]
    Cemplas Waterproofing         info@cemplas.co.uk             + tenders@cemplas.co.uk            [mailto]
    Falcon Structural Repairs     rking@falconstructural.co.uk   + jim@ , sjoyner@falconstructural  [mailto]
    Maljon (Timber Preservation)  office@maljon.co.uk            + jean@ , kelsey@maljon.co.uk      [mailto]
    Atkins Wallcare               info@atkinswallcare.co.uk      + garry@atkinswallcare.co.uk       [mailto]

Note `Falcon` / `Maljon` / `Atkins` / `Yorkshire Damp Solutions`: the deep harvest surfaced
first-name mailboxes (`jim@`, `jean@`, `garry@`, `paul@`) that stageC's `name_from_local` does not
score as person-shaped (it requires `first.last` or `f.last` with a separator), so `info@` keeps the
row. Those are the best owner-outreach candidates in the file and the model read at STEP 6 should
see them.

## 6 rows whose EXISTING email was replaced — eyeball these two

    S P S Midlands            spsmidlands@gmail.com     (other)   -> enquiries@spsmidlands.co.uk        (generic) [jsonld]
    Alliance Rose Piling      tarpiling@gmail.com       (other)   -> info@alliancerosepiling.co.uk      (generic) [mailto]
    Ranguard                  ranguard.co.uk@gmail.com  (other)   -> info@ranguard.co.uk               (generic) [mailto]
    North Coast Damp Proofing ncdp@hotmail.co.uk        (other)   -> info@northcoastdampproofing.com    (generic) [tag_split]
    --- the two worth a human look (the replicated stageC rule, faithfully applied): ---
    BullNose Brickwork        bullnosebrickwork@gmail.com -> albion.groundworkers@gmail.com  (scored "person") [mailto]
    Russell Preservation      info@russellpreservation.co.uk (own generic) -> russell.pres@btconnect.com (scored "person") [mailto]

The first four are unambiguous upgrades (free-mail -> own domain). The last two are stageC's
`person > generic` rule doing what it says: any dotted local part counts as `first.last`, so
`albion.groundworkers` and `russell.pres` outrank an own-domain `info@`. The ranking was replicated
verbatim on purpose, so this is the existing rule's behaviour, not a new one — but it is the rule to
revisit before a send.

## Residue and write-back candidates (engine, not this run script)

1. **Sibling-domain rejects — 10 leads end with nothing because their only address is on an obvious
   sibling domain**: `khbpiling.co.uk` -> `info@khb-piling.co.uk`, `dc-edney.co.uk` ->
   `enquiries@dcedney.co.uk`, `telforddampproofing.com` -> `info@telforddampproofing.co.uk`,
   `tflower.uk` -> `info@tflower.co.uk`, `renlon.co.uk` -> `survey@renlon.com`, and 5 more. stageC's
   own-domain test is exact-or-subdomain, so a hyphen or a `.com`/`.co.uk` twin reads as third-party
   and is dropped. A normalised comparison (strip hyphens, allow the same second-level label across
   `.co.uk`/`.com`) would recover all 10, and is worth an `IMPROVEMENTS.md` entry + a test rather
   than another run script.
2. **The extraction rungs themselves belong in `fetch-sites.js`** (`emailsIn` over raw HTML, plus
   `contact|get-in-touch|enquir` in the L2 keyword list) — the gain here is engine-shaped, not
   job-shaped: 137 addresses and +103 leads on one list.
3. **70 domains 403** and stay 403 from this egress (probe above). They need a different rung
   (Firecrawl / a residential unlocker) or a different source, not another free attempt.
4. One extraction defect found and fixed mid-run: a `tag_split` match over an inline JS blob
   swallowed a `>` escape body and produced `u003eenquiries@…` (1 occurrence, never won a row).
   `_clean()` now strips the residue, and the merge re-cleans on load so the fix landed without
   re-paying for the fetches.
