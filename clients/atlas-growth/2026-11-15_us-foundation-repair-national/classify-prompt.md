# STEP 5e — site-text fit classification: US residential foundation repair (national, no review floor)

Rubric from `clients/atlas-growth/ICP.md`. One Haiku reader per `classify/in/batch_NNN.jsonl` (60 leads),
writing `classify/out/batch_NNN.json` for `apply-classify.js --fallback unclassified`.
With no review floor (operator 2026-11-15) this read is the ONLY quality gate, so it is strict on fit
and neutral on size: a one-truck operator that does residential foundation work is `residential_foundation`.

---

You classify US businesses for a prospect list of **companies that repair residential foundations or do the
closely related below-grade work for homeowners**: foundation repair, piering (steel/helical/push piers,
pressed pilings), slab and pier-and-beam leveling, house leveling, basement waterproofing, crawl space
repair / encapsulation, mudjacking / polyurethane slab lifting, bowing-wall repair. The offer sold to them
is Facebook lead generation that books foundation inspection appointments with homeowners.
Do the work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.
No web searches are needed — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `text` is the business's own website
(services page + home page, capped); `source` is `site` or `serp` (snippets only).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_foundation` | The text states that THIS company performs foundation repair, piering, house/slab leveling, basement waterproofing, crawl space repair/encapsulation, or slab lifting/mudjacking **for homes** as a real advertised service. A company that also does other concrete, restoration or remodeling work counts when one of these is a genuine service. `evidence` MUST quote the service phrase. No phrase to quote → not this verdict. |
| `foundation_unconfirmed` | Name/types say foundation/waterproofing/crawl space, but the text never states the service (thin page, generic "concrete services", directory-style placeholder). |
| `flatwork_concrete` | Concrete contractor whose text sells driveways, patios, sidewalks, stamped/decorative concrete, new slabs or pours — and NO foundation repair, leveling or lifting service. |
| `commercial_only` | Structural / foundation / waterproofing work for commercial, industrial, municipal, DOT or new-construction GC clients ONLY — no homeowner offer anywhere. |
| `new_construction_foundations` | Pours foundations for new homes / builders only (footings, new basements, ICF), no repair of existing homes. |
| `restoration_or_other_trade` | Water/fire/mold restoration, pest control, plumbing, roofing, general remodeling, landscaping, drainage-only or gutters — with no foundation / waterproofing / crawl space service in the text. (Restoration firms that DO advertise crawl space or basement waterproofing are `residential_foundation`.) |
| `not_contractor` | Wrong business: engineer, home inspector, supplier/manufacturer/distributor with no local installation, lead-gen aggregator or directory ("get matched with pros"), charitable foundation, collision shop, mover, a franchise corporate page with no service area. |
| `unclear` | No usable text (empty, cookie wall, bot-check page, "site under construction", parked domain) AND nothing else to go on. |

Also return, for every lead:
- `services`: array from `["foundation_repair","piering","leveling","basement_waterproofing","crawl_space","slab_lifting","wall_repair","drainage","concrete_flatwork","other"]` — only services the text itself names; `[]` when none.
- `evidence`: a VERBATIM quote from the text, at most 25 words, supporting the verdict; `""` for `unclear`.
- `out_of_business`: `true` only when the text says the business has closed / retired / is no longer operating.
- `lead_gen`: `true` when the text reads as a lead-generation / referral site rather than a contractor's own site —
  it says it connects homeowners with "local contractors", "our network", "independent contractors", "partner
  companies", is "a referral service", "not a contractor", has a disclaimer that work is performed by third parties,
  or is a city-name template ("<Town> Foundation Repair Experts — the top foundation repair company in <Town>") with no
  owner, crew, history, licence or street address anywhere. `false` otherwise. This is a FLAG, not a verdict: still
  give the `business_type` the services text supports (a lead-gen site selling foundation repair stays
  `residential_foundation` with `lead_gen: true`).

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned on this vertical (2026-09-11 US, UK and AU runs):
- **A Google category alone never qualifies.** `Foundation` is also the category of charities; `Concrete contractor` is mostly flatwork.
- **"Structural repair" in the auto trade means frame work** — collision shops are `not_contractor`.
- **"House leveling" also brings in house movers** — a mover that only relocates buildings is `not_contractor`; one that levels homes in place counts.
- **Franchise and dealer-network branches** (Groundworks brands, Ram Jack, Olshan, Basement Systems, Supportworks, Perma-Pier, Anchorpoint, Du-West, Abry) are `residential_foundation` when the branch site sells the service — the brand is flagged elsewhere, never dropped here.
- **Size is NOT a criterion.** A small owner-operator with a real residential foundation service is in.
- A bot-check / captcha page is no text: use `unclear`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"residential_foundation","confidence":"high","why":"≤12 words","services":["piering","leveling"],"evidence":"verbatim ≤25 words","out_of_business":false,"lead_gen":false}, …]`
Return the counts per business_type.
