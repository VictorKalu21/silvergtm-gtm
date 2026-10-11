# STEP 5e — site-text fit classification: US residential home addition contractors

Rubric from `clients/atlas-growth/ICP-additions.md` (site-text verdicts). One Haiku reader per
`classify/in/batch_NNN.jsonl` (60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify US businesses for a prospect list of **companies that design and build additions to existing
single-family homes** — room / bump-out additions, second-storey additions, garage additions and
conversions, attached or detached in-law suites / ADUs, structural sunroom builds — and design-build
remodelers that advertise additions as a real service. The offer sold to them is Facebook lead generation
that books in-home design consultations for homeowners.
Do the work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.
No web searches are needed — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `text` is the business's own website
(services page + home page, capped); `source` is `site` or `serp` (snippets only).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `addition_builder` | The text states that THIS company builds **home additions for homeowners** as a real service — room additions, bump-outs, second-storey / second-floor additions, garage additions or conversions, in-law suites, ADUs / casitas / guest houses attached to or on the lot of an existing home, or structural sunrooms / four-season rooms it builds itself. A company that also does kitchens, baths, whole-home remodels, custom homes or decks still counts when additions are a genuine advertised service. `why` MUST quote the addition phrase (e.g. "we design and build room additions and second-story additions", "garage conversions and ADUs"). No phrase to quote → not this verdict. |
| `remodeler_unconfirmed` | A residential remodeler, design-build firm or general contractor where additions are plausible but the text does not state them: kitchen / bath / whole-home remodel led, "remodeling & construction" with a thin or generic services page, a custom builder that mentions "renovations" without additions. Kitchen-and-bath-ONLY remodelers land here, not in `addition_builder`. |
| `replacement_only` | Windows, doors, roofing, siding, gutters, bath-wrap / tub-to-shower conversions, closets, flooring, painting — no structural work, no additions anywhere in the text. |
| `new_construction_only` | A custom or production home builder, or a developer, with NO remodel / addition / renovation offer to existing-home owners. |
| `commercial_only` | Commercial, multifamily, tenant-improvement, institutional or government work ONLY — no homeowner offer anywhere. |
| `handyman_or_trade` | Handyman services, or a single-trade sub (framing, drywall, concrete, masonry, electrical, plumbing, HVAC, landscaping, decks/fences/patios) with no additions in the text. |
| `not_contractor` | Wrong business: a lead-gen aggregator or directory ("get matched with contractors"), an architect / designer / engineer who does not build, a supplier or showroom, a franchise HQ with no local operation, a real-estate or property-management firm, a pool / solar / restoration company with no additions. |
| `unclear` | No usable text (empty, cookie wall, bot-check page, "site under construction") AND nothing else to go on. |

Also return, for every lead:
- `addition_types`: array drawn from `["room","second_storey","garage_adu","sunroom","other"]` — only types the text itself names (bump-out / family-room / master-suite addition → `room`; second story / second floor / "build up" → `second_storey`; garage conversion / garage addition / ADU / casita / in-law suite / guest house → `garage_adu`; sunroom / four-season room / screened porch conversion the company builds → `sunroom`); `[]` when none is named.
- `evidence`: a VERBATIM quote from the text of at most 25 words that supports the verdict (the addition phrase for a builder; the replacement / new-build / commercial phrase for a drop); `""` for `unclear`.
- `services`: at most 10 words summarising what the business sells (e.g. "room additions, second stories, kitchen and bath remodels").

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned from the brief and the sibling verticals:
- **A Google category alone never makes a builder.** `Remodeler` or `General contractor` with no addition phrase in the text is `remodeler_unconfirmed` (or a drop verdict if the text sells only replacement / new builds / commercial).
- **"Addition" must mean a building addition.** "In addition to our kitchen services…" is not evidence; neither is an "additional services" heading. Quote only a phrase where the company says it builds additions.
- **"Residential" means homeowners.** HOA, multifamily, hotel and institutional work is commercial even when the word "residential" appears next to "multifamily residential".
- **Sunroom dealers that only install manufactured enclosures** (patio enclosures, screen rooms, pergolas, awnings) are `replacement_only`, not `addition_builder`; a company that frames and builds a four-season room onto the house is `addition_builder` with `sunroom`.
- A franchise or multi-location remodeler (Case, DreamMaker, Alure, Normandy …) is `addition_builder` when its branch site says it builds additions — the brand is flagged elsewhere, never dropped here.
- A bot-check / captcha page is no text: use `unclear`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"addition_builder","confidence":"high","why":"≤12 words","addition_types":["room","second_storey"],"evidence":"verbatim ≤25 words","services":"≤10 words"}, …]`
Return the counts per business_type.
