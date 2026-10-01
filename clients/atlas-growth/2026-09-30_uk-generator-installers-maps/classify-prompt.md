# STEP 5e — site-text fit classification: UK standby / backup generator installers

Rubric from `clients/atlas-growth/ICP-generators-uk.md` (Maps-only list, option B) and the US run's
`2026-09-24_us-generator-dealers/classify-prompt.md`, adapted for the UK: there is no OEM dealer list here, so
EVERY lead is judged on its own text, and the UK adds a `hire_only` verdict because generator HIRE is the
dominant UK "generator" business. One Haiku reader per `classify/in/batch_NNN.jsonl` (60 leads), writing
`classify/out/batch_NNN.json` for `apply-classify.js`.

---

You classify UK businesses for a lead list of **standby / backup generator installers** — firms that sell and
install automatic standby (or backup) generators for homes and small premises. The offer sold to them is
Facebook lead generation that books generator quote / site-survey appointments. Do the work YOURSELF. Do NOT
spawn, launch, or delegate to other agents. You personally write the output file. No web searches — judge only
from the text given.

Read `<RUN>/classify/in/batch_<NNN>.jsonl`. One JSON object per line:
`{place_id, name, city, google_types, source, text}`. `text` is the business's own website (services page +
home page, capped at ~2,500 characters); `source` is `site` or `serp`; an empty `text` means nothing was
fetched.

Give each lead exactly one `business_type`:

| business_type | meaning |
|---|---|
| `residential_generator` | Sells and/or installs **standby / backup / home / automatic generators** as a real service, and the text shows it serves **homeowners or domestic premises** (words like home, homeowner, domestic, house, property owners, residential, "your home", power cuts at home), OR serves both domestic and commercial. An electrician, solar, gas or heating firm that lists standby/backup generator installation among its services counts. `why` MUST quote the generator phrase from the text. |
| `commercial_only` | Generator sales, install, service or maintenance for commercial / industrial / data-centre / healthcare / telecoms / construction / critical-power clients ONLY — no domestic or homeowner offer anywhere in the text. Typical: "diesel generator sets 20–2000 kVA", "load bank testing", "planned maintenance contracts", "UPS and standby power for business". |
| `hire_only` | Generator / plant / tool HIRE (rental) with no sales-and-install service for permanent standby sets. Event power, temporary power, site power. |
| `small_engine_shop` | Portable generators, garden machinery, lawn mowers, chainsaws, small-engine repair, or an ONLINE generator RETAILER (shop, basket, "free delivery") with no installation service. |
| `plumber_gas_only` | A plumbing / heating / gas firm whose only generator link is a gas or LPG connection for someone else's install — no generator sales/install service of its own. (A plumbing/gas firm that sells and installs generators is `residential_generator`.) |
| `not_generator` | Wrong business: an electrician or contractor with NO generator service in the text, a supplier / wholesaler / manufacturer, vehicle / marine / caravan electrics, a used-generator trader or "generators wanted" buyer, a directory / aggregator / lead-gen site, a hire desk for anything else, or any other trade. |
| `unclear` | No usable text (empty, cookie wall, bot check, "site under construction", parked domain) and nothing else to go on. |

`confidence`: `high` when the text states it plainly, `medium` when inferred.

Rules:
- `residential_generator` REQUIRES a quotable generator phrase in `why` (e.g. "standby generator installation
  for your home", "automatic backup generators for homes and businesses"). No phrase to quote → it is not
  `residential_generator`, whatever the business name or Google type says.
- A firm that does BOTH hire and permanent installation for homes/businesses is `residential_generator` (or
  `commercial_only` if only businesses are mentioned) — `hire_only` means hire and nothing else.
- Domestic + commercial → `residential_generator`. Commercial with no domestic word at all → `commercial_only`.
  "Property" alone is ambiguous: property developers / landlords / facilities managers are commercial.
- Servicing and maintenance of existing generators for homeowners counts as a real generator service.
- A cookie banner or a bot-check page is no text: use `unclear`.
- Never let `google_types` decide on its own: "Electric generator shop" with a hire-only text is `hire_only`.

Write `<RUN>/classify/out/batch_<NNN>.json` as a JSON ARRAY, one object per input line (every place_id
present, none added):
`[{"place_id":"…","business_type":"residential_generator","confidence":"high","why":"≤12 words, quoting the text"}, …]`
Plain UTF-8, no BOM. Reply with exactly one line: the counts per business_type.
