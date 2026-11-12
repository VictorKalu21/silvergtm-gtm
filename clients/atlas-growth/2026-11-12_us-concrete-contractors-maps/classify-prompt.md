# STEP 5e — site-text fit classification: US residential concrete contractors (driveways / patios / stamped)

Rubric from `clients/atlas-growth/ICP-concrete.md`. One Haiku reader per `classify/in/batch_NNN.jsonl` (60 leads),
writing `classify/out/batch_NNN.json` for `apply-classify.js --fallback unclear`.

---

You classify US businesses for a prospect list of **contractors that pour residential flatwork for homeowners —
driveways, patios, walkways, pool decks, stamped / decorative concrete**. The offer sold to them is Facebook lead
generation that books in-home driveway and patio estimates. Do the work YOURSELF. Do NOT spawn, launch, or delegate to
other agents. You personally write the output file. No web searches are needed — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line: `{place_id, name, city, google_types, source, text}`.
`text` is the business's own website (services page + home page, capped); `source` is `site` or `serp`; an empty `text`
means the fetch failed. `google_types` are the Yellow Pages categories (a hint, never proof).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_flatwork` | **IN.** The text states that THIS company pours / installs driveways, patios, walkways, sidewalks, pool decks, stamped or decorative concrete (or concrete resurfacing / overlays of those) **for homeowners**. A contractor that also does foundations, slabs, retaining walls, masonry, pavers, asphalt, or some commercial work still counts when residential flatwork is a genuine advertised service. `why` MUST quote the flatwork phrase (e.g. "stamped concrete patios and driveways"). No phrase to quote -> not this verdict. |
| `commercial_only` | Site-work / paving / concrete for commercial, industrial, municipal, DOT, developer or GC clients ONLY — no homeowner offer anywhere ("commercial and industrial concrete contractor", "we serve general contractors and developers"). |
| `supplier_or_readymix` | Ready-mix plant, concrete / aggregate / block supplier, precast or product manufacturer, equipment or tool store, decorative-concrete product or training company, landscape-materials yard — sells material or product, not a pour crew. |
| `pumping_cutting` | Concrete pumping, concrete cutting / sawing / coring / scanning, demolition / breaking, polishing-grinding or garage-floor-coating-only shops — a specialty sub-trade with no driveway / patio pouring of its own. |
| `foundation_or_lifting_only` | Foundation repair, waterproofing, basement, slab or foundation-only builders, or concrete lifting / leveling / mudjacking / polyurethane foam ONLY — no driveway / patio pour service. |
| `franchise` | A national or regional franchise / multi-state brand (e.g. Concrete Craft, Surecrete, Garage-floor-coating franchises, Duraamen, Decorative Concrete Kingdom, Stamped Concrete franchises) — flag it even if it pours patios. If it is a franchise AND the only evidence is the franchise site, use `franchise`. |
| `unclear` | No usable text (empty, cookie wall, bot-check, "under construction") AND nothing else to go on; or a real concrete business whose text names neither residential nor commercial work and no flatwork phrase. |

Also return, for every lead:
- `evidence`: a VERBATIM quote from the text of at most 25 words that supports the verdict (the flatwork phrase for
  `residential_flatwork`; the commercial / supplier / sub-trade phrase for a drop); `""` for `unclear`.
- `services`: at most 10 words summarising what the business sells.
- `also_commercial`: `true` when a `residential_flatwork` lead also says it serves commercial clients, else `false`.
- `confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules:
- **A Yellow Pages category alone never makes a residential flatwork contractor.** A "Concrete Contractors" listing whose
  text says nothing about driveways / patios / homes is `unclear`.
- **"Residential" means homeowners.** HOA, apartment-developer, multifamily, hotel and municipal work is commercial.
- **Asphalt-only paving** (no concrete) is `unclear` unless the text also offers concrete driveways / patios.
- **Pavers / hardscape-only** (no poured concrete) is `unclear` unless the text also offers concrete flatwork.
- A landscaper or general remodeler that lists concrete driveways / patios among services counts as
  `residential_flatwork` ONLY with a quotable phrase; otherwise `unclear`.
- A bot-check / captcha page is no text: use `unclear`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"residential_flatwork","confidence":"high","why":"≤12 words","evidence":"verbatim ≤25 words","services":"≤10 words","also_commercial":false}, …]`
Return the counts per business_type.
