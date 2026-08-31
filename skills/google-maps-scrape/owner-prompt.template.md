# Owner-prompt TEMPLATE (scaffold — do NOT edit per job)

This file is the **stable scaffold** for the decision-maker extraction prompt. It never
changes per job and never gets shipped to Clay/Haiku as-is. At the start of each
sub-scrape, Claude reads this scaffold + the job's ICP / target role / offer and writes a
**filled, job-specific** prompt to the sub-scrape's own folder:

```
<client>/<subscrape-slug>/owner-prompt.md
```

Everything in `<< >>` is a slot Claude fills by reasoning about THIS job. Everything
outside `<< >>` is fixed (schema, entity-match, guardrails, output contract, merge) and
must be copied through verbatim. The filled prompt MUST open with the `## DECISIONS` block
so the choices are auditable by a non-technical operator.

> **WHY this is per-vertical (read before filling):** the EXCLUDE/support roles are where
> verticals genuinely differ and where a small model goes wrong — a roofing firm's
> `roofer/tiler/labourer`, an electrical firm's `electrician/sparky/mate/improver`, a dental
> practice's `hygienist/assistant`, a dealership's `salesperson/F&I`. A generic prompt makes
> the model output a tradesperson or salesperson as the "owner." **A wrong owner is worse than
> no owner.** Reason the KEEP/EXCLUDE lists out for the ACTUAL trade every time — never copy
> another vertical's lists.

---

## ONE SHAPE — single column, all sources (every country)

There is ONE output shape regardless of country: **a single Clay nano column that reads ALL
available sources in one pass and returns ONE deduped `contacts` array.** Map every source the
job has into that one column — the model does the cross-source corroboration itself, and the
operator sets up only ONE Clay column. Source priority:

1. **`{{ch_directors}}` — Companies House (AUTHORITATIVE), when present.** Companies-House
   countries only; `build-clay-csv.js` loads `companies_house.jsonl` so the CSV carries
   `ch_directors` when available. Empty for non-registry countries (e.g. US) — just skip it.
2. **`{{site_text}}` — the company's own website.**
3. **`{{serp_text}}` — web / LinkedIn search snippets** (corroborate + entity-match).

Use the single `## FIXED — output contract` section below. (There is no 2-column variant.)

---

## PER-VERTICAL CHECKLIST (the filled prompt is not done until every box is true)

- [ ] **Vertical named** (e.g. "UK electrical contractors", "AZ dental practices").
- [ ] **Primary decision-maker named** for THIS offer (the prize role).
- [ ] **KEEP roles reasoned for THIS trade** — who can authorize the offer (mapped to buckets).
- [ ] **EXCLUDE/support roles reasoned for THIS trade** — the trade's own field/sales/admin
      staff, by their real role nouns (not another vertical's leftovers).
- [ ] **`role_bucket` enum trimmed** to the closed set this vertical uses.
- [ ] **2–3 few-shots use THIS vertical's real role nouns** (one KEEP, one EXCLUDE, one `[]`).
- [ ] **Entity-match geography line set** to this job's footprint.
- [ ] **All available sources mapped into the one column** — `{{site_text}}` + `{{serp_text}}` always, plus `{{ch_directors}}` when `companies_house.jsonl` exists for the job.

---

## DECISIONS — why these buckets (Claude writes this into the job prompt)

> Generated for: **<<client>> / <<subscrape-slug>>**
> ICP business types: **<<icp_business_types>>**
> Offer (one line): **<<offer>>**
> Target decision-maker(s) for this offer: **<<target_role(s)>>**
>
> KEEP these roles because they can say yes to the offer: <<keep_roles + 1-line why each bucket is in>>
> EXCLUDE these roles because they cannot authorize the offer / are support staff for this
> vertical: <<exclude_roles + 1-line why each is out>>
> Fallback role if the primary decision-maker isn't found: <<fallback_role + why it's acceptable for this offer>>
> Geography note (entity-match): leads are in <<footprint summary>>; reject same-name
> businesses in other cities/states.

---

## FIXED — copy verbatim into every job prompt

CONTACT OBJECT SCHEMA:
{ "name":"Forbes Morse",            // CLEAN full name only (first + last). NO "Dr."/honorifics, NO credentials.
  "first_name":"Forbes",
  "title":"Dr., Owner/Dentist",      // honorific + credentials + role live HERE, never in name
  "role_bucket":"<<one of the job's role_bucket enum>>",
  "is_likely_owner":true,
  "evidence":"...verbatim quote containing the name...",
  "source":"website",                // companies_house | website | serp  — which source named them
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

---

## SLOTS — Claude fills these from the job

`<<target_role(s)>>` — WHO the offer is sold to (from STEP 1's confirmed target role + the
offer line). This is the prize role.

`<<keep_roles>>` — the named roles for THIS vertical that can authorize the offer. Derive
from the ICP + offer, don't copy healthcare/auto defaults. Map each to a `role_bucket`.

`<<exclude_roles>>` — support / non-decision roles for THIS vertical that must never be
output. Reason them out for the specific business types (e.g. a med-spa's estheticians, a
dealership's F&I managers, a gym's front-desk staff).

`<<role_bucket enum>>` — the closed set of buckets this job uses, e.g.
`owner_or_partner | provider | gm | office_manager | sales_manager | marketing | other`.
Trim/add to fit the vertical.

`<<few_shots>>` — 2–3 worked examples using THIS vertical's real roles (one KEEP, one
EXCLUDE, one empty `[]`).

---

## FIXED — output contract (single column, all sources). Copy verbatim.

ONE Clay nano column. Map `{{business_name}}`, `{{full_address}}`, `{{zip}}`,
`{{neighborhood}}`, `{{city}}`, `{{emails}}`, `{{ch_directors}}` (if present), `{{site_text}}`,
`{{serp_text}}` into it. Read ALL sources in one pass and return ONE deduped `contacts` array.

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
contains their surname; OR they're the clearly lead/solo/most-prominent <<primary KEEP role>>.
Do not require the word "owner".

OUTPUT FIELDS:
- contacts          (JSON array of the schema objects, deduped by FULL name across all sources; `[]` if none; max 5)
- primary_name      (explicit owner/founder/director → else <<fallback_role>> → else lead <<primary KEEP role>>)
- primary_first_name
- primary_role      (one of this job's `role_bucket` enum)
- primary_is_owner  (true | false)
- best_send_email   (first contact email present → else the `{{emails}}` column → else blank)
- best_website      (the business's OWN official domain: `{{website}}` if already present, else the site found in site_text/serp_text ENTITY-MATCHED to THIS business — reject directories/social/trade-orgs/magazines/`.gov`; blank if none clearly belongs to this business. This recovers no-website leads — no separate website-finder needed.)
- confidence        (high | medium | low)
- needs_review      (true ONLY if contacts is empty)
greeting uses first_name; title kept separate so honorifics/credentials never leak into the name.
