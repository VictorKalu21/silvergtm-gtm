# Observations Log (raw, append-only)

Raw single-run notes. **Append at Phase 7. NOT read at scope time** — this archive is consulted
only during a promotion review (see SKILL.md → "Reviewing & promoting lessons"). Newest on top.

An observation is a candidate, not a rule. It graduates into `process-rules.md` only after it
recurs across ≥2 distinct sources/clients OR the user promotes it. Mark each entry's status.

---

## 2026-09-12 — Atlas Growth / Google Maps (foundation repair) — via google-maps-scrape, planner NOT entered
**Status:** OBSERVATION (×3). Obs A is a RECURRENCE of R2 (n=2 now; candidate for the user to re-affirm as binding across skills).

**Obs A — R2 recurred in a different skill: regex/keyword extraction was used where an LLM rubric was prescribed.** Owner names were pulled from site text and SERP snippets with role-vocabulary regexes instead of the job's `owner-prompt.md` read by a model. 24 business names were banked as people. Same failure shape as the YC "$5 per call" false-positive. The prescription existed in two places (google-maps-scrape STEP 6a; this file R2) and was not followed because the model never read either before writing the parser. Fix shipped: google-maps-scrape STEP 0 (inventory sibling skills before improvising) + README.

**Obs B — the planner was skipped, so no source profile was written until after the fact.** The run went straight to google-maps-scrape because the source was "obviously Maps". The cost: the BBB-as-registry finding, the dealer-network roster seam, and the SERP-vendor dud all lived in a chat transcript for a day before landing in `library/`. Candidate rule: even when dispatch is obvious, Phase 7 (library write-back) is mandatory for the dispatched skill, and the dispatched skill's SKILL.md should say so.

**Obs C — "confirm on 3 leads that the source returns the FIELD you need" would have saved two SERP plans.** The scraper.tech SERP product returns `{title,url,description}` with `url` always empty; that was discoverable on the first 3 calls. Generalises R1's "test the axis the source actually varies on" to fields: test the FIELD before the volume.

---

## 2026-08-02 — Silver GTM / Clay-users multi-source run (claydar + community mirror + reactors)
**Status:** OBSERVATION (×3)

**Obs A — tech-detection-DB absence ≠ undetectable; read the vendor's install docs/CSP for a dedicated tag/CDN domain (candidate rule).** Wappalyzer had no Clay entry, BuiltWith 404'd, and the first research pass concluded "no client-side footprint" — wrong. Clay's Web Intent feature loads from dedicated CDN `claydar.com`, discovered in the CSP-allowlist section of Clay's own install docs, and an HTTP Archive requests-table scan turned it into a free 1,200-domain census of PAYING customers (domain-first — the usual name→domain last mile doesn't exist). Shape-matches R3 (presence proves the attribute: snippet installed ⇒ paying customer). n=1 vertical → stays observation; promote if it recurs on another SaaS.

**Obs B — engagement-pool composition mirrors the post AUTHOR's audience, not the topic; measure mix on a small import before scaling (candidate rule).** Same mechanic, same tool, same topic: reactors on a niche creator's Clay posts = 12.8% end-user (38.5% agencies + 27.4% vendor staff); reactors on the vendor's own product-announcement post = 34.7% end-user. Post age irrelevant (employer data current at export). Consequence: rank engagement sources by MEASURED end-user %, keep a per-source scoreboard, and never extrapolate a mechanic's yield from one author type.

**Obs C — orchestration: subagents that detach a background fetch then end their turn to "wait" self-terminate (process note).** 2 of 3 classification shards did this; fix = instruct foreground parallel batches (10-15 concurrent inside the script) or poll-between-work, never "I'll wait for the event." Bonus pattern: one revived agent independently re-verified the takeover agent's file (0 diff) — two-agent cross-verification of the same artifact is a cheap audit.

---

## 2026-07-12 — Industrial Defender / US federal registries (NERC + EPA SDWIS + TRI)
**Status:** PROMOTED (2026-07-12, user) → Obs A = **R3** (registry-as-attribute-proxy), Obs B = **R4** (name→domain first-class).

**Obs A — "registry-as-attribute-proxy" scoping pattern (candidate rule).** For an ICP defined by a
HIDDEN OPERATIONAL ATTRIBUTE the data brokers don't tag (has-OT / is-regulated / is-funded / runs-a-plant),
the winning source is the public REGISTRY WHERE MEMBERSHIP ITSELF PROVES THE ATTRIBUTE, then use whatever
size field that registry happens to expose as the ranking proxy. Here: NERC (register ⇒ owns bulk-electric
assets), SDWIS (community water system ⇒ SCADA), TRI (reports releases ⇒ industrial process) — 3 registries,
one per sector, identical downstream. Size proxy is the ONLY thing that varies (function flag / population /
facility count). **Recurrence:** this is the same shape as the Form-D play (SEC filing ⇒ recently-funded) →
≥2 distinct verticals, clears the gate. Generalizes the taxonomy's types 5&6. Worth promoting as a scoping rule.

**Obs B — name→domain enrichment is a first-class step, and parallel web-verify subagents nail it (candidate rule).**
EVERY registry/Maps/directory source ends name-only; domain is the Apollo-required must-have and the skill never
specified HOW. Method that worked: fan out N general-purpose subagents (~8-11 companies each), each web-VERIFIES
the official root domain, resolves SPV/abbrev/"system"-label names to the real operating org, returns strict JSON,
flags unverifiable as blank. Result: **34/35 = 97% fill**, correct SPV resolution (Grand Ridge Energy III→Invenergy,
"MDWASA - MAIN SYSTEM"→Miami-Dade WASD, Power City Partners→Alliance Energy). **Recurrence:** name→domain is the
universal last mile across Maps + directories + registries → clears the gate. Belongs as a defined Phase-6 enrichment
capability (with the subagent-fanout method + ~95% fill expectation), not a hand-wave.

**Also saw (source-specific, lives in the library profile, not for promotion):** holding-co/SPV/gov collapse is
mandatory on registries (DoD, Berkshire, GM Corp-vs-LLC dupes, "…as agent for…" names); municipal water resolves to
coarse city `.gov` domains; ECHO get_facilities returns a qid not rows (use Envirofacts `/efservice` which carries population).
**Dispatch-map hole:** none of the 3 extraction skills fit gov open-data APIs / bulk files — handled inline; a
`registry-extraction` capability is the gap. (Full recipe → `library/us-federal-registries--critical-infra-ot-operators.md`.)

---

## 2026-07-11 — db2b house / Google Maps US merchant-services ISO shops
**Status:** OBSERVATION (refines the 2026-07-09 allow-list note — now 2 verticals, OPPOSITE directions → candidate rule).
**Saw:** A `google_types` ALLOW-list (contains_any payment/merchant/etc.) — which HELPED the agency vertical (dropped
ice-cream/7-Eleven junk) — CATASTROPHICALLY hurt the merchant-services vertical: it kept only 99/2,181 (5%), because
real ISO/MS shops are typed inconsistently by Google ("Business to business service", "Financial institution",
"Financial consultant", "Loan agency", "Corporate office") and almost never carry a literal "payment"/"merchant"
type tag. Switching to DENY-ONLY (big-processor name-deny + junk-type deny, no allow-list) recovered it to 73% kept.
**The generalizable rule (candidate):** a google_types allow-list is only safe when the vertical is CLEANLY-TYPED
(the category's businesses reliably carry a distinctive shared type tag). For MESSY-TYPED B2B verticals (generic
"Business to business service"/"consultant"/"corporate office" tags), an allow-list nukes real firms — use DENY-ONLY
and let the category SEARCH be the universe definer. Decision signal: before adding an allow-list, eyeball the
google_types distribution of a sample; if the ICP's own firms scatter across generic B2B tags, skip the allow-list.
**Why it matters:** allow-list-vs-deny-only is currently treated as "always pair denies with an allow-list"
(google-maps-scrape STEP 5b, from the agency/LH runs). This vertical shows that's conditional. Worth promoting as a
scoped rule so a future messy-typed vertical isn't nuked to 5% before someone notices.

---

## 2026-07-09 — db2b house / Google Maps US marketing agencies
**Status:** OBSERVATION (allow-list point → 2nd occurrence, candidate for promotion review).
**Saw two things:**
1. **Deny-only Maps qualify leaks radius-fill junk.** A broad "marketing agency" scrape with deny
   rules but no allow-list shipped ice-cream cafes + a 7-Eleven (the API pads sparse category
   searches with nearby businesses). Adding a `google_types` contains_any ALLOW-list (matches ANY
   tag → keeps mis-primaried real agencies, drops junk) cut 8,898 leaks. This is the SAME lesson
   already baked into google-maps-scrape STEP 5b (from the LH runs) — now recurred here, so it's
   cross-source confirmed: **for any broad Maps category, pair denies with a google_types allow-list.**
2. **Slow-API-window workaround (engine has no concurrency).** scraper.tech Maps hit ~23s/call; the
   sequential engine → ~11h + total data loss on kill (writes only at end). Recovered by splitting the
   runsheet into 8 shards and running 8 concurrent `run-scrape.js` workers (each persists its own
   leads_clean.csv, resumable, own out-dir). ~8× speedup, ~90 min. Merge = concat + place_id dedupe.
   Candidate technique: when the API is slow OR the run is large, shard-parallel the runsheet.
**Why it matters:** point 1 is precision (don't ship junk); point 2 is a reusable robustness pattern
for the sequential Maps engine. Logged to google-maps-scrape IMPROVEMENTS.md too (engine concurrency gap).

---

## 2026-07-05 — Flexprice eval / YC directory
**Status:** PROMOTED → R1 (facet-not-depth stratification). Human-promoted (n=1 but general +
low-risk methodology).
**Saw:** Built the test around page-depth (head/mid/deep); depth was flat (AI-head 18% vs
AI-deep 20%). The category TAG drove quality: broad `AI` 19% vs `Infrastructure`/`AIOps` 55%.

## 2026-07-05 — Flexprice eval / YC directory
**Status:** PROMOTED → R2 (stated-vs-inferred split + LLM-not-regex). Human-promoted (general).
**Saw:** Rubric produced HIGH (stated signal) and MED (inferred). MED ~50–60% survived eyeball;
keyword scoring over-fired on an ambient "$5 per call" industry stat.

## 2026-07-05 — Flexprice eval / YC directory
**Status:** OBSERVATION (not promoted — folded into R1 as a corollary; source-specific detail
lives in the YC library profile). Revisit if it recurs on a non-YC source.
**Saw:** "Broad category label is a weak ICP proxy; look one layer down to infra/tooling
sub-tags." Closely tied to R1; the YC-specific numbers are in `../library/yc-directory--ai-usage-billing.md`.

---

## Entry template (append above this line, newest on top)

## YYYY-MM-DD — <client> / <source>
**Status:** OBSERVATION | PROMOTED → R<n> | RETIRED
**Saw:** <what happened, with numbers>.
