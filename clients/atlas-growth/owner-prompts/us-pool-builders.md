# Owner-prompt — Atlas Growth / US residential in-ground swimming-pool builders

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on
2026-10-11, for `2026-10-11_us-pool-builders`. Read by one Haiku reader per batch
(`owner-read-subagent.md`). Everything below "FIXED" is the template scaffold; the DECISIONS, traps
and few-shots are reasoned for this trade. **Offer + target role are PROPOSED (ICP-pools.md) until
the operator signs them off at the read-back gate.**

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-10-11_us-pool-builders**
> ICP business types: **companies that design, build and install new residential in-ground swimming
> pools — custom gunite/shotcrete/concrete builders, fiberglass pool installers (incl. installing
> manufacturer-dealer branches), vinyl-liner builders, pool construction companies; many also offer
> service, remodel or retail.**
> Offer (one line): **"We help swimming pool builders book 10 qualified in-home pool design
> consultations that turn into construction projects every month using Facebook lead generation."**
> Target decision-maker(s): **owner first; then a bare General Manager or the marketing lead** —
> the buyer is whoever controls marketing spend and lead flow (ICP-pools.md).
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, president, CEO, proprietor, partner, principal,
>   and an **owner who is also the lead designer or a licensed pool contractor** ("Owner & Lead
>   Designer", "Owner / Licensed Pool Contractor"). Most of this trade is owner-operated; the owner
>   is the budget.
> - `gm` — bare General Manager; Operations Manager ONLY at a one- or two-location firm (there they
>   are the de-facto GM). A P&L holder can sign a lead-gen retainer.
> - `marketing` — marketing manager / director / VP of marketing. For a lead-generation offer at a
>   mid-size builder this is the buyer or the champion who brings it to the owner.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found.
>
> EXCLUDE these roles — this trade's own design/sales, field and admin staff; never output them:
> **pool designer / design consultant / designer-sales / sales consultant / sales representative /
> outdoor living consultant** (the in-home closer who runs the design consultation being sold —
> they consume the leads, they do not buy them) · estimator · construction manager · project manager
> · superintendent · foreman · crew lead · excavation / gunite / shotcrete / plaster / tile / coping /
> deck / plumbing / electrical crew · pool technician / service technician / route technician / pool
> cleaner · warranty manager · scheduler · permit coordinator · dispatcher · CSR / customer care ·
> bookkeeper · controller · HR · recruiter.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Construction Manager`,
> `Director of Design`, `VP of Operations` at a multi-branch firm, `Service Manager` are all out.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox — acceptable
> because the offer still needs a human who routes it to the owner.
>
> Geography note (entity-match): leads are across the **US, warm states first** (HQ address). Pool
> builder names repeat across states ("Blue Water Pools", "Paradise Pools", "Aqua Pools", "Premier
> Pools") — reject any contact whose result names a different city or state than this lead. For a
> branch of a franchise or multi-location builder, output the corporate owner/leadership named on
> the shared site, not another branch's local manager.

## Vertical-specific traps (read before extracting)

1. **Manufacturer and supplier badges are not people.** "Latham Grand Dealer", "Leisure Pools
   Certified Installer", "Pentair Platinum Partner", "Hayward Totally Hayward", "Master Pools
   Guild member", "PHTA/APSP member", "Pebble Tec Premier Applicator" are tiers and memberships.
   Never read "Premier", "Grand" or "Master" as a name.
2. **Manufacturer and distributor staff appear on builder sites** — a Latham territory manager, a
   Pentair rep quoted in an award post, a Pool & Spa News writer. They do not work for this
   business. Drop them.
3. **Licence lines name the qualifier, not always the owner.** "CPC1234567 – John Smith" (FL) or a
   "Qualifying Individual" (CA/AZ ROC) names the licence holder. Output as `owner_or_partner` ONLY
   when the text also calls them owner/president/founder; otherwise treat as a field role and skip.
4. **A business name is not a person.** `Paradise Pools`, `Blue Water Pools & Spas`, `Aqua Design
   Pools`, `Backyard Oasis Construction` are companies. A candidate containing a trade word (Pool,
   Pools, Spa, Spas, Aquatic, Swim, Water, Backyard, Oasis, Paradise, Design, Designs, Custom,
   Construction, Builders, Outdoor, Living, Company, Inc, LLC) is a company — drop it.
5. **The business name may BE the person**: `Hoffman Pools` with a site line "founded by Bill
   Hoffman in 1992" → Bill Hoffman; `Dave Smith Custom Pools` → Dave Smith. A surname match plus an
   owner word is an owner signal.
6. **Reviews and project galleries name designers and techs** ("Our designer Kyle drew up a 3D
   rendering", "Mike's crew finished the plaster"). A first name in a review is never an owner.
7. **Reject departed people** ("former owner", "retired", "founded by the late …") and the
   "second-generation" line names the family, not a current title — output only a person the text
   gives a current role.
8. **"Family owned and operated since 1985" names nobody.** Neither does "our team of designers".

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Gary Hunt",              // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Gary",
  "title":"President/Owner",        // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | office_manager | other
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"website",               // website | serp | companies_house
  "email":"" }

ONE reader prompt. Its inputs are `{{business_name}}`, `{{full_address}}`, `{{zip}}`,
`{{neighborhood}}`, `{{city}}`, `{{emails}}`, `{{ch_directors}}` (if present), `{{site_text}}`,
`{{serp_text}}` (the batch item's fields). Read ALL sources in one pass and return ONE deduped `contacts` array.

ROLE: extract EVERY named person whose role is in the job's KEEP set, corroborating across the
sources. We want MULTIPLE contacts. EXCLUDE the job's EXCLUDE roles. NEVER invent.

SOURCE PRIORITY (read in this order):
1. **`{{ch_directors}}` — registry, AUTHORITATIVE (when present).** Empty on this US run unless a
   BBB principal block or a state licence-board block is injected; a BBB `low_confidence` match is a
   CANDIDATE, not an answer. Tag `source:"companies_house"`.
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other cities). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/president wording; OR the business name
contains their surname; OR they're the clearly lead/solo/most-prominent owner-builder.
Do not require the word "owner".

⚠️ ENTITY-MATCH (CRITICAL — read first): the search text often contains people from DIFFERENT
same-name businesses in OTHER cities. You are given the lead's full identity: `{{business_name}}`,
`{{full_address}}`, `{{zip}}`, `{{neighborhood}}`, `{{city}}`. **Only output a person whose result
corroborates THIS business** — the business name must closely match `{{business_name}}` AND the
location must be consistent. If a candidate's employer or city doesn't match this lead, DROP them.
Wrong owner is worse than no owner.

Guardrails (fixed): `name` = clean full name only · never truncate to first name · `evidence` MUST
be a verbatim quote containing the person's name (no quote with the name → don't output them) · the
candidate must pass ENTITY-MATCH · NEVER invent a name, title, or email · if the business name IS a
person's name, output that person, evidence = the business name.

## Few-shots (this vertical's real roles)

**KEEP** — site text: `"Meet the Team: Rob Castillo, Owner & Lead Designer ... Dana Castillo, Office
Manager ... Kyle Brennan, Design Consultant ... Luis Ortega, Construction Superintendent"`
→ `[{"name":"Rob Castillo","first_name":"Rob","title":"Owner & Lead Designer","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Rob Castillo, Owner & Lead Designer","source":"website","email":""},
    {"name":"Dana Castillo","first_name":"Dana","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Dana Castillo, Office Manager","source":"website","email":""}]`
(Kyle Brennan is the in-home closer and Luis Ortega runs the build — both excluded.)

**EXCLUDE** — serp text: `"Jenna Marks - Pool Designer / Sales Consultant - Blue Water Pools"` and
`"Tom Reilly - Territory Manager at Latham Pool Products"` → `[]`. The closer, and a manufacturer
employee; neither is output.

**EMPTY** — site text: `"Latham Grand Dealer. Family owned and operated since 1985. We design and
build custom gunite and fiberglass pools — schedule your free in-home design consultation."`
→ `[]`. No person is named; the dealer tier and "family owned" are not names.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit owner/founder/president → else gm → else marketing → else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present → else the `{{emails}}` column → else blank)
- best_website (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/manufacturer dealer-locator pages/`.gov`; blank if none clearly belongs to this business)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)

greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

**Merge note:** run `merge-owner-reads.js` with `--trade-words "pool,pools,spa,spas,aquatic,aquatics,swim,swimming,water,backyard,oasis,paradise,design,designs,custom,construction,builders,outdoor,living,company,inc,llc,blue,aqua"` — the default list is foundation-repair's.
