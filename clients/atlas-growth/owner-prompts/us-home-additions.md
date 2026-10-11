# Owner-prompt — Atlas Growth / US residential home addition contractors

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on
2026-10-11, for `2026-10-11_us-home-additions`. Read by one Haiku reader per batch
(`owner-read-subagent.md`). Everything below "FIXED" is the template scaffold; the DECISIONS, traps
and few-shots are reasoned for this trade. **Offer + target role PROPOSED 2026-10-11 (same buyer as the
pools / foundation-repair / generator prompts; designers and sales consultants excluded as the in-home
closer). Sign-off pending at the read-back.**

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-10-11_us-home-additions**
> ICP business types: **companies that design and build additions to existing single-family homes —
> room and bump-out additions, second-storey additions, garage additions and conversions, attached or
> detached in-law suites / ADUs, structural sunroom builders, and design-build remodelers whose services
> list additions; many also do kitchens, baths, whole-home remodels or custom homes.**
> Offer (one line): **"We help home addition contractors book 10 qualified in-home design consultations
> that turn into addition projects every month using Facebook lead generation."**
> Target decision-maker(s): **owner first; then a bare General Manager or the marketing lead** — the
> buyer is whoever controls marketing spend and lead flow (ICP-additions.md).
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, president, CEO, proprietor, partner, principal, and an
>   **owner who is also the lead designer, the licensed contractor or the lead carpenter** ("Owner &
>   Lead Designer", "Owner / Licensed General Contractor", "Owner-Builder"). Most of this trade is
>   owner-operated; the owner is the budget.
> - `gm` — bare General Manager; Operations Manager ONLY at a one- or two-location firm (there they are
>   the de-facto GM). A P&L holder can sign a lead-gen retainer.
> - `marketing` — marketing manager / director / VP of marketing. For a lead-generation offer at a
>   mid-size remodeler this is the buyer or the champion who brings it to the owner.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found.
>
> EXCLUDE these roles — this trade's own design/sales, production and admin staff; never output them:
> **designer / design consultant / architectural designer / staff architect / interior designer / sales
> consultant / design-sales / home consultant** (the in-home closer who runs the design consultation
> being sold — they consume the leads, they do not buy them) · estimator · project manager · production
> manager · construction manager · superintendent · site supervisor · foreman · lead carpenter / carpenter
> / framer / crew · trade subs (electrician, plumber, HVAC, drywall, roofer, painter) · selections
> coordinator · permit / plans coordinator · scheduler · warranty / service manager · dispatcher · CSR ·
> bookkeeper · controller · HR · recruiter.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Production Manager`,
> `Director of Design`, `VP of Construction`, `Service Manager` are all out.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox — acceptable
> because the offer still needs a human who routes it to the owner.
>
> Geography note (entity-match): leads are across the **US, warm states first** (HQ address). Remodeler
> names repeat across states ("Premier Remodeling", "Precision Construction", "Legacy Builders",
> "Craftsman Remodeling") — reject any contact whose result names a different city or state than this
> lead. For a branch of a franchise or multi-location remodeler (Case, DreamMaker, Alure …), output the
> corporate owner/leadership named on the shared site, not another branch's local manager.

## Vertical-specific traps (read before extracting)

1. **Association and award badges are not people.** "NARI Certified Remodeler (CR)", "NAHB Certified
   Graduate Remodeler (CGR)", "Master Certified Remodeler", "GuildQuality Guildmaster", "Qualified
   Remodeler Top 500", "Remodeling 550", "Chrysalis Award", "Houzz Best of" are credentials and lists.
   Never read "Master", "Guildmaster" or "Certified" as a name; keep CR/CGR/CKBR/CAPS as credentials in
   `title`, never in `name`.
2. **Licence lines name the qualifier, not always the owner.** "CGC1234567 – John Smith" (FL), "ROC
   #123456 Qualifying Party" (AZ), "CSLB B-123456" (CA), "RMO/RME" (CA) names the licence holder. Output
   as `owner_or_partner` ONLY when the text also calls them owner/president/founder; otherwise skip.
3. **Supplier and manufacturer staff appear on remodeler sites** — an Andersen / Marvin / James Hardie
   / Kohler rep quoted in a post, a Houzz or Angi account manager, a lender's loan officer on the
   financing page. They do not work for this business. Drop them.
4. **A business name is not a person.** `Legacy Home Additions`, `Craftsman Design Build`, `Summit
   Construction & Remodeling` are companies. A candidate containing a trade word (Addition, Additions,
   Remodel, Remodeling, Renovation, Renovations, Construction, Builders, Building, Design, Build,
   Homes, Home, Improvement, Contracting, Carpentry, Custom, Quality, Legacy, Premier, Summit,
   Company, Inc, LLC) is a company — drop it.
5. **The business name may BE the person**: `Hendricks Remodeling` with a site line "founded by Tom
   Hendricks in 1998" → Tom Hendricks; `J. Patrick Homes` → look for the full name on the About page.
   A surname match plus an owner word is an owner signal.
6. **Reviews and project galleries name designers, PMs and lead carpenters** ("Our designer Megan drew
   the plans", "Carlos and his crew framed the second floor"). A first name in a review is never an owner.
7. **Reject departed people** ("former owner", "retired", "founded by the late …") and the "second-
   generation" / "third-generation" line names the family, not a current title — output only a person
   the text gives a current role.
8. **"Family owned and operated since 1985" names nobody.** Neither does "our award-winning design team".
9. **Franchise sites** (DreamMaker, Case, Re-Bath, Mr. Handyman) often show the FRANCHISEE owner on a
   branch page ("Locally owned by …") — that is the right person for the branch; the HQ executives on
   the corporate footer are not.

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
   BBB principal block, a state licence-board block or the Qualified Remodeler `leadership` field is
   injected; a BBB `low_confidence` match is a CANDIDATE, not an answer. Tag `source:"companies_house"`.
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

**KEEP** — site text: `"Meet the Team: Mark Delgado, Owner & Licensed General Contractor ... Renee
Delgado, Office Manager ... Priya Shah, Design Consultant ... Luis Ortega, Production Manager"`
→ `[{"name":"Mark Delgado","first_name":"Mark","title":"Owner & Licensed General Contractor","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Mark Delgado, Owner & Licensed General Contractor","source":"website","email":""},
    {"name":"Renee Delgado","first_name":"Renee","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Renee Delgado, Office Manager","source":"website","email":""}]`
(Priya Shah is the in-home closer and Luis Ortega runs production — both excluded.)

**EXCLUDE** — serp text: `"Jenna Marks - Design Consultant - Summit Design Build"` and
`"Tom Reilly - Territory Sales Manager at Andersen Windows"` → `[]`. The closer, and a supplier
employee; neither is output.

**EMPTY** — site text: `"NARI Certified Remodeler. Family owned and operated since 1985. We design and
build room additions, second-story additions and whole-home remodels — schedule your free in-home
design consultation."` → `[]`. No person is named; the credential and "family owned" are not names.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit owner/founder/president → else gm → else marketing → else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present → else the `{{emails}}` column → else blank)
- best_website (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/aggregators (Houzz, Angi, BuildZoom, Porch)/`.gov`; blank if none clearly belongs to this business)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)

greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

**Merge note:** run `merge-owner-reads.js` with `--trade-words "addition,additions,remodel,remodeling,remodelers,renovation,renovations,construction,builders,building,design,build,homes,home,improvement,improvements,contracting,contractors,carpentry,custom,quality,legacy,premier,summit,company,inc,llc"` — the default list is foundation-repair's.
