# STEP 5e — site-text fit classification: US residential in-ground pool builders

Rubric from `clients/atlas-growth/ICP-pools.md` (site-text verdicts). One Haiku reader per
`classify/in/batch_NNN.jsonl` (60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify US businesses for a prospect list of **companies that build and install new residential
in-ground swimming pools** (custom gunite/shotcrete/concrete, fiberglass, vinyl-liner). The offer sold
to them is Facebook lead generation that books in-home pool design consultations for homeowners.
Do the work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.
No web searches are needed — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `text` is the business's own website
(services page + home page, capped); `source` is `site` or `serp` (snippets only).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `inground_builder` | The text states that THIS company designs, builds, constructs or installs **new in-ground swimming pools for homeowners** as a real service — gunite/shotcrete/concrete, fiberglass (incl. a dealer that installs the shells it sells), or vinyl-liner. A company that also cleans, services, remodels or sells supplies still counts when new construction is a genuine advertised service. `why` MUST quote the construction phrase (e.g. "we design and build custom gunite pools", "fiberglass pool installation"). No phrase to quote → not this verdict. |
| `builder_unconfirmed` | A pool company (name/types say pool) where new construction is plausible but the text does not state it: remodel / renovation / resurfacing / replastering-led, "pools & spas" with a thin or generic services page, a fiberglass dealer that lists models but never says install. |
| `service_only` | Cleaning, weekly maintenance, chemicals, repairs, equipment/pump/heater repair, leak detection, openings/closings — and NO new in-ground construction anywhere in the text. |
| `retail_only` | A supply store / chemicals / equipment / hot-tub or above-ground pool retailer (incl. e-commerce) with no in-ground installation service of its own. |
| `commercial_only` | Builds for commercial, municipal, HOA, hotel, waterpark, aquatic-facility or competition clients ONLY — no homeowner offer anywhere. |
| `not_pool` | Wrong business: billiards, swim school, gym, landscaper/contractor with no pool construction in the text, a lead-gen aggregator or directory site ("get matched with pool builders"), a manufacturer or distributor with no local installation, a pool-design software/plan seller. |
| `unclear` | No usable text (empty, cookie wall, bot-check page, "site under construction") AND nothing else to go on. |

Also return, for every lead:
- `pool_types`: array drawn from `["fiberglass","gunite_concrete","vinyl_liner","other"]` — only types the text itself names (shotcrete/gunite/concrete → `gunite_concrete`; "vinyl" / "liner" → `vinyl_liner`); `[]` when none is named.
- `evidence`: a VERBATIM quote from the text of at most 25 words that supports the verdict (the construction phrase for a builder; the service/retail phrase for a drop); `""` for `unclear`.
- `services`: at most 10 words summarising what the business sells (e.g. "custom gunite pools, outdoor kitchens, remodels, weekly service").

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned from the brief and the sibling verticals:
- **A Google category alone never makes a builder.** `Swimming pool contractor` with no construction phrase in the text is `builder_unconfirmed` (or `service_only` if the text sells only service).
- **Above-ground pools do not count** as in-ground construction. A retailer that "installs" above-ground pools or hot tubs is `retail_only`.
- **"Residential" means homeowners.** HOA, multifamily, hotel and municipal work is commercial even when the word "residential" appears next to "multifamily residential".
- A franchise or multi-location builder (Blue Haven, Premier Pools & Spas, Anthony & Sylvan, Presidential, Shasta …) is `inground_builder` when its branch site says it builds — the brand is flagged elsewhere, never dropped here.
- A bot-check / captcha page is no text: use `unclear`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"inground_builder","confidence":"high","why":"≤12 words","pool_types":["gunite_concrete"],"evidence":"verbatim ≤25 words","services":"≤10 words"}, …]`
Return the counts per business_type.
