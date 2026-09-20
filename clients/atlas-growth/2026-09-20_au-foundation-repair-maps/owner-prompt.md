# Owner-prompt — Atlas Growth / Australia foundation repair (underpinning · restumping / reblocking · resin injection / slab lifting · house levelling · house raising)

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md`, derived
from `clients/atlas-growth/owner-prompts/uk-foundation-repair.md`. Applied by one Haiku subagent per
`batch-<N>-in.json` (`owner-read-subagent.md`), and by the web-search sweep
(`owner-sweep-subagent.md`) on the leads that stay unnamed. Everything below the DECISIONS / traps
blocks is copied verbatim from the template scaffold. **DRAFT until GATE 6** — read back to the
operator before any owner read.

Sources for the filled slots: `clients/atlas-growth/ICP.md` (offer + the US role logic),
`clients/atlas-growth/ICP-au.md` (the Australian title mapping and the licence-registry plan),
`clients/atlas-growth/owner-prompts/foundation-repair-roles.md` (the KEEP/EXCLUDE buckets), and the
UK prompt (the entity-match rule and the branch trap, kept unchanged).

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-09-20_au-foundation-repair-maps**
> ICP business types: **Australian underpinning · restumping and reblocking (Victoria's word for
> the same job on timber-stump houses) · resin injection, slab lifting, house levelling and
> relevelling (the franchise labels: Mainmark, Uretek, Buildfix, Teretek and their licensees) ·
> subsidence and foundation repair · house raising (Queensland / northern NSW, adjacent)**
> Offer (one line): **"We help foundation repair companies book 10 qualified foundation inspection
> appointments that turn into repair projects every month using Facebook lead generation."**
> Target decision-maker(s): **Director / Managing Director / Owner / Proprietor / Sole Trader /
> Principal / Partner / the individual licence holder first; then GM or Operations Manager, then
> the marketing lead, then a Sales or Business Development Manager** — this offer is bought by
> whoever owns the marketing spend and the inbound appointment diary, not by whoever runs the jobs
> and not by whoever performs the inspection.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — **Director**, **Managing Director**, Company Director, Owner, Co-Owner,
>   Proprietor, **Sole Trader**, Founder, Co-Founder, **Principal**, **Partner**, Chairman, CEO,
>   and **the individual named on the state licence** (Licensee / Licence holder / Nominee) when
>   the licence is in the person's own name or their surname is in the business name. This is the
>   prize bucket and it is where nearly every name on this list will land.
>   *Why:* an Australian underpinning or restumping firm is typically a 3-to-10-person
>   owner-operated Pty Ltd or sole trader. The director **is** the marketing budget — there is
>   nobody above them to ask. There is no Companies House here; the state licence board is the
>   registry, and for a firm this size the licence holder it names is the owner.
> - `gm` — General Manager, **Operations Manager**, Operations Director, **Branch Manager**, and a
>   **company-licence nominee who is not also a director or a surname match** (a licensed employee
>   who supervises the work for a larger firm or a franchise branch). A P&L holder at an
>   independent or at a single branch of a small network. Deliberately kept: the obvious title
>   filters reject every "Manager" and lose exactly this person.
> - `marketing` — Marketing Manager, Marketing Director, Head of Marketing. For a
>   *lead-generation* offer this is often the better first door than the director at a mid-size
>   firm, or the champion who carries it to the director.
> - `sales_manager` — Sales Manager, **Business Development Manager**, Sales Director. At this
>   company size these are revenue owners, not the in-home closer the US prompt excludes. Keep
>   them, but never in preference to a director.
> - `office_manager` — SECONDARY ONLY. A reachable human when nothing above is found. They book
>   the inspections; they do not authorise spend.
>
> EXCLUDE these roles — they cannot authorise the offer and a small model will mistake them for
> the buyer. Never output them:
> **Estimator · Inspector · Assessor · Building Inspector · Consultant (a field "consultant" who
> attends the inspection) · Structural Engineer (unless the same person is also a named Director
> or Owner)** · Site Supervisor · Supervisor · Site Manager · Foreman · Leading Hand · Contracts
> Manager · Project Manager · Technician · Installer · Operative · Labourer · Apprentice ·
> Scheduler · Dispatcher · Receptionist · Bookkeeper · Accounts · HR · Safety Manager · Company
> Secretary · any `<Department> Manager` other than General, Operations or Marketing · any
> `Director of <X>` other than Marketing, Sales or Operations.
>
> **The single highest-risk false positive on this list is `Estimator` / `Inspector` /
> `Assessor` — the Australian twin of the US Estimator and the UK Surveyor trap.** The offer sells
> *inspection appointments*, so the words "inspection", "free inspection" and "assessment" are all
> over an Australian foundation firm's website — and the person who actually performs that visit
> is titled estimator, inspector, assessor or consultant. They consume the appointments; they do
> not buy them. Output one and we have emailed the wrong human with an offer to book them more of
> the work they already do.
> **A nominee supervisor is a person-level judgement, not a bucket.** Queensland (QBCC) and
> Victorian (VBA) company licences name a *nominee*: the licensed individual who supervises the
> work. At a 3-person firm that is the owner; at a Mainmark or Buildfix branch it can be an
> employee. Put them in `owner_or_partner` only with a second signal (surname in the business name,
> the licence in their own name, or a director record); otherwise `gm` with
> `is_likely_owner:false`.
>
> The two rules that make this work: **evaluate EXCLUDE before KEEP** (otherwise "Assistant to the
> Managing Director" reads as the MD and "Director of Estimating" reads as a Director), and **a
> department qualifier demotes a title** (`Director` keeps; `Technical Director` is a KEEP at
> `gm` level only if nothing better exists; `Director of Estimating` drops).
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox
> (`info@` / `admin@` / `enquiries@`). Acceptable because the offer still needs a human who can
> route it to the director.
>
> Geography note (entity-match): leads are across the **whole of Australia**, 182 town-anchored
> tiles, and every lead carries a state token (NSW · VIC · QLD · SA · WA · TAS · ACT · NT).
> Reject a contact whose result names a business in a different town or state from this lead, and
> reject anything that resolves to New Zealand, the United States or the United Kingdom — the UK
> run proved US service-area pins arrive in a foreign-country pull carrying local region tags, so a
> "Texas" or "+1" result against an Australian lead is a different company, not a branch. Same-name
> businesses in different states are common in this trade ("Sydney Underpinning" vs "Underpinning
> Sydney" vs "Underpinning Brisbane") — the state must match.
>
> Brand families and franchise licensees (**Mainmark · Uretek · Buildfix · Teretek · Restumping
> Australia**) are KEPT and flagged, never dropped — standing client directive, carried in the
> `brand_family` column. For a BRANCH or LICENSEE row: the **local licensee or branch manager is
> the contact and belongs in `gm`** (or `owner_or_partner` where the licensee owns the branch as
> their own company — a Buildfix licensee trading as their own Pty Ltd is an owner). **Reject the
> parent's corporate officers for a branch** — Mainmark's group directors are not the
> decision-maker for the Mainmark licensee in Newcastle, and a registry record for the national
> parent is not this branch's owner. A branch's real name is the local licensee, the branch
> manager or the local operations manager, or nobody.

## Licence-registry rules (Australia — this is the registry, and it outranks the website)

There is **no Companies House**. The registry for this job is the **state licence board**: NSW Fair
Trading (`verify.licence.nsw.gov.au`), Victoria's VBA, Queensland's QBCC, WA Building and Energy,
SA Consumer and Business Services. Their records are injected by `prep-owner-batches.js --ch` into
the same `{{ch_directors}}` block the UK run used for Companies House, in the same wording — so the
block is labelled "Companies House" by the injector, and **for this job that label means "the state
licence board record for this lead"**. Tag anyone you take from it `source:"companies_house"` (the
engine's enum name for a registry source; the record's own `registry` field says which board).

0. **NSW records carry roles.** `verify.licence.nsw.gov.au` detail records list `associatedRoles` —
   `Licensee`, `Director`, `Nominated supervisor` — each with a named party and suburb (probed
   2026-09-20: UNDERPINNING SOLUTIONS PTY LTD → Director and Nominated supervisor Markos Abelas). A
   party in the **`Director`** role is `owner_or_partner`, `is_likely_owner:true`, no second signal
   needed. A party only in `Nominated supervisor` follows rule 2.
1. **A current licence held by an individual is `owner_or_partner`** with
   `source:"companies_house"` and `is_likely_owner:true` — when the licence is in the person's
   own name (a sole trader or partnership licence), or the person's surname appears in the business
   name, or the record says director / owner / proprietor. Do not override an authoritative
   registry individual with a weaker guess from the website or a search snippet.
2. **A company licence names a nominee / nominated supervisor.** That person is `owner_or_partner`
   only with a second signal (rule 1's tests); otherwise `gm`, `is_likely_owner:false`. A nominee
   whose name also appears on the website as director or owner is `owner_or_partner`.
3. **Reject a registry match whose licence name shares no distinctive token with the business
   name.** Strip `pty / ltd / limited / the / and / &` and the trade words (underpinning,
   restumping, reblocking, foundation, foundations, levelling, raising, repairs, solutions,
   services, group, building, builders, construction, constructions, contractors, concrete,
   structural, remedial) before comparing — what is left must overlap. On the UK run the
   equivalent check caught four wrong owners (the clearest: "Crown Preservation" matched to
   ABOVEWATER DAMP PROOFING — no shared distinctive token, so every director it returned was a
   stranger). When the match is flagged `[low_confidence match]` in the block, apply this test
   explicitly before you output anybody from it. A **suburb or state mismatch** between the licence
   address and the lead is a reject on its own.
4. **Registries print names in mixed formats. Normalise.** `"SMITH, John Andrew"` → name
   `John Smith`, first_name `John`; `"JOHN ANDREW SMITH"` → `John Smith`. Take the FIRST forename
   only; drop middle names from `name`. Never output the registry's raw string as a name.
5. **A licence whose holder is itself a company (ends in PTY LTD / LIMITED / TRUST / GROUP) names
   nobody** — fall through to the nominee (rule 2), the website and the business name.
6. **Cancelled, expired, suspended or surrendered licences are never output.** If the record's
   status is anything but current / active, or the text says "former", "ex-" or "retired", the
   person is out.
7. **Many firms have no licence record at all** (a restumper working under a general builder's
   licence, a WA or NT firm, a franchise licensee licensed under the parent). An empty
   `{{ch_directors}}` is normal and is not evidence of anything — fall through to the website and
   the business name.

## Australian vertical traps (read before extracting)

1. **The business name IS the person, for sole traders.** The single easiest win in this
   vertical. `Dave Burke Restumping` → **Dave Burke**, `A J Nolan Underpinning` → the surname is
   Nolan, `Hartley & Sons House Raising` → the surname is Hartley. Output that person with
   `evidence` = the business name itself and `role_bucket:"owner_or_partner"`. Where the name gives
   only initials and a surname and no forename is found anywhere in the sources, do **not** invent
   a forename — output nothing.
2. **"Family owned and operated since 1985" names nobody.** Nor do "a family business", "father
   and son", "over 30 years' experience", "our team of qualified assessors", "locally owned". It is
   marketing copy. Do not infer a person, a surname or a founder from it.
3. **A business name is not a person.** If a candidate name contains a trade or company word —
   Underpinning, Restumping, Reblocking, Foundation, Foundations, Levelling, Raising, Piering,
   Piling, Slab, Structural, Remedial, Building, Builders, Construction, Constructions,
   Contractors, Concrete, Services, Solutions, Systems, Group, Pty, Ltd, Trust — it is a company.
   Drop it.
4. **Accreditation, product and franchise names are not people.** `Mainmark`, `Uretek`,
   `Teretek`, `Buildfix`, `JOG`, `Terefil`, `Screwpile`, `Surefoot`, `Helifix`, `QBCC`, `VBA`,
   `HIA`, `MBA`, `Master Builders`, `NSW Fair Trading` are systems, licences, trade bodies and
   franchises. "Mainmark licensee" and "HIA member" name a product line or a membership, not a
   director.
5. **A hipages / Oneflare / ServiceSeeking / Yellow Pages / Google Reviews / Product Review badge
   quotes no one from this business.** Third-party badges and review widgets carry other
   companies' founders, reviewer first names ("Great job — Karen, Ipswich") and platform staff. A
   reviewer is not a contact. The same goes for HIA and Master Builders member directories: their
   listed officers are the trade body's, not the member firm's.
6. **Reject departed and former people.** "Former director", "retired", "the late", "stepped
   down", "our founder, who sadly passed". Never output them.
7. **"&" joins titles as well as people.** "Steve Hartley, Director & Licensee" is one person
   (output him as Director); "Mark & Julie Nolan, Owners" is two people. A name never contains a
   role word.
8. **Warranty and review boilerplate mentions "owner".** "the warranty transfers to the next
   owner", "as a homeowner you...", "the owner was very tidy" (a review), "owner-builder" (a
   homeowner category, not a contractor). None of these names your contact.
9. **A licence number is not a name and a postnominal is not a name.** `John Smith MBA CPEng` →
   name `John Smith`, the letters go in `title`. `CPEng` / `MIEAust` / `RPEQ` mark an engineer —
   check the role before keeping. "Lic. 123456C" is the licence, keep it out of every field.
10. **Beware the inspection page.** Australian foundation sites lead with "Book your free
    inspection" and name the assessor or consultant who will attend. That page is where the wrong
    contact lives. The director is normally on the About page, in the footer ("Director: A.
    Hartley"), on the licence record, or nowhere.

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"John Smith",             // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"John",
  "title":"Director",               // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | sales_manager | office_manager | other
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"companies_house",       // companies_house (= the state licence board, this job) | website | serp
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
1. **`{{ch_directors}}` — the registry, AUTHORITATIVE (when present).** For this job: the state
   licence board record for THIS company (entity-matched by the injector; apply rule 3 above when
   it is flagged low-confidence). Output the individual it names as the decision-maker(s) per the
   registry rules; do not override with a weaker web guess. Tag `source:"companies_house"`.
   (Empty for leads with no licence record — skip it.)
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other cities). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/director/proprietor wording; OR the business
name contains their surname; OR the licence is in their own name; OR they're the clearly lead/solo/
most-prominent Director. Do not require the word "owner".

OUTPUT FIELDS:
- contacts          (JSON array of the schema objects, deduped by FULL name across all sources; `[]` if none; max 5)
- primary_name      (explicit owner/founder/director/licensee → else office_manager → else lead Director)
- primary_first_name
- primary_role      (one of this job's `role_bucket` enum: owner_or_partner | gm | marketing | sales_manager | office_manager | other)
- primary_is_owner  (true | false)
- best_send_email   (first contact email present → else the `{{emails}}` column → else blank)
- best_website      (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/magazines/`.gov.au`; blank if none clearly belongs to this business. This recovers no-website leads — no separate website-finder needed.)
- confidence        (high | medium | low)
- needs_review      (true ONLY if contacts is empty)
greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

## Few-shots (this vertical's real role nouns)

**KEEP** — `ch_directors`: `"Companies House [matched]: NSW Fair Trading contractor licence 245871C —
HARTLEY UNDERPINNING PTY LTD, class Underpinning and piering, current; nominated supervisor SMITH,
John Andrew"` and site text:
`"Our director John Smith has personally overseen every underpinning job since 2009. Sarah Kelly,
Marketing Manager, looks after our campaigns."`
→ `[{"name":"John Smith","first_name":"John","title":"Director","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Our director John Smith has personally overseen every underpinning job since 2009","source":"website","email":""},
    {"name":"Sarah Kelly","first_name":"Sarah","title":"Marketing Manager","role_bucket":"marketing","is_likely_owner":false,"evidence":"Sarah Kelly, Marketing Manager, looks after our campaigns","source":"website","email":""}]`
The registry names John Smith only as the company licence's nominee — on its own that is `gm` —
but the website calls him director, so rule 2's second signal is met and he is `owner_or_partner`.
The registry string `SMITH, John Andrew` is converted to `John Smith`. Marketing is a KEEP bucket
for a lead-gen offer.

**EXCLUDE** — site text: `"Meet the team: Gary Whitfield — Senior Assessor, will carry out your free
foundation inspection. Kevin Brown — Site Supervisor. Lee Hargreaves — Installation Technician."`
→ `[]`
An assessor performs the inspection this offer sells — the Australian twin of the US estimator
trap, and the highest-risk false positive here. A site supervisor runs the jobs. A technician is
field staff. Nobody in this text can authorise a marketing retainer, so the correct answer is the
empty array.

**EMPTY** — site text: `"We are a family owned and operated underpinning and restumping company,
servicing Melbourne's eastern suburbs since 1985. Mainmark licensee. HIA member. Rated 4.9 on
hipages from 212 reviews. Book your free inspection today."` → `[]`
"Family owned since 1985" names nobody, `Mainmark` is a franchise system and not a person, `HIA`
is a trade body, and a hipages badge quotes no one from this business. No name, no contact.
