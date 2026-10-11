# Owner-prompt — Atlas Growth / US residential water / mold / fire restoration contractors

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on
2026-10-11, for `2026-10-11_us-restoration-remediational`. Read by one Haiku reader per batch
(`owner-read-subagent.md`). Everything below "FIXED" is the template scaffold; the DECISIONS, traps
and few-shots are reasoned for this trade. **Offer + target role PROPOSED (ICP-restoration-us.md);
the trade-specific exclusion is the restoration "marketing rep" — a route-sales role, never a buyer.**

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-10-11_us-restoration-remediational**
> ICP business types: **companies that perform water damage restoration, mold remediation, fire /
> smoke restoration, sewage / biohazard cleanup or storm damage repair for homeowners — independents
> and franchise branches (SERVPRO, ServiceMaster, PuroClean, Paul Davis, 911 Restoration …); many also
> do reconstruction, contents cleaning or commercial work.**
> Offer (one line): **"We help restoration companies book 10 qualified mold and water damage
> inspection appointments that turn into remediation projects every month using Facebook lead
> generation."**
> Target decision-maker(s): **owner first; then a bare General Manager or the marketing lead** —
> the buyer is whoever controls marketing spend and lead flow (ICP-restoration-us.md).
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, president, CEO, proprietor, partner, principal,
>   **franchise owner / owner-operator of a branch** ("Owner, SERVPRO of North Dayton"), and an owner
>   who is also the certified technician ("Owner & IICRC Master Restorer"). Most of this trade is
>   owner-operated; the owner is the budget.
> - `gm` — bare General Manager; Operations Manager ONLY at a one- or two-location firm (there they
>   are the de-facto GM). A P&L holder can sign a lead-gen retainer.
> - `marketing` — **Marketing Manager / Director of Marketing / VP of Marketing** ONLY. For a
>   lead-generation offer at a mid-size restorer this is the buyer or the champion. See the trap:
>   a "Marketing Representative" is NOT this bucket.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found.
>
> EXCLUDE these roles — this trade's own sales, field and admin staff; never output them:
> **Marketing Representative / Marketing Rep / Business Development Representative / BDR / Account
> Manager / Route Marketer** (in restoration this is the person who drives to plumbers, adjusters and
> property managers for referrals — they consume leads, they do not buy them) · Estimator · Project
> Manager · Mitigation Manager · Reconstruction Manager · Production Manager · Contents Manager ·
> Crew Chief · Lead Technician · Water / Mold / Fire / Biohazard Technician · IICRC-certified tech
> lines · Safety Manager · Warranty / Quality Manager · Scheduler · Dispatcher · CSR / customer care ·
> Bookkeeper · Controller · HR · Recruiter · any insurance adjuster, agent or inspector quoted on the site.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Mitigation Manager`,
> `Director of Operations` at a multi-branch firm, `Service Manager`, `Director of Business
> Development` are all out.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox — acceptable
> because the offer still needs a human who routes it to the owner.
>
> Geography note (entity-match): leads are across the **whole US** (HQ address, 506 metros).
> Restoration names repeat endlessly across states ("Flood Force", "Dry Pros", "Rapid Response
> Restoration", "All Dry", and every franchise brand) — reject any contact whose result names a
> different city or state than this lead. For a franchise branch, output the **branch owner /
> franchisee** named on the branch page, never the franchisor's corporate executives on the shared
> brand site; if the brand site names nobody for this branch, output `[]`.

## Vertical-specific traps (read before extracting)

1. **Franchise brand sites name corporate people.** servpro.com, servicemasterrestore.com,
   puroclean.com carry the franchisor's CEO / CMO and press quotes. They do not own this branch.
   Only a person the text ties to THIS branch's city ("Owner of SERVPRO of Northwest Dayton") is output.
2. **Certification badges are not people.** "IICRC Certified Firm", "WRT / ASD / AMRT", "Lead-Safe
   Certified", "BBB Accredited", "RIA member", "Xactimate" are credentials and memberships. Never read
   "Master", "Certified" or "Lead" as a name.
3. **Insurance people appear on restoration sites** — a State Farm agent in a testimonial, an
   adjuster in a case study, a plumber "we partner with". They do not work for this business. Drop them.
4. **The "marketing rep" trap.** "Meet Dana, our Marketing Representative" is route sales → EXCLUDE.
   Only a Marketing Manager / Director / VP is `marketing`.
5. **A business name is not a person.** `Flood Force`, `Dry Pros Restoration`, `Pure Air Mold
   Removal` are companies. A candidate containing a trade word (Restoration, Restore, Remediation,
   Mold, Water, Fire, Flood, Dry, Damage, Cleanup, Clean, Pro, Pros, Environmental, Services,
   Solutions, Company, Inc, LLC, Group, Team, Emergency, Rapid, Response) is a company — drop it.
6. **The business name may BE the person**: `Hoffman Restoration` with "founded by Mike Hoffman in
   2004" → Mike Hoffman; `Dave Smith Water Damage` → Dave Smith. A surname match plus an owner word
   is an owner signal.
7. **Reviews and job stories name technicians** ("Luis and his crew dried out our basement"). A first
   name in a review is never an owner.
8. **Reject departed people** ("former owner", "retired", "founded by the late …"). "Family owned
   and operated since 1998" names nobody; neither does "our team of certified technicians".
9. **Licence lines name the qualifier, not always the owner** (TX mold remediation licence, FL
   mold remediator MRSR, state contractor licence "RMO / qualifying party"). Output as
   `owner_or_partner` ONLY when the text also calls them owner / president / founder.

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

**KEEP** — site text: `"Meet Our Team: Rob Castillo, Owner & Certified Master Restorer ... Dana
Castillo, Office Manager ... Kyle Brennan, Marketing Representative ... Luis Ortega, Mitigation Manager"`
→ `[{"name":"Rob Castillo","first_name":"Rob","title":"Owner & Certified Master Restorer","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Rob Castillo, Owner & Certified Master Restorer","source":"website","email":""},
    {"name":"Dana Castillo","first_name":"Dana","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Dana Castillo, Office Manager","source":"website","email":""}]`
(Kyle Brennan is route sales and Luis Ortega runs the crews — both excluded.)

**KEEP (franchise branch)** — site text: `"SERVPRO of Northwest Dayton is locally owned and operated
by Mark and Jill Reed. Mark, Owner, has 15 years in the industry."` → `[{"name":"Mark Reed","first_name":"Mark","title":"Owner","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"operated by Mark and Jill Reed. Mark, Owner","source":"website","email":""},{"name":"Jill Reed","first_name":"Jill","title":"Owner","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"operated by Mark and Jill Reed","source":"website","email":""}]`

**EXCLUDE** — serp text: `"Jenna Marks - Marketing Representative - Rapid Response Restoration"` and
`"Tom Reilly - Senior Claims Adjuster, State Farm"` → `[]`. The route-sales rep, and an insurer's employee.

**EMPTY** — site text: `"IICRC Certified Firm. Family owned and operated since 1998. 24/7 emergency
water damage restoration — we work directly with your insurance company."` → `[]`. No person is named.

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

**Merge note:** run `merge-owner-reads.js` with `--trade-words "restoration,restore,restoration,remediation,mold,mould,water,fire,flood,dry,damage,cleanup,clean,pro,pros,environmental,services,solutions,company,inc,llc,group,team,emergency,rapid,response,servpro,servicemaster,puroclean"` — the default list is foundation-repair's.
