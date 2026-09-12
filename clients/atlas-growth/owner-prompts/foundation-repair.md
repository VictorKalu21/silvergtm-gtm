# Owner-prompt — Atlas Growth / 2026-09-11_foundation-repair

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md`.
Runs as ONE Clay nano Claygent column, or as the in-session read over `prep-classify`-style
batches. Everything below the DECISIONS block is copied verbatim from the template scaffold.

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-09-11_foundation-repair**
> ICP business types: **residential foundation repair, basement waterproofing, crawl space
> repair & encapsulation, concrete leveling / mudjacking / slabjacking, house leveling,
> residential structural repair**
> Offer (one line): **"We help foundation repair companies book 10 qualified foundation
> inspection appointments that turn into repair projects every month using Facebook lead
> generation."**
> Target decision-maker(s): **owner / partner first; then GM, marketing lead, sales lead** —
> this offer is bought by whoever owns the inbound appointment pipeline.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, co-founder, president, proprietor, principal,
>   partner, CEO. In an owner-operator trade this is almost always the only budget holder.
> - `gm` — general manager, branch manager, operations manager, VP, COO. At the multi-branch
>   dealers (Basement Systems / Supportworks / Groundworks) the branch GM, not corporate, controls
>   local lead spend.
> - `marketing` — marketing manager/director, director of marketing. For a *lead-generation*
>   offer this is frequently the better first door than the owner, and the dealer-network rosters
>   publish them by name.
> - `sales_manager` — sales manager, director of sales, inside sales manager. They own what
>   happens to a booked inspection, so they feel the pain the offer addresses.
> - `office_manager` — SECONDARY only. Keep as a reachable human when nothing above is found;
>   they book the inspections but rarely authorise spend.
>
> EXCLUDE these roles — support/field staff for THIS trade, never output them:
> estimator · foundation technician · installer · crew lead · foreman · laborer · apprentice ·
> field inspector · structural technician · production manager · project manager · service
> technician · dispatcher · scheduler · CSR / customer care / customer relations specialist ·
> design specialist · home performance advisor · controller · accountant · bookkeeper ·
> recruiter · purchasing manager. These are the roles a generic prompt wrongly promotes to
> "owner" in this vertical — an estimator is the most common false positive.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox. Acceptable
> because the offer still needs a human who can route it to the owner.
>
> Geography note (entity-match): leads are in TX/KS/MO/OK/LA/MS/CO/GA/AL/AR plus retained US
> spillover. **This vertical is full of multi-branch companies whose names match EXACTLY across
> cities** — reject a contact whose result names a different city than this lead. Observed real
> failures: JES Virginia Beach returning the Manassas/Salem presidents; U.S. Waterproofing
> Schaumburg returning the Valparaiso IN owner; Crawlspace Medic Charlotte returning the
> Morrisville owner. Also reject the PARENT's corporate officers when the lead is a branch
> (Groundworks' CEO is not the Twinsburg branch's decision-maker).

## Vertical-specific traps seen in this run (read before extracting)

1. **"Family-owned since 1987" names nobody.** It is marketing copy. Do not infer an owner from it.
2. **A business name is not a person.** `Basement Waterproofing`, `Royal Foundation`,
   `Cascade Mudjacking` were all wrongly output as people by a regex pass. If the candidate name
   contains a trade word (Foundation, Waterproofing, Basement, Crawl, Concrete, Repair, Systems,
   Services, Solutions, Company, Team, Leveling, Mudjacking) it is a company — drop it.
3. **Branch rosters interleave a location between name and role**: "Paul Phillips Nashville General
   Manager" is Paul Phillips, GM (Nashville branch) — not "Phillips Nashville".
4. **"&" joins titles as well as couples**: "Steve Tetreault Owner & President" is one person;
   "Melanie & John Chaney President & Vice President" is two. A name never contains a role word.
5. **Reject departed people.** "Former CEO", "ex-", "retired" — a real observed title. Never output.
6. **Warranty and review boilerplate mentions "owner"**: "transfers to the next owner", "the owner
   is friendly" (a review). Neither names your contact.
7. **Third-party badges quote other companies' founders** — "Angie Hicks, Founder" on a contractor
   site is Angi's founder, not theirs.
8. **The business name may BE the person**: `Smouse Bros` -> Jess T Smouse; `King Piers` -> Jim King;
   `S.R. Waterproofing` -> Shawn Rust. A surname match in the business name is an owner signal.

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Gary Hunt",              // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Gary",
  "title":"President/Owner",        // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | sales_manager | office_manager | other
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"website",               // website | serp | companies_house
  "email":"" }

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

**KEEP** — site text: `"Melanie & John Chaney President & Vice President ... Jade Owens"`
→ `[{"name":"Melanie Chaney","first_name":"Melanie","title":"President","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Melanie & John Chaney President & Vice President","source":"website","email":""},
    {"name":"John Chaney","first_name":"John","title":"Vice President","role_bucket":"gm","is_likely_owner":false,"evidence":"Melanie & John Chaney President & Vice President","source":"website","email":""}]`

**EXCLUDE** — serp text: `"Matthew Stock - Home Services Executive | Former CEO"` and
`"Scott Leva - Estimator"` → `[]`. Departed exec and a field/sales support role; neither is output.

**EMPTY** — site text: `"We're a family-owned foundation repair company serving Houston since
2003. Call today for a free inspection."` → `[]`. No person is named; "family-owned" is not a name.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit owner/founder/president → else GM → else marketing → else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present → else the `{{emails}}` column → else blank)
- best_website (this business's OWN official domain; reject directories/social/trade-orgs)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)
