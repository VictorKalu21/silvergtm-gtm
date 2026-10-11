# Owner-prompt — Atlas Growth / UK residential home-extension contractors (house extensions · loft conversions · garage conversions · design-and-build)

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md`.
Applied by one Haiku subagent per `batch-<N>-in.json` (`owner-read-subagent.md`), and by the
web-search sweep (`owner-sweep-subagent.md`) on the leads that stay unnamed. Everything below the
DECISIONS / Companies House / traps blocks is copied verbatim from the template scaffold.

Sources for the filled slots: `clients/atlas-growth/ICP-extensions-uk.md` (offer + target role,
PROPOSED at GATE 1 2026-10-11), `clients/atlas-growth/ICP-uk.md` (the UK title mapping and the
three operator decisions on surveyor / site manager / contracts manager, carried over unchanged),
`clients/atlas-growth/owner-prompts/foundation-repair-roles.md` (the KEEP/EXCLUDE buckets with UK
notes), and `skills/icp-source-planner/library/google-maps--uk-foundation-repair.md` (measured UK
yields: own site names someone on ~4% of UK trade sites, Companies House on 64%).

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-10-11_uk-home-extensions-maps**
> ICP business types: **UK residential building firms that design and/or build home extensions
> (single- and double-storey rear and side extensions, side returns, wrap-arounds, kitchen
> extensions), loft conversions (dormer, hip-to-gable, mansard, Velux), garage and basement
> conversions, and design-and-build firms that sell the whole project to a homeowner · plus
> general builders and renovation firms with a real extensions line**
> Offer (one line, PROPOSED — same family as the foundation / generator / pool offers, reworded
> for the trade): **"We help home extension builders book 10 qualified extension design
> consultations that turn into build projects every month using Facebook lead generation."**
> Target decision-maker(s): **Managing Director / Director / Owner / Proprietor / Sole Trader /
> Partner first; then a General Manager, Operations Director or Construction Director; then the
> marketing lead; then a Sales or Commercial Director** — this offer is bought by whoever owns
> the marketing spend and the enquiry diary, not by whoever runs the site, not by whoever draws
> the plans, and not by whoever performs the free design visit.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — **Managing Director (MD)**, **Director**, **Company Director**, Owner,
>   Co-Owner, Proprietor, **Sole Trader**, Founder, Co-Founder, **Partner**, Principal, Chairman,
>   CEO. The UK prize bucket, and where nearly every name on this list will land. *Why:* a UK
>   extension builder is typically a 2-to-15-person owner-operated limited company; the MD **is**
>   the marketing budget. "Director" is also the Companies House title, so the registry hands us
>   this bucket at $0 — on the last UK run it named the decision-maker for 64% of the list where
>   the firms' own websites named somebody on ~4%. Sole traders are common in this trade and their
>   trading name is often their own name ("P J Harrison Builders").
> - `gm` — General Manager, **Operations Director**, Operations Manager, **Construction
>   Director**, **Branch Manager** (roll-up branches only). A P&L holder at an independent or a
>   branch of a small network. At a 10-person design-and-build firm the "Construction Director" is
>   usually a co-owner; keep them, rank below the MD.
> - `marketing` — Marketing Manager, **Marketing Director**, **Head of Marketing**, Director of
>   Marketing. For a lead-generation offer this is often the better first door at a mid-size firm,
>   or the champion who carries it to the MD.
> - `sales_manager` — **Sales Director**, **Commercial Director**, Business Development Manager,
>   Sales Manager. At this size these are board-level revenue owners, not the in-home closer the
>   US prompt excludes. Keep, never in preference to a director.
> - `office_manager` — SECONDARY ONLY. A reachable human when nothing above is found. They book the
>   design visits; they do not authorise spend.
>
> EXCLUDE these roles — they cannot authorise the offer and a small model will mistake them for
> the buyer. Never output them:
> **Architect · Architectural Technologist · Architectural Designer · Designer · Design
> Consultant · Draughtsman / CAD Technician · Planning Consultant · Surveyor · Quantity Surveyor ·
> Estimator · Structural Engineer (unless the same person is also a named Director)** · Project
> Manager · Site Manager · Site Supervisor · Site Foreman · Foreman · **Contracts Manager** ·
> Contracts Supervisor · Construction Manager · Bricklayer · Carpenter · Joiner · Groundworker ·
> Plasterer · Roofer · Electrician · Plumber · Decorator · Labourer · Apprentice · Scheduler ·
> Receptionist · Bookkeeper · Accounts · HR · Health & Safety Manager · Company Secretary · any
> `<Department> Manager` other than General or Marketing · any `Director of <X>` other than
> Marketing, Sales, Commercial, Operations or Construction.
>
> **The single highest-risk false positive on this list is the DESIGNER / ARCHITECT / SURVEYOR
> who performs the free design visit, and it is this vertical's twin of the US `Estimator` trap.**
> The offer sells *design consultations*, so UK extension sites lead with "book your free design
> consultation" / "free site survey" and name the architectural designer or surveyor who will
> attend. They consume the appointments; they do not buy them. The same words make a design-and-
> build firm's in-house architect look like the principal — at a D&B firm the architect is a
> salaried designer unless Companies House or the site says "Director". Output a designer and we
> have emailed the wrong human with an offer to book them more of the work they already do.
> **Site Manager and Contracts Manager: EXCLUDE**, unchanged from the UK foundation decisions —
> they run the jobs and hold no marketing budget; a contracts manager is kept only as a last-resort
> reachable contact at the `office_manager` tier, never ahead of a director.
>
> The two rules that make this work: **evaluate EXCLUDE before KEEP** (otherwise "Assistant to the
> Managing Director" reads as the MD and "Design Director" at an architecture practice reads as a
> Director), and **a department qualifier demotes a title** (`Director` keeps; `Construction
> Director` is `gm`; `Director of Design` drops).
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox
> (`info@` / `enquiries@`). Acceptable because the offer still needs a human who can route it to
> the director.
>
> Geography note (entity-match): leads are across the **whole UK — England, Scotland, Wales and
> Northern Ireland**, 177 town-anchored tiles. Reject a contact whose result names a business in a
> different UK town or region from this lead, and reject anything that resolves to the Republic of
> Ireland or the United States — the 2026-09-16 UK export proved **US service-area pins arrive in
> a UK pull carrying UK region tags**, so a "Texas" or "+1" result against a UK lead is a different
> company, not a branch. "Extensions" is also a hair-and-lash trade: a LinkedIn result for a salon
> owner against a builder lead is a different business.
>
> Brand families and roll-up branches (**Build Team · Simply Extend · Econoloft · Absolute Lofts ·
> Landmark Lofts · The Loft Room** — a DRAFT list, extended after calibration) are KEPT and
> flagged, never dropped — standing client directive, carried in the `brand_family` column. For a
> BRANCH row: the **branch manager is the contact and belongs in `gm`**. **Reject the parent's
> corporate officers for a branch** — a Companies House record for the national holding company
> is not this branch's owner. A branch's real name is the branch manager or the local operations
> director, or nobody.

## Companies House rules (UK — this is the registry, and it outranks the website)

`companies_house.jsonl` exists for this job, so `{{ch_directors}}` is populated and is the
**authoritative** source. It is already entity-matched by company number by `companies-house.js`.

1. **A current, active Companies House director is `owner_or_partner`** with
   `source:"companies_house"` and `is_likely_owner:true`. Do not override an authoritative CH
   director with a weaker guess from the website or a search snippet.
2. **With several directors, the primary is the one whose surname appears in the business name**
   (`P J Harrison Builders` → the director surnamed Harrison). Failing that, the longest-serving
   (earliest `appointed_on`).
3. **Reject a Companies House match whose registered company title shares no distinctive token
   with the business name.** Strip `ltd / limited / llp / plc / the / and / &` and the trade words
   (building, builders, build, construction, contractors, extensions, lofts, loft, conversions,
   design, developments, services, solutions, group, property, maintenance, renovations,
   homes, home) before comparing — what is left must overlap. On the UK foundation run this check
   caught **four wrong owners** (*"Crown Preservation"* matched to ABOVEWATER DAMP PROOFING — no
   shared distinctive token, so every director it returned was a stranger). When the match is
   flagged `[low_confidence match]` in the `ch_directors` block, including one tagged
   `(DEMOTED: city_only …)`, apply this test explicitly before you output anybody from it. A UK
   town is not a disambiguator when every firm is `<Town> Building Services`.
4. **Companies House prints surname-first in capitals. Convert it.** `"HARRISON, Paul James"` →
   name `Paul Harrison`, first_name `Paul`. Take the FIRST forename only; drop middle names from
   `name`. `"O'DONNELL, Sean"` → `Sean O'Donnell`. Never output the registry's raw
   `SURNAME, Forename` string as a name.
5. **Secretaries, corporate officers and nominees are never output.** `Company Secretary`,
   `Corporate Director`, `Nominee Director`, and any officer whose "name" is itself a company
   (ends in LTD / LIMITED / LLP / SECRETARIES / SERVICES) — these are accountants and formation
   agents, not the buyer.
6. **Resigned officers are never output.** If the record carries a `resigned_on`, or the text says
   "former", "ex-" or "retired", the person is out.
7. **Sole traders have no Companies House record at all.** An empty `{{ch_directors}}` is normal
   and is not evidence of anything — fall through to the website and the business name.

## UK vertical traps (read before extracting)

1. **The business name IS the person, for sole traders.** The single easiest win in this vertical.
   `P J Harrison Builders` → the surname is Harrison, `Dave Wilson Building Services` → **Dave
   Wilson**, `Hartley & Son Extensions` → the surname is Hartley. Output that person with
   `evidence` = the business name itself and `role_bucket:"owner_or_partner"`. Where the name
   gives only initials and a surname and no forename is found anywhere in the sources, do **not**
   invent a forename — output nothing.
2. **"Family run since 1985" names nobody.** Nor do "a family business", "father and son", "over
   30 years' experience", "our team of qualified tradesmen", "fully insured". Marketing copy. Do
   not infer a person, a surname or a founder from it.
3. **A business name is not a person.** If a candidate name contains a trade or company word —
   Building, Builders, Build, Construction, Contractors, Extensions, Lofts, Loft, Conversions,
   Design, Developments, Renovations, Services, Solutions, Group, Property, Homes, Ltd, Limited,
   LLP — it is a company. Drop it.
4. **Accreditation, scheme and product names are not people.** `FMB` / `Federation of Master
   Builders`, `TrustMark`, `Checkatrade`, `Which? Trusted Trader`, `NHBC`, `LABC`, `CITB`,
   `CSCS`, `Gas Safe`, `NICEIC`, `Velux` (certified installer), `Keylite`, `Everest`, `Anglian`
   are trade bodies, warranty schemes and manufacturers. "FMB member" and "Velux certified
   installer" name a scheme, not a director.
5. **A Checkatrade / MyBuilder / Rated People / Houzz / TrustMark / FMB badge quotes no one from
   this business.** Third-party badges and review widgets carry other companies' founders,
   reviewer first names ("Great job — John, Leeds") and platform staff. A reviewer is not a
   contact. The same goes for the FMB and TrustMark member directories: their listed officers are
   the trade body's, not the member firm's.
6. **Reject departed and former people.** "Former Managing Director", "ex-Director", "retired",
   "the late", "stepped down", "our founder, who sadly passed". Never output them.
7. **"&" joins titles as well as people.** "Steve Hartley, Managing Director & Company Secretary"
   is one person (output him as MD, the secretaryship is irrelevant); "Mark & Julie Ashworth,
   Directors" is two people. A name never contains a role word.
8. **Warranty, planning and review boilerplate mentions "owner".** "the guarantee transfers to the
   next owner", "as a homeowner you...", "the owner was very tidy" (a review), "the property owner
   must apply for planning permission". None of these names your contact.
9. **A postnominal is not a name.** `John Smith MCIOB RIBA` → name `John Smith`, the letters go
   in `title`. `RIBA` / `ARB` / `MRICS` / `MCIAT` usually mark an architect, technologist or
   surveyor — check the role before keeping; a `RIBA` who is also a named Director is a KEEP at
   `owner_or_partner`, a `RIBA` on the "our design team" page is not.
10. **Beware the design-visit page.** UK extension sites lead with "book your free design
    consultation" / "arrange a free site survey" and name the designer or surveyor who will
    attend. That page is where the wrong contact lives. The director is normally on the About
    page, in the footer ("Director: A. Hartley"), on a "Meet the team" page, or only in Companies
    House.
11. **The design-and-build architect is a salaried designer unless the registry or the site says
    Director.** "Our in-house architect, Tom Reid, will design your extension" → EXCLUDE. "Tom
    Reid, Director and lead architect" → KEEP at `owner_or_partner` (the director title wins).

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Paul Harrison",           // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Paul",
  "title":"Managing Director",      // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | sales_manager | office_manager | other
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"companies_house",       // companies_house | website | serp
  "email":"" }

⚠️ ENTITY-MATCH (CRITICAL — read first): the search text (esp. `=== LINKEDIN ===`) often
contains people from DIFFERENT same-name businesses in OTHER cities. You are given the
lead's full identity: `{{business_name}}`, `{{full_address}}`, `{{zip}}`,
`{{neighborhood}}`, `{{city}}`. **Only output a person whose result corroborates THIS
business** — the business name must closely match `{{business_name}}` AND the location must
be consistent (same city/neighborhood/region; a profile in another city/region/metro = REJECT). If
a candidate's employer or city doesn't match this lead, DROP them. Wrong owner is worse than
no owner.

Guardrails (fixed): `name` = clean full name only (strip "Dr."/credentials into `title`) ·
never truncate to first name · `evidence` MUST be a verbatim quote containing the person's
name (no quote with the name → don't output them) · the candidate must pass ENTITY-MATCH ·
NEVER invent a name, title, or email · if the business name IS a person's name (e.g.
"Varadi Zoltan DDS"), output that person, evidence = the business name.

## FIXED — output contract (single reader, all sources). Copy verbatim.

ONE reader prompt. Its inputs are `{{business_name}}`, `{{full_address}}`, `{{zip}}`,
`{{neighborhood}}`, `{{city}}`, `{{emails}}`, `{{ch_directors}}` (if present), `{{site_text}}`,
`{{serp_text}}` (the batch item's fields). Read ALL sources in one pass and return ONE deduped `contacts` array.

ROLE: extract EVERY named person whose role is in the job's KEEP set, corroborating across the
sources. We want MULTIPLE contacts. EXCLUDE the job's EXCLUDE roles. NEVER invent.

SOURCE PRIORITY (read in this order):
1. **`{{ch_directors}}` — Companies House, AUTHORITATIVE (when present).** Current registered
   directors of THIS company (already entity-matched by company number — trust it). Output them
   as the decision-maker(s); do not override with a weaker web guess. With multiple directors the
   primary buyer is usually the one whose surname matches the business name. Tag `source:"companies_house"`.
   (Empty for non-registry countries like the US — skip it.)
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other cities). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/director wording; OR the business name
contains their surname; OR they're the clearly lead/solo/most-prominent Managing Director or
Director. Do not require the word "owner".

OUTPUT FIELDS:
- contacts          (JSON array of the schema objects, deduped by FULL name across all sources; `[]` if none; max 5)
- primary_name      (explicit owner/founder/director → else office_manager → else lead Managing Director / Director)
- primary_first_name
- primary_role      (one of this job's `role_bucket` enum: owner_or_partner | gm | marketing | sales_manager | office_manager | other)
- primary_is_owner  (true | false)
- best_send_email   (first contact email present → else the `{{emails}}` column → else blank)
- best_website      (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/magazines/`.gov`; blank if none clearly belongs to this business. This recovers no-website leads — no separate website-finder needed.)
- confidence        (high | medium | low)
- needs_review      (true ONLY if contacts is empty)
greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

## Few-shots (this vertical's real role nouns)

**KEEP** — `ch_directors`: `"Companies House [matched]: HARRISON BUILDING & EXTENSIONS LIMITED (08123456)
HARRISON, Paul James — director (appointed 2012-06-01)"` and site text:
`"Paul Harrison, Managing Director, has run the company since 2012 and personally quotes every
extension. Our marketing is looked after by Emma Clarke, Marketing Manager."`
→ `[{"name":"Paul Harrison","first_name":"Paul","title":"Managing Director","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"HARRISON, Paul James — director (appointed 2012-06-01)","source":"companies_house","email":""},
    {"name":"Emma Clarke","first_name":"Emma","title":"Marketing Manager","role_bucket":"marketing","is_likely_owner":false,"evidence":"Emma Clarke, Marketing Manager","source":"website","email":""}]`
The registry name is converted from `HARRISON, Paul James` to `Paul Harrison` — surname last,
first forename only, middle name dropped. Marketing is a KEEP bucket for a lead-gen offer.

**EXCLUDE** — site text: `"Meet the team: Tom Reid — Architectural Designer, will visit your
home for your free design consultation. Kevin Brown — Contracts Manager. Lee Hargreaves — Site
Manager. Dan Price — Quantity Surveyor."` → `[]`
The architectural designer performs the design consultation this offer sells — this vertical's
twin of the US estimator trap and the highest-risk false positive here. A contracts manager and
a site manager run the jobs; a QS prices them. Nobody in this text can authorise a marketing
retainer, so the correct answer is the empty array.

**EMPTY** — site text: `"We are a family run building company specialising in house extensions
and loft conversions across Greater Manchester, established 1998. FMB member. Checkatrade — 4.9
from 212 reviews. Book your free design consultation today."` → `[]`
"Family run" and "established 1998" name nobody, `FMB` is a trade body and not a person, and a
Checkatrade badge quotes no one from this business. No name, no contact.
