# Employee-count estimator — TEMPLATE (industry-agnostic, reuse as-is)

A single reader prompt (Haiku per batch, the STEP 6 2b shape) that estimates how many people work at a
business, so the `employee_count >= N` size gate (an `enrich_rule`) has a number to act on. Not a
step on any run yet; not Clay.
Google Maps has no employee count, and structured providers (PDL/Clearbit) are thin on
5–15-person local firms — so this reads the **live site + search text** instead.

**This template is NOT per-vertical.** It reports a number; it makes no ICP/keep/exclude
judgment (that's the business-type classifier's job). Reuse it verbatim across clients/verticals.
The only thing that changes per run is the threshold, and that lives downstream in the config's
`enrich_rules` (e.g. `{"field":"employee_count","op":">=","value":5}`), NOT in this prompt.

## Setup
ONE reader prompt per batch item. Inputs: `{{business_name}}`, `{{city}}`, `{{website}}`, `{{site_text}}`,
`{{serp_text}}`. Output the JSON below.

## PROMPT (copy verbatim)

ROLE: Estimate how many people work at this business. Read the live site (prioritise
"our team" / "our attorneys" / "our advisors" / "meet the staff" / "about" / leadership
pages) plus `{{site_text}}` and `{{serp_text}}`.

COUNT distinct people you have real evidence of:
- named team / attorney / advisor / agent / provider / staff bios or headshots
- a staff directory or "our team" grid (count the entries)
- a stated headcount ("our team of 12", "20+ employees")
- a LinkedIn "X employees" / "X associated members" figure for THIS company

Do NOT count: clients, patients, reviewers, testimonials, partners at OTHER firms,
generic marketing copy, or the same person twice.

If several signals disagree, prefer a named-people count from the company's own site,
then a stated headcount, then LinkedIn.

OUTPUT (JSON only, nothing else):
{ "employee_count": <integer best estimate, or null>,
  "confidence": "high|medium|low",
  "basis": "team_page|staff_directory|stated|linkedin|inference",
  "evidence": "<short phrase of exactly what you counted, e.g. '6 attorney bios on /our-team'>" }

NULL RULE (critical): if there is NO staffing evidence at all, return `employee_count: null`
— NOT a small number, NOT 1. A null means "unknown". Downstream, null must route to review,
never auto-fail the size gate (a missing number is not a small business). One-person firms
DO exist — only output 1 when the site clearly shows a solo operator.
