# STEP 5e — site-text fit classification: US residential generator installers

Rubric from `clients/atlas-growth/ICP-generators.md` (site-text verdicts). One Haiku reader per
`classify/in/batch_NNN.jsonl` (60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify US businesses for a lead list of **residential home-standby generator installers**. The offer
sold to them is Facebook lead generation that books in-home generator estimate appointments for homeowners.
Do the work YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file.
No web searches are needed — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text, oem_brands, oem_tiers}`.
`text` is the business's own website (services page + home page, capped). `oem_brands` non-empty means the
business is on a generator manufacturer's dealer list (Generac, Kohler, Briggs & Stratton, Cummins, Champion).

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_generator` | Sells/installs home standby generators for homeowners as a real service. **An OEM-listed business (`oem_brands` non-empty) is `residential_generator` unless the text shows one of the drop verdicts below** — the dealer listing itself is the proof; a site that simply doesn't mention generators is still kept. A Maps-only business (`oem_brands` empty) needs generator install/sales/service for homes visible in the text. An electrician, HVAC or solar firm that lists whole-home/standby generators among its services counts. |
| `commercial_only` | Generator or electrical work for commercial / industrial / data-center / telecom / critical-power clients ONLY — no homeowner offer anywhere. |
| `small_engine_shop` | Outdoor power equipment, lawn mowers, chainsaws, portable-generator sales or small-engine repair — no standby installation. Also an ONLINE/e-commerce generator retailer (shop, cart, "free shipping") with no local installation service. |
| `plumber_gas_only` | A plumbing/HVAC firm whose only generator link is gas-line hookup, with no generator sales/install service of its own, AND no OEM installer tier. (A plumbing/HVAC firm that sells/installs generators, or sits on an OEM installer tier — Briggs INSTALLER/PLATINUM/ELITE IQ, Generac Elite/Premier/PowerPro, Kohler Gold/Platinum/Titanium — is `residential_generator`.) |
| `not_generator` | Wrong business: rental yard, supply house/distributor, RV/marine/auto, lead-gen aggregator or directory site, a manufacturer, or (Maps-only) an electrician/contractor with no generator service in the text. |
| `unclear` | No usable text (empty, cookie wall, "site under construction") AND nothing else to go on. |

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules learned from the pilot:
- For a Maps-only lead (`oem_brands` empty), `residential_generator` REQUIRES that `why` quotes the generator
  phrase from the text (e.g. "whole home generator installation"). No phrase to quote → `not_generator`.
- "Residential" means homeowners. Energy-compliance, benchmarking, NOI, property-management, utility-program or
  building-owner services are `commercial_only`/`not_generator`, even if the word "residential" appears
  (multifamily owners are not the homeowner buyer).
- A bot-check / captcha page is no text: use `unclear` (OEM-listed stays `residential_generator`).

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id present):
`[{"place_id":"…","business_type":"residential_generator","confidence":"high","why":"≤12 words"}, …]`
Return the counts per business_type.
