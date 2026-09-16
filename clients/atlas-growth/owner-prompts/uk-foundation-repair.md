# Owner-prompt — Atlas Growth / UK foundation repair (damp proofing · structural waterproofing · underpinning · structural repairs · mini piling)

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md`.
Applied by one Haiku subagent per `batch-<N>-in.json` (`owner-read-subagent.md`), and by the
web-search sweep (`owner-sweep-subagent.md`) on the leads that stay unnamed. Everything below the
DECISIONS / traps blocks is copied verbatim from the template scaffold.

Sources for the filled slots: `clients/atlas-growth/ICP.md` (offer + the US role logic),
`clients/atlas-growth/ICP-uk.md` (the UK title mapping and the three operator decisions),
`clients/atlas-growth/owner-prompts/foundation-repair-roles.md` (the KEEP/EXCLUDE buckets with UK
notes), and `skills/icp-source-planner/library/google-maps--uk-foundation-repair.md` (measured
yields: own site names someone on ~4% of UK ICP sites, Companies House on 64%).

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-09-16_uk-foundation-repair-maps**
> ICP business types: **UK damp proofing and structural waterproofing · basement / cellar tanking
> and conversion · underpinning and mini piling · subsidence and structural repair (crack
> stitching, helical bars, wall-tie replacement, masonry stabilisation, resin injection / ground
> stabilisation) · general builders with a real structural-repairs line**
> Offer (one line): **"We help foundation repair companies book 10 qualified foundation inspection
> appointments that turn into repair projects every month using Facebook lead generation."**
> Target decision-maker(s): **Managing Director / Director / Owner / Proprietor / Sole Trader /
> Partner first; then GM or Operations Director, then the marketing lead, then a Sales or
> Commercial Director** — this offer is bought by whoever owns the marketing spend and the inbound
> appointment diary, not by whoever runs the jobs and not by whoever performs the survey.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — **Managing Director (MD)**, **Director**, **Company Director**, Owner,
>   Co-Owner, Proprietor, **Sole Trader**, Founder, Co-Founder, **Partner**, Principal, Chairman,
>   CEO. This is the UK prize bucket and it is where nearly every name on this list will land.
>   *Why:* a UK damp or underpinning firm is typically a 3-to-10-person owner-operated limited
>   company. The MD **is** the marketing budget — there is nobody above them to ask. "Director" is
>   also the Companies House title, so the registry hands us this bucket directly and at $0; on the
>   last UK run it named the decision-maker for 64% of the list where the firms' own websites named
>   somebody on only ~4%. Sole traders are common in this trade and their business name is often
>   their own name, which makes the business name itself a valid source for this bucket.
> - `gm` — General Manager, **Operations Director**, Operations Manager, **Branch Manager**. A P&L
>   holder at an independent or at a single branch of a small network. Deliberately kept: the
>   obvious title filters reject every "Manager" and lose exactly this person.
> - `marketing` — Marketing Manager, **Marketing Director**, **Head of Marketing**, Director of
>   Marketing. For a *lead-generation* offer this is often the better first door than the MD at a
>   mid-size firm, or the champion who carries it to the MD.
> - `sales_manager` — **Sales Director**, **Commercial Director**, Business Development Manager,
>   Sales Manager. UK-specific call: at this company size these are board-level revenue owners, not
>   the in-home closer the US prompt excludes. Keep them, but never in preference to a director.
> - `office_manager` — SECONDARY ONLY. A reachable human when nothing above is found. They book the
>   surveys; they do not authorise spend.
>
> EXCLUDE these roles — they cannot authorise the offer and a small model will mistake them for the
> buyer. Never output them:
> **Surveyor · Damp Surveyor · Damp & Timber Surveyor · Building Surveyor · Remedial Surveyor ·
> Quantity Surveyor · Estimator · Inspector** · Site Manager · Site Foreman · Foreman · **Contracts
> Manager** · Contracts Supervisor · Project Manager · Production Manager · Technician · Damp
> Technician · Damp Proofer · Installer · Operative · Labourer · Apprentice · Structural Engineer
> (unless the same person is also a named Director) · Scheduler · Dispatcher · Receptionist ·
> Bookkeeper · Accounts · HR · Health & Safety Manager · Company Secretary · any
> `<Department> Manager` other than General or Marketing · any `Director of <X>` other than
> Marketing, Sales, Commercial or Operations.
>
> **The single highest-risk false positive on this list is `Surveyor`, and it is the UK twin of the
> US `Estimator` trap.** The offer sells *inspection appointments*, so the words "survey",
> "surveyor" and "free survey" are all over a UK damp firm's website — and in a UK damp firm the
> person who actually performs that visit is titled **Surveyor**. They consume the appointments;
> they do not buy them. Output a surveyor and we have emailed the wrong human with an offer to book
> them more of the work they already do.
> **This exclusion is a PERSON-level rule and the GATE 3 company decision does not touch it.** The
> operator admitted damp-*survey practices* (Damp Surveys Ltd, Independent Damp & Mould Surveys,
> Dampworks) as target COMPANIES on 2026-09-16. That says which firms get worked; it says nothing
> about who to name inside one. At *Damp Surveys Ltd* the target is still the Managing Director or
> a named Director, and the surveyor who does the inspections is still excluded.
> **Contracts Manager is excluded as a target and kept only as a last-resort reachable contact**,
> at the tier this prompt reserves for `office_manager`. The roles doc files "contracts manager"
> under `gm`, but that bucket was written for US dealer/branch networks where a branch GM controls
> local lead spend. In a UK damp or underpinning firm a contracts manager schedules and runs jobs,
> and the parent ICP's own rule — a department qualifier is an exclusion — points the same way. A
> contracts manager is never output in preference to a director.
>
> The two rules that make this work: **evaluate EXCLUDE before KEEP** (otherwise "Assistant to the
> Managing Director" reads as the MD and "Director of Surveying" reads as a Director), and **a
> department qualifier demotes a title** (`Director` keeps; `Technical Director` is a KEEP at
> `gm` level only if nothing better exists; `Director of Surveying` drops).
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox
> (`info@` / `enquiries@`). Acceptable because the offer still needs a human who can route it to
> the director.
>
> Geography note (entity-match): leads are across the **whole UK — England, Scotland, Wales and
> Northern Ireland**, 177 town-anchored tiles. Reject a contact whose result names a business in a
> different UK town or region from this lead, and reject anything that resolves to the Republic of
> Ireland or the United States — the 2026-09-16 export proved **US service-area pins arrive in a UK
> pull carrying UK region tags**, so a "Texas" or "+1" result against a UK lead is a different
> company, not a branch.
>
> Brand families and roll-up branches (**Timberwise · Rentokil Property Care · Peter Cox ·
> Protectahome · Prokil · Richardson & Starling · Wise Property Care · Kenwood Damp · Preservation
> Treatments · DampMaster · Mainmark · Geobear/Uretek · Abbey Pynford · Brick-Tie · Twistfix ·
> Sovereign Chemicals · Safeguard Europe**) are KEPT and flagged, never dropped — standing client
> directive, carried in the `brand_family` column. For a BRANCH row: the **branch manager is the
> contact and belongs in `gm`**. **Reject the parent's corporate officers for a branch** — Rentokil
> Initial plc's group directors are not the decision-maker for the Rentokil Property Care branch in
> Leeds, and a Companies House record for the national holding company is not this branch's owner.
> A branch's real name is the branch manager or the local operations director, or nobody.

## Companies House rules (UK — this is the registry, and it outranks the website)

`companies_house.jsonl` exists for this job, so `{{ch_directors}}` is populated and is the
**authoritative** source. It is already entity-matched by company number by `companies-house.js`.

1. **A current, active Companies House director is `owner_or_partner`** with
   `source:"companies_house"` and `is_likely_owner:true`. Do not override an authoritative CH
   director with a weaker guess from the website or a search snippet.
2. **With several directors, the primary is the one whose surname appears in the business name**
   (`Darryl C Price Damp Proofing` → the director surnamed Price). Failing that, the
   longest-serving (earliest `appointed_on`).
3. **Reject a Companies House match whose registered company title shares no distinctive token
   with the business name.** Strip `ltd / limited / llp / plc / the / and / &` and the trade words
   (damp, proofing, waterproofing, preservation, solutions, services, group, building, builders,
   construction, remedial, treatments, property, maintenance) before comparing — what is left must
   overlap. On the last UK run this check caught **four wrong owners**, the clearest being
   **"Crown Preservation" matched to ABOVEWATER DAMP PROOFING** — no shared distinctive token, so
   every director it returned was a stranger. When the match is flagged `[low_confidence match]` in
   the `ch_directors` block, apply this test explicitly before you output anybody from it.
4. **Companies House prints surname-first in capitals. Convert it.** `"BIRD, Martin Paul"` →
   name `Martin Bird`, first_name `Martin`. Take the FIRST forename only; drop middle names from
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

1. **The business name IS the person, for sole traders.** This is the single easiest win in this
   vertical. `Darryl C Price Damp Proofing` → **Darryl Price** (drop the middle initial),
   `A J Walker Underpinning` → the surname is Walker, `Hartley & Son Damp Proofing` → the surname
   is Hartley. Output that person with `evidence` = the business name itself and
   `role_bucket:"owner_or_partner"`. Where the name gives only initials and a surname and no
   forename is found anywhere in the sources, do **not** invent a forename — output nothing.
2. **"Family run since 1985" names nobody.** Nor do "a family business", "father and son",
   "over 30 years' experience", "our team of qualified surveyors". It is marketing copy. Do not
   infer a person, a surname or a founder from it.
3. **A business name is not a person.** If a candidate name contains a trade or company word —
   Damp, Proofing, Waterproofing, Preservation, Basement, Cellar, Tanking, Underpinning, Piling,
   Structural, Foundation, Remedial, Building, Builders, Construction, Services, Solutions,
   Systems, Group, Property, Ltd, Limited, LLP — it is a company. Drop it.
4. **Accreditation and product names are not people.** `Helifix`, `Permagard`, `Sovereign`,
   `Newton`, `Triton`, `Delta`, `Wykamol`, `Safeguard`, `Koster`, `PCA`, `CSSW`, `CSRT` are
   manufacturers, membrane systems and qualifications. "Helifix approved installer" and "Permagard
   approved contractor" name a product line, not a director. (Both were deliberately dropped from
   the brand-family matcher for exactly this reason.)
5. **A Checkatrade / Which? Trusted Trader / TrustMark / Trustpilot / Rated People / MyBuilder /
   FMB badge quotes no one from this business.** Third-party badges and review widgets carry other
   companies' founders, reviewer first names ("Great job — John, Leeds") and platform staff. A
   reviewer is not a contact. The same goes for the PCA (Property Care Association) member
   directory: its listed officers are the trade body's, not the member firm's.
6. **Reject departed and former people.** "Former Managing Director", "ex-Director", "retired",
   "the late", "stepped down", "our founder, who sadly passed". Never output them.
7. **"&" joins titles as well as people.** "Steve Hartley, Managing Director & Company Secretary"
   is one person (output him as MD, the secretaryship is irrelevant); "Mark & Julie Ashworth,
   Directors" is two people. A name never contains a role word.
8. **Warranty and review boilerplate mentions "owner".** "the guarantee transfers to the next
   owner", "as a homeowner you...", "the owner was very tidy" (a review). None of these names your
   contact.
9. **A postnominal is not a name.** `John Smith CSRT CSSW MRICS` → name `John Smith`, the letters
   go in `title`. `MRICS` in particular usually marks a surveyor — check the role before keeping.
10. **Beware the survey page.** UK damp sites lead with "Book your free damp survey" and name the
    surveyor who will attend. That page is where the wrong contact lives. The director is normally
    on the About page, in the footer ("Director: A. Hartley"), or only in Companies House.

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Martin Bird",            // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Martin",
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

**KEEP** — `ch_directors`: `"Companies House [matched]: HARTLEY DAMP PROOFING LIMITED (07219845)
BIRD, Martin Paul — director (appointed 2010-04-12)"` and site text:
`"Our Managing Director, Martin Bird, has overseen every survey since 2010. Sarah Kelly, Head of
Marketing, looks after our campaigns."`
→ `[{"name":"Martin Bird","first_name":"Martin","title":"Managing Director","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"BIRD, Martin Paul — director (appointed 2010-04-12)","source":"companies_house","email":""},
    {"name":"Sarah Kelly","first_name":"Sarah","title":"Head of Marketing","role_bucket":"marketing","is_likely_owner":false,"evidence":"Sarah Kelly, Head of Marketing, looks after our campaigns","source":"website","email":""}]`
The registry name is converted from `BIRD, Martin Paul` to `Martin Bird` — surname last, first
forename only, middle name dropped. Marketing is a KEEP bucket for a lead-gen offer.

**EXCLUDE** — site text: `"Meet the team: Gary Whitfield — Damp Surveyor (CSRT, CSSW) will carry
out your free survey. Kevin Brown — Contracts Manager. Lee Hargreaves — Damp Proofing
Technician."` → `[]`
A damp surveyor performs the inspection this offer sells — the UK twin of the US estimator trap,
and the highest-risk false positive here. A contracts manager runs the jobs and is a last-resort
contact only, never output ahead of a director. A technician is field staff. Nobody in this text
can authorise a marketing retainer, so the correct answer is the empty array.

**EMPTY** — site text: `"We are a family run damp proofing and structural waterproofing company,
serving Greater Manchester since 1985. Helifix approved installer. Checkatrade member — 4.9 from
212 reviews. Book your free damp survey today."` → `[]`
"Family run since 1985" names nobody, `Helifix` is a product accreditation and not a person, and a
Checkatrade badge quotes no one from this business. No name, no contact.
