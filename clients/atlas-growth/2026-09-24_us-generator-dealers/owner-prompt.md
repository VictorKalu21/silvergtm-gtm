# Owner-prompt — Atlas Growth / US residential generator installers

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on
2026-09-24, for `2026-09-24_us-generator-dealers` (OEM dealer lists + Google Maps, one back half).
Read by one Haiku reader per batch (`owner-read-subagent.md`). Everything below "FIXED" is the
template scaffold; the DECISIONS, traps and few-shots are reasoned for this trade.

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-09-24_us-generator-dealers**
> ICP business types: **residential home-standby generator dealers and installers (Generac, Kohler/
> Rehlko, Briggs & Stratton, Champion, Cummins), and electrical contractors — occasionally HVAC or
> plumbing firms — that sell and install home standby generators as a real service line**
> Offer (one line): **"We help generator installation companies book 10 qualified generator estimate
> appointments that turn into install projects every month using Facebook lead generation."**
> Target decision-maker(s): **owner first; then a bare General Manager or the marketing lead** —
> the buyer is whoever controls marketing spend and lead flow (ICP-generators.md).
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — owner, co-owner, founder, president, CEO, proprietor, partner, principal,
>   and a **master electrician who is also the owner** ("Owner & Master Electrician"). Most of this
>   trade is owner-operated electrical shops; the owner is the budget.
> - `gm` — bare General Manager; Operations Manager ONLY at a one- or two-location firm (there they
>   are the de-facto GM). A P&L holder can sign a lead-gen retainer.
> - `marketing` — marketing manager / director / VP of marketing. For a lead-generation offer at a
>   mid-size dealer this is the buyer or the champion who brings it to the owner.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found.
>
> EXCLUDE these roles — this trade's own field, sales and admin staff; never output them:
> generator technician · service technician · installer · electrician / journeyman / apprentice
> (when not also named owner) · master electrician (when not also named owner) · field supervisor ·
> foreman · crew lead · **estimator** · **generator specialist / generator consultant / energy advisor
> / home energy consultant / sales consultant / sales representative** (the in-home closer who runs
> the estimate appointment — they consume the leads, they do not buy them) · sales manager ·
> project manager · service manager · warranty coordinator · parts manager · dispatcher · scheduler ·
> CSR / customer care · permit coordinator · bookkeeper · controller · HR · recruiter.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Service Manager`,
> `VP of Operations` at a multi-branch firm, `Director of Installations` are all out.
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox — acceptable
> because the offer still needs a human who routes it to the owner.
>
> Geography note (entity-match): leads are across the **US, nationwide** (HQ address). Generator
> dealer names repeat across states ("Power Solutions", "Generator Pros", "Superior Electric",
> "All Pro Electric") — reject any contact whose result names a different city or state than this
> lead. For a branch of a multi-location dealer, output the corporate owner/leadership named on the
> shared site, not another branch's local manager.

## Vertical-specific traps (read before extracting)

1. **OEM badges are not people.** "Generac PowerPRO Premier Dealer", "Kohler Titanium Dealer",
   "Briggs Elite IQ Installer" are dealer tiers. Never output them, and never read "Premier" or
   "Elite" as a name.
2. **Manufacturer and distributor staff appear on dealer sites** — a Generac territory manager, a
   Kohler regional rep, a distributor's sales rep quoted in a testimonial or award post. They work
   for the OEM, not this business. Drop them.
3. **License lines name the licence holder, not always the owner.** "Master Electrician License
   #12345 – John Smith" names the qualifier. Output him as `owner_or_partner` ONLY when the text
   also calls him owner/president/founder; otherwise he is an EXCLUDE-list electrician.
4. **A business name is not a person.** `Generator Pros`, `Superior Electric`, `Power Solutions`,
   `Standby Power Systems` are companies. A candidate containing a trade word (Electric, Electrical,
   Generator(s), Power, Energy, Solutions, Systems, Services, Home, Standby, Backup, Company) is a
   company — drop it.
5. **The business name may BE the person**: `Mike Smith Electric` -> Mike Smith; `Jones Generator
   Service` with a site line "founded by Dale Jones" -> Dale Jones. A surname match plus an owner
   word is an owner signal.
6. **Reviews name technicians and salespeople** ("Tony did a great job installing our Generac",
   "Our generator consultant Beth was very helpful"). A first name in a review is never an owner.
7. **Reject departed people** ("former owner", "retired", "founded by the late …").
8. **Storm-season copy mentions "homeowner" constantly** — "every homeowner deserves backup power"
   names nobody.

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
   state licence-board block is injected; skip it when empty. Tag `source:"companies_house"`.
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other cities). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/president wording; OR the business name
contains their surname; OR they're the clearly lead/solo/most-prominent owner-electrician.
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

**KEEP** — site text: `"Meet the Team: Rick Delgado, Owner & Master Electrician ... Tanya Delgado,
Office Manager ... Chris Webb, Generator Technician"`
→ `[{"name":"Rick Delgado","first_name":"Rick","title":"Owner & Master Electrician","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Rick Delgado, Owner & Master Electrician","source":"website","email":""},
    {"name":"Tanya Delgado","first_name":"Tanya","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Tanya Delgado, Office Manager","source":"website","email":""}]`
(Chris Webb is a technician — excluded.)

**EXCLUDE** — serp text: `"Jason Hill - Generator Sales Consultant - Premier Power Systems"` and
`"Laura Price - Territory Sales Manager at Generac Power Systems"` → `[]`. The in-home closer, and
an OEM employee; neither is output.

**EMPTY** — site text: `"Authorized Generac PowerPRO Elite Dealer. Family owned and operated since
1998. Protect your home with a whole-house standby generator — call for a free in-home estimate."`
→ `[]`. No person is named; the dealer tier and "family owned" are not names.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit owner/founder/president → else gm → else marketing → else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present → else the `{{emails}}` column → else blank)
- best_website (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/OEM dealer pages/`.gov`; blank if none clearly belongs to this business)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)

greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

**Merge note:** run `merge-owner-reads.js` with `--trade-words "electric,electrical,generator,generators,power,energy,standby,backup,solutions,systems,services,company,inc,llc,home,pros"` — the default list is foundation-repair's.
