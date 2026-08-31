# Process Rules (curated)

The small, capped set of PROMOTED process rules — things that change how you scope, test, or
score ANY run. **Read this at Phase 0 and re-check before designing the Phase 3–4 test.**

These are promoted, not raw. A rule enters here ONLY after it has recurred across ≥2 distinct
sources/clients OR the user explicitly promoted it (see the promotion gate in SKILL.md). Raw
single-run notes live in `observations-log.md` and are NOT read at scope time. Source-specific
facts (a given source's fields/method/fill) live in `../library/` profiles, not here.

**Cap: ~12 rules.** When you promote a new one, retire any that are stale or contradicted.

---

## R1 — Stratify the test by the source's own facet, not by page depth
When a source is organized by categorical **facets** (tags / categories / industries), make those
facets the PRIMARY test strata. Page depth is a decay axis ONLY when the source ranks by
relevance/recency AND you suspect rank affects record quality — otherwise depth is flat and
tells you nothing. Corollary: a broad top-level category (e.g. an "AI" tag) is often a weak ICP
proxy — **rubric-gate the broad facet and lead with the denser adjacent sub-facets** that the
stratification reveals. Test the axis the source actually varies on.
*Promoted 2026-07-05 (human). Evidence: YC run — page depth flat (AI-head 18% vs AI-deep 20%),
but the tag drove everything (broad AI 19% vs Infrastructure/AIOps 55%).*

## R2 — Split STATED vs INFERRED qualifieds; haircut the inferred; use an LLM rubric not regex
When the qualifying signal must be INFERRED from free text (the source doesn't state it), split
qualified rows into STATED (signal explicit → ~100% survive eyeball) and INFERRED (signal
implied → ~50–60% survive). Apply a survival haircut to the inferred bucket in any volume
estimate, and never quote a single blended "qualified %" without the split. Use the LLM rubric,
not keyword/regex — regex mistakes ambient mentions (an industry stat, a competitor's pricing)
for the company's own attribute.
*Promoted 2026-07-05 (human). Evidence: YC run — regex fired "qualified" on a "$5 per call"
market-size line; MED bucket materially thinner than HIGH on eyeball.*

## R3 — Registry-as-attribute-proxy: for a hidden-attribute ICP, source the registry where membership = the attribute
When the ICP is defined by a hidden OPERATIONAL attribute that data brokers don't tag (has-OT, is-regulated,
is-funded, runs-a-plant), the winning source is the public **registry where membership itself proves the
attribute** — then rank by whatever size field that registry happens to expose (function flag / population /
facility count). The registry surfaces the operator by its *operational reality*, not its marketing category,
which is exactly why 6sense/ZoomInfo miss the buyer. Generalizes taxonomy types 5 & 6.
*Promoted 2026-07-12 (human). Evidence: recurs across ≥2 verticals — Form-D (SEC filing ⇒ recently-funded) and
the Industrial Defender OT run (NERC/SDWIS/TRI ⇒ has-OT). Source-specific detail in
`../library/us-federal-registries--critical-infra-ot-operators.md`.*

## R4 — Name→domain is a first-class enrichment step; match the method to volume
Every registry/Maps/directory source ends NAME-only, but domain is the Apollo-required must-have — resolve it
deliberately, don't hand-wave it at the end. **Free-first** (Clearbit Autocomplete
`autocomplete.clearbit.com/v1/companies/suggest` / scripted SERP-parse) → **paid API or waterfall** above a few
hundred rows → **parallel web-verify subagents ONLY at sample scale** (~97% fill ≤50 rows, ~4,450 tokens/co —
never fan out for thousands, it tanks a metered/Max plan). Never domain-guess.
*Promoted 2026-07-12 (human). Evidence: the universal last mile across ≥2+ source types — Maps + directories +
registries. Cost/method detail in web-scrape-triage `references/methods.md`.*

**R4b — when the source carries its OWN identity signals, resolve by CONSENSUS and let "no domain" be a free junk filter.**
Some sources attach multiple on-record identity fields (app-store privacy-policy URL / developer-website / support-email /
`sellerUrl` / bundle-ID reverse-DNS; a directory's website + email; a filing's issuer URL). Don't take the first non-empty
one — **a domain named by ≥2 signals wins** (consensus); normalize every candidate to the **registrable root** (strip
subdomains: `pulsesense.chatmateapp.com`→`chatmateapp.com`); drop **junk hosts** (github/aws/netlify/app-ads-txt/
firebaseapp/free-mail/link-shorteners); use reverse-DNS/name-guess ONLY when the stem matches the entity name; and treat
**a row that resolves to nothing as a DROP, not a gap** — on flooded/consumer sources the un-resolvable rows are the spam,
so no-domain self-eliminates junk (~95–100% correct on the survivors). Never resolve to the *developer/agency* field — it's
often a person or an app-mill; discard rows that resolve to an app-dev agency.
*Promoted 2026-07-14 (human). Evidence: extends R4's "never domain-guess" — validated on registries + Maps + directories +
app stores (consensus method, TMZ 2,818 cos ~95–100% correct; junk resolved to nothing and dropped). Detail in
`library/app-stores--broken-app-and-app-owner-icp.md`.*

---

## How to use these
- At **Phase 0**, read this file. Carry the rules into scoping (Phase 1) and test design (Phase 3–4).
- If a rule conflicts with a base pipeline instruction, the **promoted rule wins** — the pipeline
  text is the general default; these rules are corrections learned from real runs.
- If a rule seems not to apply to the current source, say why and proceed — rules are scoped, not
  dogma. But do not silently ignore one.
