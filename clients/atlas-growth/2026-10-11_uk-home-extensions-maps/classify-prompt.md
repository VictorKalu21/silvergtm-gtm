# STEP 5e — site-text fit classification: UK residential home-extension contractors

Rubric from `clients/atlas-growth/ICP-extensions-uk.md` (site-text verdicts). One Haiku reader per
`classify/batch_NNN.jsonl` (60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify UK businesses for a prospect list of **building firms that design and/or build residential
home extensions** — single- and double-storey rear/side extensions, side returns and wrap-arounds, kitchen
extensions, loft conversions (dormer, hip-to-gable, mansard, Velux), garage and basement conversions, and
design-and-build firms that sell the whole project to a homeowner. The offer sold to them is Facebook lead
generation that books in-home extension design consultations for homeowners.
Do the work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.
No web searches are needed — judge only from the text given.

Read `<RUN>/classify/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `text` is the business's own website
(services page + home page, capped); `source` is `site` or `serp` (snippets only).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `extension_builder` | The text states that THIS company **builds** (constructs, carries out, undertakes, delivers, project-manages its own build of) home extensions, loft conversions, garage or basement conversions, or complete design-and-build projects **for homeowners**. A firm that also does renovations, refurbishments, new builds, kitchens or roofing still counts when extension/conversion work is a genuine advertised service. `why` MUST quote the build phrase (e.g. "we build single and double storey extensions", "loft conversion specialists", "design and build service from planning to completion"). No phrase to quote → not this verdict. |
| `builder_unconfirmed` | A general builder / building contractor / renovation firm whose text is generic ("all aspects of building work", "no job too small", "property refurbishment") and never names extensions or conversions — plausible, not stated. Also: a firm whose only extension evidence is a Google category or the business name. |
| `design_only` | Architects, architectural designers / technologists, planning consultants, drawing services, "design and planning" firms, online design platforms — the text sells drawings, planning applications or building-regs packages and **never says this company builds**. A "design and build" firm that states it builds is `extension_builder`, not this. |
| `conservatory_glazing_only` | Conservatory / orangery / garden-room / porch installers, window and door companies, glazing firms — glazed structures and glazing only, no brick-and-block extension or loft/garage conversion build offered. (A conservatory firm that also builds brick extensions or orangeries with a builder's base IS `extension_builder`.) |
| `trade_only` | A single-trade firm — roofing, carpentry/joinery, plastering, bricklaying, electrical, plumbing/heating, kitchen or bathroom fitting, landscaping, decorating, handyman/property maintenance — with no extension or conversion build offered. |
| `new_build_only` | Housebuilders and developers selling new homes or plots, and firms that build only for developers — no homeowner extension offer anywhere. |
| `commercial_only` | Builds for commercial, industrial, retail, education, healthcare, social-housing or local-authority clients ONLY — no homeowner offer anywhere. |
| `not_builder` | Wrong business: hair/lash extensions, estate agent, builders merchant, plant hire, surveyor-only, engineer-only, a lead-gen aggregator or directory ("get quotes from local builders"), a franchise HQ with no local delivery, software. |
| `unclear` | No usable text (empty, cookie wall, bot-check page, "site under construction") AND nothing else to go on. |

Also return, for every lead:
- `work_types`: array drawn from `["rear_side_extension","double_storey","kitchen_extension","loft_conversion","garage_conversion","basement_conversion","orangery_conservatory","renovation_refurb","new_build","design_and_build"]` — only types the text itself names; `[]` when none is named.
- `evidence`: a VERBATIM quote from the text of at most 25 words that supports the verdict (the build phrase for a builder; the design/trade/glazing phrase for a drop); `""` for `unclear`.
- `services`: at most 10 words summarising what the business sells (e.g. "extensions, loft conversions, full refurbishments, new kitchens").
- `residential`: `true` when the text addresses homeowners / domestic / residential clients; `false` when commercial-only; `null` when it does not say.

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned from the brief and the sibling verticals:
- **A Google category alone never makes a builder.** `Construction company` with no extension phrase in the text is `builder_unconfirmed` (or `trade_only` / `commercial_only` if the text says only that).
- **"Design and build" means the company builds** — it is this trade's own phrase for selling the whole project, and such a firm is `extension_builder` even when its team page is all architects. Only a firm that explicitly sells drawings and planning with no build service is `design_only`.
- **Loft conversions count as extensions** for this list; so do garage and basement conversions. A loft-only specialist is `extension_builder`.
- **"Residential" means homeowners.** Social housing, HMO landlords' portfolios, developers and commercial fit-out are not the homeowner offer; "domestic and commercial" counts as residential.
- A roll-up or multi-branch brand (Build Team, Simply Extend, Econoloft, Absolute Lofts, Landmark Lofts …) is `extension_builder` when its site says it builds — the brand is flagged elsewhere, never dropped here.
- A bot-check / captcha page is no text: use `unclear`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"extension_builder","confidence":"high","why":"≤12 words","work_types":["rear_side_extension","loft_conversion"],"evidence":"verbatim ≤25 words","services":"≤10 words","residential":true}, …]`
Return the counts per business_type.
