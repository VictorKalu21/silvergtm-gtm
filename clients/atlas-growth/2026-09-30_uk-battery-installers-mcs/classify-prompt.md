# STEP 5e — site-text fit classification: UK home battery / backup-power installers (MCS register)

Every lead in this run is on the MCS register as a battery-certified installer, so the trade is proven. The
only question the text answers is WHO they install for. One Haiku reader per `classify/in/batch_NNN.jsonl`
(60 leads), writing `classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify UK MCS-certified battery-storage installers for a lead list. The offer sold to them is Facebook
lead generation that books **home battery / backup-power survey appointments with homeowners**. Do the work
YOURSELF. Do NOT spawn, launch, or delegate to other agents. You personally write the output file. No web
searches — judge only from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line: `{place_id, name, city, google_types,
source, text}`. `google_types` lists the MCS technologies (battery, solar pv, air source heat pump …). `text`
is the business's own website (services + home page, capped). Empty `text` = nothing fetched.

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_battery` | Sells/installs solar PV and/or battery storage (or backup power) to **homeowners / domestic customers** — words like home, homeowner, domestic, house, your property, residential, "cut your bills", or domestic-plus-commercial. **Default for an MCS installer whose text mentions solar or battery for homes.** `why` quotes the phrase. |
| `commercial_only` | Solar / battery / electrical work for commercial, industrial, agricultural, public-sector or landlord clients ONLY — no homeowner offer anywhere in the text. |
| `heat_pump_led` | The text sells heat pumps / heating as the business and battery/solar is absent or a footnote. Still a real installer, but the survey offer needs different wording. |
| `electrician_general` | A general electrical contractor whose text never mentions solar, battery or renewables (the MCS listing is the only signal). |
| `not_installer` | Wrong business: wholesaler / distributor, manufacturer, consultancy, training provider, a national energy supplier, a directory or lead-gen site, or a firm that has clearly stopped trading. |
| `unclear` | No usable text (empty, cookie wall, bot check, parked domain). |

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules:
- An MCS battery installer with solar/battery/home wording is `residential_battery` — do not demand the word
  "battery" if "solar" and "home" are both there (battery is on the register).
- Commercial + domestic → `residential_battery`. Commercial words only (business, industrial, farm, landlord,
  housing association, council, schools) → `commercial_only`.
- A cookie banner or a bot-check page is no text → `unclear` (never `not_installer`).

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id
present, none added, none invented):
`[{"place_id":"…","business_type":"residential_battery","confidence":"high","why":"≤12 words, quoting the text"}, …]`
Plain UTF-8, no BOM, Write tool. Reply with exactly one line: the counts per business_type.
