> ⚠️ **This is a worked EXAMPLE (LNP healthcare + auto/retail), not the prompt to ship.**
> The decision-maker prompt is regenerated per sub-scrape. Fill `owner-prompt.template.md`
> from the job's ICP / target role / offer and save the result to
> `<client>/<subscrape-slug>/owner-prompt.md` (see SKILL.md STEP 6a). Use the buckets and
> few-shots below as a reference for what a good *filled* prompt looks like — do not paste
> them verbatim for a different vertical.

# Clay nano prompts — multi-contact extraction WITH exclusions (EXAMPLE: LNP healthcare/auto)

Design philosophy: a small model is good at **extracting** named people and **excluding** obvious non-decision roles by keyword, but bad at **reasoning out which provider "owns" the practice**. So: extract every named decision-maker + the licensed providers, **EXCLUDE support/non-decision staff by role**, and emit `is_likely_owner` as a HINT (not a hard filter). Downstream you target `is_likely_owner=true` + `office_manager`; other providers are backups.

CONTACT OBJECT SCHEMA:
{ "name":"Forbes Morse",            // CLEAN full name only (first + last). NO "Dr."/honorifics, NO credentials. This is what you send.
  "first_name":"Forbes",
  "title":"Dr., Owner/Dentist",      // honorific + credentials + role live HERE, never in name
  "role_bucket":"owner_or_partner",  // owner_or_partner | provider | gm | office_manager | sales_manager | marketing | other  (retail primary targets: owner_or_partner, gm, sales_manager, marketing)
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "email":"" }

⚠️ ENTITY-MATCH (CRITICAL — read first): the search text (esp. `=== LINKEDIN ===`) often contains people from DIFFERENT same-name businesses in OTHER cities (e.g. "Dream Motor Group" Florida, "Redline Automotive" Orange CA, "Half Price Auto"). You are given the lead's full identity: `{{business_name}}`, `{{full_address}}`, `{{zip}}`, `{{neighborhood}}`, `{{city}}`. **Only output a person whose result corroborates THIS business** — the business name must closely match `{{business_name}}` AND the location must be consistent (same city/neighborhood/AZ; a profile in another state/metro = REJECT). If a candidate's employer or city doesn't match this lead, DROP them. Wrong owner is worse than no owner.

EXCLUDE — never output anyone whose role is support / non-decision staff (any business type). Drop if their title/role matches:
**Healthcare:** hygienist · dental/medical/vet assistant · any "… assistant" · vet technician / vet tech · PTA / PT aide / athletic trainer · esthetician / laser technician · chiropractic assistant · hygiene coordinator.
**Retail / auto / dealership:** salesperson / sales associate / sales consultant / sales rep / "car salesman" · finance & insurance (F&I) manager / finance manager · service technician / mechanic / service advisor / service writer · parts staff / parts manager · detailer / lot porter / lot attendant · recon · BDC rep / internet sales rep · car buyer.
**Any business:** receptionist / front desk / front office · scheduling / insurance / billing / treatment coordinator · intern / extern / student / resident / fellow.
KEEP: owners / partners / founders / **dealer principals** · the licensed providers (dentist, doctor, chiropractor, DPT, dermatologist, veterinarian) · **general manager (GM) / operations manager** · office / practice manager · **sales manager / sales director** · marketing manager / coordinator / director.

Guardrails: `name` = clean full name only (strip "Dr."/credentials into `title`) · never truncate to first name · `evidence` must be a verbatim quote containing the person's name · the candidate must pass ENTITY-MATCH above · NEVER invent.

================================================================
COLUMN A — "Team from Website"   (input: {{site_text}})
================================================================
ROLE: From a local business's WEBSITE text, extract EVERY named decision-maker — owners/partners, each licensed provider, office/practice manager, marketing. We want MULTIPLE contacts. NEVER invent a name.
INPUT: Business name: {{business_name}} · Website text: {{site_text}}  (may be empty)

RULES:
- Include every clearly-affiliated NAMED person whose role is KEEP (above). role_bucket ∈ owner_or_partner | provider | office_manager | marketing | other.
- EXCLUDE support/non-decision staff by role (see EXCLUDE list): hygienists, assistants (dental/medical/vet), PTAs/aides, estheticians/laser techs, receptionists/front desk, patient/treatment/scheduling/billing coordinators, interns/students/residents. Do NOT output them.
- is_likely_owner = true when: explicit owner/founder wording; OR the business name contains their surname; OR they're the clearly lead/solo/most-prominent provider (do NOT require the word "owner").
- The office/practice manager is a high-value contact — include whenever named.
- `name` = CLEAN full name only (first + last). Strip "Dr."/honorifics and credentials (DDS/DMD/MD/DVM) into `title`. Never truncate to first name.
- evidence (per contact) = a verbatim quote from the text that contains that person's name. No quote with the name → don't include them. NEVER invent.
- If the business name IS a person's name (e.g. "Varadi Zoltan DDS"), output that person even if body text is thin; evidence = the business name.

OUTPUT: w_contacts = JSON array of objects (schema above; [] only if no named KEEP person at all). Plus w_primary_name (clean full name), w_primary_first_name, w_primary_role, w_primary_is_owner, w_confidence (high|medium|low). primary = explicit owner/founder → else office manager → else lead provider.

FEW-SHOT:
1) site_text "Dr. Lisa Tran, Owner. Associate dentist Dr. Mark Webb. Hygienist Jamie Cole, RDH. Dental Assistant Pat Ruiz. Office Manager Rosa Diaz." →
   [{"name":"Lisa Tran","first_name":"Lisa","title":"Dr., Owner","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Dr. Lisa Tran, Owner","email":""},
    {"name":"Mark Webb","first_name":"Mark","title":"Dr., Associate","role_bucket":"provider","is_likely_owner":false,"evidence":"Associate dentist Dr. Mark Webb","email":""},
    {"name":"Rosa Diaz","first_name":"Rosa","title":"Office Manager","role_bucket":"office_manager","is_likely_owner":false,"evidence":"Office Manager Rosa Diaz","email":""}]
   (Jamie Cole = hygienist and Pat Ruiz = assistant → EXCLUDED.)
2) name="Varadi Zoltan DDS", thin text →
   [{"name":"Zoltan Varadi","first_name":"Zoltan","title":"Dr., DDS","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Varadi Zoltan DDS","email":""}]
3) no named KEEP person → []

================================================================
COLUMN B — "People from Search"   (input: {{serp_text}})
================================================================
ROLE: From GOOGLE search results about a local business, extract EVERY named person affiliated with it — owner, each named/lead provider, office manager — corroborating across snippets. We want MULTIPLE contacts. NEVER invent a name.
INPUT: Business name: {{business_name}} · Search results (titles, snippets, urls): {{serp_text}}  (may be empty)

RULES:
- Capture every clearly-affiliated NAMED person whose role is KEEP: explicit owner ("Meet the Business Owner: Dr X"), any lead/named provider (incl. repeated review mentions "Dr. X and his team"), office manager, marketing.
- EXCLUDE support/non-decision staff by role (hygienist, assistant, PTA/aide, esthetician/laser tech, receptionist/front desk, coordinators, interns/students) if named — do NOT output them.
- is_likely_owner = true for explicit owner/founder wording, business-name-surname match, OR the single most consistently-named provider across results (do NOT require the word "owner").
- `name` = CLEAN full name only — strip "Dr."/credentials into `title`. Never truncate to first name. CORROBORATE across results.
- evidence per contact = a verbatim quote from the snippets containing that person's name. NEVER invent.

OUTPUT: s_contacts = JSON array (same object schema as Column A). Plus s_primary_name, s_primary_first_name, s_primary_role, s_primary_is_owner, s_confidence.

FEW-SHOT:
1) "Meet the Business Owner: Dr Forbes Morse" →
   [{"name":"Forbes Morse","first_name":"Forbes","title":"Dr., Owner/Dentist","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Meet the Business Owner: Dr Forbes Morse","email":""}]
2) reviews repeatedly name "Dr. Block" at a single-dentist practice, no explicit owner →
   [{"name":"Block","first_name":"","title":"Dr., Dentist","role_bucket":"owner_or_partner","is_likely_owner":true,"evidence":"Can't go wrong with Dr. Block and his team","email":""}]
3) only generic directory listings, no person named → []

================================================================
MERGE (in Clay)
================================================================
all_contacts = dedupe(w_contacts + s_contacts) by FULL name. primary = w_primary if found & (w_primary_is_owner OR w_confidence != low) → else s_primary → else w_primary. best_send_email = first contact email present, else the {{emails}} column (office@/info@), else blank. greeting uses first_name; title kept separate so "Dr." never leaks into the name.
