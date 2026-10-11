# STEP 5e — site-text fit classification: US residential water / mold / fire restoration contractors

Rubric from `clients/atlas-growth/ICP-restoration-us.md` (site-text verdicts). One Haiku reader per
`classify/in/batch_NNN.jsonl` (60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify US businesses for a prospect list of **companies that perform water damage restoration,
mold remediation, fire/smoke restoration, sewage/biohazard cleanup or storm damage repair for
homeowners**. The offer sold to them is Facebook lead generation that books in-home mold and water
damage inspection appointments for homeowners. Do the work YOURSELF. Do NOT spawn, launch, or delegate
to other agents. You personally write the output file. No web searches — judge only from the text given.

Read `/home/user/silvergtm-gtm/clients/atlas-growth/2026-10-11_us-restoration-remediational/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `google_types` are the directory's service tags
(e.g. "water damage restoration service|mold remediation service"); `text` is the business's own website
(services page + home page, capped); `source` is `site` or `serp` (snippets only).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_restoration` | The text states that THIS company performs restoration / remediation / cleanup (water, flood, mold, fire, smoke, sewage, biohazard, storm) **for homeowners or residential property** — "your home", "homeowners", "residential", "houses", "basements", "families". A company that also does commercial work still counts. `why` MUST quote the residential phrase. No residential phrase to quote → not this verdict. |
| `restoration_unconfirmed` | A restoration / remediation company (name, tags or text say it restores or remediates) whose text never says who it serves, or whose page is thin or generic ("24/7 emergency restoration" with nothing about homes or businesses). |
| `commercial_only` | Serves commercial, industrial, institutional, multifamily-management, hospitality or insurance-carrier / large-loss clients ONLY — no homeowner offer anywhere in the text. |
| `inspection_only` | Mold inspection, testing, assessment, air-quality testing, home inspection, asbestos / lead survey — and NO remediation or restoration service of its own anywhere in the text. |
| `cleaning_only` | Carpet, upholstery, tile, duct, janitorial or house cleaning, with NO water / fire / mold restoration service stated. |
| `adjacent_trade` | Roofing, plumbing, HVAC, general contractor, remodeler, painter, waterproofing-only, junk removal — the text never claims restoration or remediation work (a "storm damage roofing" company is adjacent, not restoration). |
| `not_restoration` | Wrong business: public adjuster, laboratory, equipment / chemical supplier, engineer, consultant, training provider, franchisor corporate site with no local service, a lead-gen aggregator or directory ("get matched with restoration companies"), a government or insurance site. |
| `unclear` | No usable text (empty, cookie wall, bot-check page, "site under construction") AND nothing else to go on. |

Also return, for every lead:
- `services_offered`: array drawn from `["water","mold","fire","sewage","biohazard","storm","asbestos","reconstruction","cleaning","inspection"]` — only services the text itself names; `[]` when none.
- `insurance_work`: `true` when the text mentions insurance claims, adjusters, direct insurance billing or "we work with your insurance"; else `false`.
- `evidence`: a VERBATIM quote from the text of at most 25 words that supports the verdict (the residential phrase for a keep; the commercial / inspection / cleaning phrase for a drop); `""` for `unclear`.
- `services`: at most 10 words summarising what the business sells (e.g. "water and mold remediation, fire restoration, rebuild").

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned from the brief and the sibling verticals:
- **A directory tag alone never makes a residential restorer.** `water damage restoration service` with no residential phrase in the text is `restoration_unconfirmed`.
- **"Residential" means homeowners.** Apartment-complex, HOA, property-management and multifamily work is commercial even when the word "residential" appears next to "multifamily" or "property managers".
- **A franchise branch** (SERVPRO, ServiceMaster, PuroClean, Paul Davis, 911 Restoration, Rainbow, BELFOR, ATI, BluSky …) is `residential_restoration` when the site says it serves homes — the brand is flagged elsewhere, never dropped here. A franchisor page that only sells franchises is `not_restoration`.
- **Mold inspection + remediation** on the same site is `residential_restoration` (if homes are named) or `restoration_unconfirmed`; `inspection_only` requires that remediation is absent or explicitly refused ("we do not perform remediation").
- A bot-check / captcha page is no text: use `unclear`.

Write `/home/user/silvergtm-gtm/clients/atlas-growth/2026-10-11_us-restoration-remediational/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"residential_restoration","confidence":"high","why":"≤12 words","services_offered":["water","mold"],"insurance_work":true,"evidence":"verbatim ≤25 words","services":"≤10 words"}, …]`
Return the counts per business_type.
