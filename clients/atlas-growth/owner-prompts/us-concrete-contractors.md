# Owner-prompt — Atlas Growth / US residential concrete contractors (driveways, patios, stamped)

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on 2026-11-11, for
`2026-11-11_us-concrete-contractors-yp`. Read by one Haiku reader per batch (`owner-read-subagent.md`). Everything
under "FIXED" is the template scaffold; DECISIONS, traps and few-shots are reasoned for this trade (adapted from the
pool-builder prompt of the same client: both are owner-operated home-improvement builders selling an in-home estimate).
Offer and contact rule come from `clients/atlas-growth/ICP-concrete.md` (operator-approved 2026-11-11).

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-11-11_us-concrete-contractors-yp**
> ICP business types: **contractors that pour residential flatwork — driveways, patios, walkways, pool decks, stamped /
> decorative concrete — for homeowners. Mostly owner-operated crews of 3-30; many also do foundations, slabs or masonry.**
> Offer (one line): **"We help concrete contractors book qualified in-home driveway and patio estimates using Facebook
> lead generation."**
> Target decision-maker(s) for this offer: **the owner** (in this trade the owner runs sales and the marketing budget);
> then a bare General Manager or a marketing lead if the firm is large enough to have one.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, president, CEO, proprietor, partner, principal, and an owner who also
>   estimates or pours ("Owner / Estimator", "Owner & Lead Finisher"). The owner is the budget.
> - `gm` — bare General Manager; Operations Manager ONLY at a one- or two-location firm.
> - `marketing` — marketing manager / director. Buyer or champion for a lead-generation offer.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found.
>
> EXCLUDE these roles — this trade's own field, estimating and admin staff; never output them:
> **estimator / sales estimator / sales representative / sales consultant / project consultant** (the in-home closer who
> runs the estimate being sold — they consume the leads, they do not buy them; an owner who ALSO estimates stays KEEP)
> · project manager · superintendent · foreman · crew lead · finisher / concrete finisher · form setter · laborer ·
> driver / mixer-truck driver / pump operator · equipment operator · mason · surveyor · dispatcher · scheduler ·
> CSR / customer care · bookkeeper · controller · HR · recruiter.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Production Manager`, `Sales Manager`,
> `Project Manager`, `Estimating Manager` are out.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox — acceptable because the offer
> still needs a human who routes it to the owner (ICP-concrete.md: "otherwise the company mailbox").
>
> Geography note (entity-match): leads are across ten US metros (Indianapolis IN, Charlotte NC, Phoenix AZ, Columbus OH,
> Kansas City MO, Tampa FL, Dallas TX, Atlanta GA, Denver CO, Minneapolis MN). Concrete-company names repeat across
> states ("Precision Concrete", "Elite Concrete", "Premier Concrete") — reject any contact whose result names a different
> city or state than this lead.

## Vertical-specific traps (read before extracting)

1. **A business name is not a person.** `Precision Concrete Works`, `Elite Decorative Concrete`, `Dream Driveways LLC` are
   companies. A candidate containing a trade word (Concrete, Cement, Paving, Pavers, Stamped, Decorative, Driveway,
   Patio, Flatwork, Masonry, Hardscape, Construction, Contractors, Services, Solutions, Company, Inc, LLC, Works,
   Crete, Coatings) is a company — drop it.
2. **The business name may BE the person**: `Hoffman Concrete` with "founded by Bill Hoffman in 1992" -> Bill Hoffman;
   `Dave Smith Concrete` -> Dave Smith. A surname match plus an owner word is an owner signal.
3. **Supplier, manufacturer and association people are not staff**: a Quikrete / Sika / Lafarge / Ready-mix rep, a
   decorative-concrete product trainer, an ACI / ASCC member quoted in an award post. Drop them.
4. **Licence lines name the qualifier**: "License #1234 - John Smith" names the licence holder; output as
   `owner_or_partner` ONLY when the text also calls them owner/president/founder.
5. **Reviews and galleries name crew** ("Mike and his crew poured our driveway", "Carlos did the stamping"). A first name
   in a review is never an owner.
6. **Reject departed people** ("former owner", "retired", "the late ...") and family-history lines
   ("second-generation") that name a family, not a current title.
7. **"Family owned and operated since 1985" names nobody.** Neither does "our team of experienced finishers".

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Gary Hunt",              // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Gary",
  "title":"President/Owner",        // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | office_manager | other
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"website",               // website | serp | web_search | companies_house
  "email":"" }

ONE reader prompt. Its inputs are `{{business_name}}`, `{{full_address}}`, `{{zip}}`,
`{{neighborhood}}`, `{{city}}`, `{{emails}}`, `{{ch_directors}}` (if present), `{{site_text}}`,
`{{serp_text}}` (the batch item's fields). Read ALL sources in one pass and return ONE deduped `contacts` array.

ROLE: extract EVERY named person whose role is in the job's KEEP set, corroborating across the
sources. We want MULTIPLE contacts. EXCLUDE the job's EXCLUDE roles. NEVER invent.

SOURCE PRIORITY (read in this order):
1. **`{{ch_directors}}` — registry, AUTHORITATIVE (when present).** Empty on this US run (no registry block injected) — skip it.
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other cities). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/president wording; OR the business name
contains their surname; OR they're the clearly lead/solo/most-prominent owner-operator.
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

**KEEP** — site text: `"Meet the Team: Rob Castillo, Owner & Lead Estimator ... Dana Castillo, Office Manager ... Kyle Brennan,
Sales Representative ... Luis Ortega, Crew Foreman"`
-> `[{"name":"Rob Castillo","first_name":"Rob","title":"Owner & Lead Estimator","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Rob Castillo, Owner & Lead Estimator","source":"website","email":""},
    {"name":"Dana Castillo","first_name":"Dana","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Dana Castillo, Office Manager","source":"website","email":""}]`
(Kyle Brennan is the in-home closer and Luis Ortega runs the pour — both excluded.)

**EXCLUDE** — serp text: `"Jenna Marks - Sales Estimator - Blue Ridge Concrete"` and `"Tom Reilly - Territory Manager at Sika"`
-> `[]`. The closer, and a manufacturer employee; neither is output.

**EMPTY** — site text: `"Family owned and operated since 1985. We pour driveways, patios and stamped concrete - call for a free estimate."`
-> `[]`. No person is named; "family owned" is not a name.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit owner/founder/president -> else gm -> else marketing -> else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present -> else the `{{emails}}` column -> else blank)
- best_website (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/`.gov`; blank if none clearly belongs to this business)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)

greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

**Merge note:** run `merge-owner-reads.js` with `--trade-words "concrete,cement,paving,pavers,stamped,decorative,driveway,driveways,patio,patios,flatwork,masonry,hardscape,works,crete,coatings,builders,custom,quality,premier,elite,precision"` and `--exclude-titles "estimator,sales,sales representative,sales consultant,project manager,production manager,superintendent,foreman,finisher,laborer,driver,operator,dispatcher,scheduler,csr,customer service,bookkeeper,controller,recruiter,former,retired"`.
