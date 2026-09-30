# Owner-prompt — Atlas Growth / UK home battery & backup-power installers (MCS register)

Generated per SKILL.md STEP 6a from `skills/google-maps-scrape/owner-prompt.template.md` on
2026-09-30, for `2026-09-30_uk-battery-installers-mcs` (the MCS register is the spine — option A of
`ICP-generators-uk.md`; adapted from `uk-generator-installers.md`, same UK title logic). Read by one Haiku reader per batch
(`owner-read-subagent.md`) and by the web-search sweep (`owner-sweep-subagent.md`) on the leads
that stay unnamed. Sources for the filled slots: `owner-prompts/uk-generator-installers.md` (the
trade's own role nouns and traps), `owner-prompts/uk-foundation-repair.md` (the UK title mapping,
Companies House as the registry, the Surveyor trap), `ICP-generators.md` (offer + buyer).
Everything below "FIXED" is the template scaffold.

## DECISIONS — why these buckets

> Generated for: **Atlas Growth / 2026-09-30_uk-battery-installers-mcs**
> ICP business types: **UK MCS-certified installers of home battery storage (usually with solar PV, some with heat pumps) — backup-power for homes; the register proves the trade, so every lead is a real installer and
> the question is only WHO to reach; battery/solar specialists, electrical contractors and renewables firms (NAPIT / NICEIC
> / IAA certified), from sole traders to national roll-ups (occasionally heating firms that added
> battery + solar to their heat-pump work)**
> Offer (one line): **"We help home battery / backup-power installers book 10 qualified home battery
> survey appointments that turn into install projects every month using Facebook lead
> generation."** (UK wording: home battery / backup-power survey appointments; average installed job £3,500–£8,500, £10k–£15k with solar.)
> Target decision-maker(s): **Managing Director / Director / Owner / Proprietor / Sole Trader /
> Partner first; then a bare General Manager or Operations Director; then the marketing lead;
> then a Sales or Commercial Director** — whoever owns the marketing spend and the inbound
> appointment diary, not whoever installs the set and not whoever performs the site survey.
>
> KEEP these roles because they can say yes to the offer:
> - `owner_or_partner` — **Managing Director (MD)**, **Director**, **Company Director**, Owner,
>   Co-Owner, Proprietor, **Sole Trader**, Founder, Co-Founder, **Partner**, Principal, Chairman,
>   CEO, and an **electrician / engineer who is also the owner** ("Owner & Approved Electrician",
>   "Director and Lead Engineer"). This is the UK prize bucket: a UK battery/solar installer is
>   typically a 2-to-15-person owner-operated limited company and the MD **is** the marketing
>   budget. "Director" is also the Companies House title, so the registry hands us this bucket
>   directly and at $0 (the 2026-09-16 UK run named a director for 64% of the list where the
>   firms' own websites named somebody on ~4%). Sole traders often trade under their own name,
>   which makes the business name itself a valid source.
> - `gm` — General Manager, **Operations Director**, Operations Manager, **Branch Manager** at a
>   one- or two-location firm. A P&L holder can sign a lead-gen retainer.
> - `marketing` — Marketing Manager / Director / Head of Marketing. For a lead-generation offer
>   at a mid-size dealer this is the buyer or the champion who carries it to the MD.
> - `sales_manager` — **Sales Director**, **Commercial Director**, Business Development Manager,
>   Sales Manager. UK-specific call, carried over from the UK foundation prompt: at this company
>   size these are board-level revenue owners, not the in-home closer. Keep, but never in
>   preference to a director.
> - `office_manager` — SECONDARY only: a reachable human when nothing above is found. They book
>   the surveys; they do not authorise spend.
>
> EXCLUDE these roles — this trade's own field, sales and admin staff; never output them:
> **solar / battery installer · installation engineer · commissioning engineer · service engineer ·
> maintenance engineer · roofer / roofing team** · electrician / approved electrician /
> apprentice (when not also named owner) · **Qualified Supervisor / QS** (the NICEIC/NAPIT
> scheme signatory — a compliance role, not the owner, unless the text also calls them
> director/owner) · foreman · site supervisor · **estimator · surveyor · site surveyor · energy assessor · EPC assessor · designer / system designer** (the UK
> person who performs the site visit the offer sells) · **solar consultant / energy consultant / renewable energy advisor · sales engineer · technical sales ·
> account manager · sales representative / sales consultant** (the closer who runs the quote
> appointment — they consume the leads, they do not buy them) · contracts
> manager · project manager · service manager · parts manager · stores · scheduler · dispatcher
> · receptionist · admin · bookkeeper · accounts · company secretary · HR.
> Evaluate EXCLUDE before KEEP. A department qualifier demotes the title: `Service Manager`,
> `Director of Service`, `Head of Installations`, `Assistant to the Managing Director` are out.
> **Contracts Manager** is kept only as a last-resort reachable contact at the `office_manager`
> tier, never in preference to a director (same call as the UK foundation prompt).
>
> Fallback if no primary is found: `office_manager`, then the generic on-site mailbox —
> acceptable because the offer still needs a human who routes it to the MD.
>
> Geography note (entity-match): leads are across the **UK, nationwide** (England, Scotland,
> Wales, Northern Ireland; HQ address). Installer names repeat across towns ("Solar
> Solutions", "Green Energy", "<Town> Electrical", "Eco Power") — reject any contact
> whose result names a different town or county than this lead. For a branch of a multi-location
> firm, output the corporate MD/directors named on the shared site, not another branch's manager.
> A Companies House director list (`{{ch_directors}}`) is AUTHORITATIVE when present; still
> entity-match its registered name against `{{business_name}}` (common trading-name vs
> registered-name mismatches: "Sussex Solar" may be "S S Renewables Ltd").

## Vertical-specific traps (read before extracting)

1. **Scheme / OEM badges are not people.** "MCS Certified", "NAPIT Approved", "NICEIC Approved
   Contractor", "Tesla Powerwall Certified Installer", "GivEnergy Approved", "Which? Trusted Trader", "RECC member",
   "Checkatrade member" are badges. Never output them, and never read "Approved" or "Trusted" as
   a name.
2. **Manufacturer and distributor staff appear on dealer sites** — a Tesla / GivEnergy / SolarEdge / Fox ESS territory
   manager, a Segen / Midsummer wholesaler rep in a testimonial or award post.
   They work for the OEM, not this business. Drop them.
3. **Qualified Supervisor and licence lines name the scheme signatory, not always the owner.**
   "Qualified Supervisor: John Smith" / "NICEIC QS – J Smith" names the compliance role. Output
   as `owner_or_partner` ONLY when the text also calls them owner/director/founder; otherwise
   they are an EXCLUDE-list electrician.
4. **A business name is not a person.** `Solar Solutions`, `Green Energy Systems`, `Sussex
   Solar`, `Eco Power` are companies. A candidate containing a trade word (Electric,
   Electrical, Solar, Renewables, Energy, Power, Battery, Green, Eco, Solutions, Systems, Services,
   Engineering, Installations, Ltd, Limited, UK) is a company — drop it.
5. **The business name may BE the person**: `M. Patel Electrical` -> M. Patel only if a full
   first name is found in the text; `Dave Roberts Solar` with a site line "run by Dave
   Roberts" -> Dave Roberts. A surname match plus an owner word is an owner signal.
6. **Reviews name engineers and salespeople** ("Gary installed our standby generator", "Our sales
   engineer Tom was very helpful"). A first name in a review is never an owner.
7. **Reject departed people** ("former director", "retired", "founded by the late …"). Companies
   House lists resigned officers — a `resigned_on` date means drop.
8. **Case-study and review copy names customers** ("Mr and Mrs Patel's 10 kWh install"); a customer is
   never a contact.
9. **Power-cut / storm copy mentions "homeowners" constantly** — "every homeowner deserves backup
   power" names nobody.

## FIXED — copy verbatim (from the template)

CONTACT OBJECT SCHEMA:
{ "name":"Gary Hunt",              // CLEAN full name only (first + last). NO honorifics, NO credentials.
  "first_name":"Gary",
  "title":"Managing Director",      // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner", // one of: owner_or_partner | gm | marketing | sales_manager | office_manager | other
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
1. **`{{ch_directors}}` — Companies House, AUTHORITATIVE (when present).** Active officers with
   role director / managing director / member / partner -> `owner_or_partner`; skip secretaries
   and resigned officers. Tag `source:"companies_house"`.
2. **`{{site_text}}` — the company's own website** (About/Team/Meet/Owner/Contact). Trust it for
   who works there. Tag `source:"website"`.
3. **`{{serp_text}}` — web / LinkedIn search snippets.** Corroborate, and add an owner the higher
   sources missed. Apply ENTITY-MATCH hard here (same-name businesses in other towns). Tag `source:"serp"`.
(If a source is empty, use the others. A name confirmed in MORE THAN ONE source = high confidence.)

is_likely_owner = true when: explicit owner/founder/director/MD/proprietor wording; OR the
business name contains their surname; OR they're the clearly lead/solo/most-prominent
owner-engineer. Do not require the word "owner".

⚠️ ENTITY-MATCH (CRITICAL — read first): the search text often contains people from DIFFERENT
same-name businesses in OTHER towns. You are given the lead's full identity: `{{business_name}}`,
`{{full_address}}`, `{{zip}}`, `{{neighborhood}}`, `{{city}}`. **Only output a person whose result
corroborates THIS business** — the business name must closely match `{{business_name}}` AND the
location must be consistent. If a candidate's employer or town doesn't match this lead, DROP them.
Wrong owner is worse than no owner.

Guardrails (fixed): `name` = clean full name only · never truncate to first name · `evidence` MUST
be a verbatim quote containing the person's name (no quote with the name → don't output them) · the
candidate must pass ENTITY-MATCH · NEVER invent a name, title, or email · if the business name IS a
person's name, output that person, evidence = the business name.

## Few-shots (this vertical's real roles)

**KEEP** — ch_directors: `"SMITH, John Andrew — Director (active, appointed 2011)"`; site text:
`"Meet the Team: John Smith, Managing Director ... Claire Smith, Office Manager ... Dean Cole,
Solar & Battery Installer ... Qualified Supervisor: Dean Cole"`
→ `[{"name":"John Smith","first_name":"John","title":"Managing Director","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"John Smith, Managing Director","source":"companies_house","email":""},
    {"name":"Claire Smith","first_name":"Claire","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Claire Smith, Office Manager","source":"website","email":""}]`
(Dean Cole is an installer and the QS — excluded on both counts.)

**EXCLUDE** — serp text: `"Tom Bradley - Solar Consultant - Sussex Solar Ltd"` and
`"Priya Nair - Territory Manager at GivEnergy"` → `[]`. The survey-visit closer, and an OEM
employee; neither is output.

**EMPTY** — site text: `"MCS Certified. NAPIT Approved. Tesla Powerwall Certified Installer. Family run
since 2010. Cut your bills and keep the lights on in a power cut with solar and battery storage —
book a free home survey."` → `[]`. No person is named; the badges and "family run" are not names.

## OUTPUT FIELDS

- contacts (JSON array, deduped by FULL name, `[]` if none, max 5)
- primary_name (explicit MD/director/owner/founder → else gm → else marketing → else sales_manager → else office_manager)
- primary_first_name
- primary_role (one of the role_bucket enum above)
- primary_is_owner (true | false)
- best_send_email (first contact email present → else the `{{emails}}` column → else blank)
- best_website (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/OEM dealer pages/`.gov.uk`; blank if none clearly belongs to this business)
- confidence (high | medium | low)
- needs_review (true ONLY if contacts is empty)

greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.

**Merge note:** run `merge-owner-reads.js` with `--trade-words "electric,electrical,electrics,solar,renewables,renewable,energy,power,battery,green,eco,solutions,systems,services,engineering,engineers,installations,heating,ltd,limited,uk,group"` — the default list is foundation-repair's.

## PER-VERTICAL CHECKLIST

- [x] Vertical named (UK MCS-certified home battery / backup-power installers).
- [x] Primary decision-maker named (Managing Director / Director / Owner).
- [x] KEEP roles reasoned for THIS trade (MD/director budget holder; GM; marketing; UK board-level sales).
- [x] EXCLUDE roles reasoned for THIS trade (installers/roofers, QS, surveyor/assessor/designer, solar consultant).
- [x] `role_bucket` enum trimmed (owner_or_partner | gm | marketing | sales_manager | office_manager | other).
- [x] 2–3 few-shots with this vertical's real role nouns (KEEP, EXCLUDE, `[]`).
- [x] Entity-match geography line set (UK nationwide, Companies House registered-name caveat).
- [x] All sources mapped into the one column (`{{ch_directors}}` + `{{site_text}}` + `{{serp_text}}`).
