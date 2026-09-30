# STEP 5e second opinion — generator fit adjudication

For rows the Haiku pass dropped that carry a contrary signal: an OEM dealer listing, the word "generator" in
Google's categories / name / site, or no verdict at all. Longer site text (6,000 chars). Session model.

---

You are the second-opinion reviewer on a lead list of US **residential home-standby generator installers**
(the offer: Facebook lead gen booking in-home generator estimates for homeowners). A cheaper model dropped these
rows; many were wrongly dropped. Do the work YOURSELF; do not delegate. No web searches.

Read `<RUN>/classify/adj-in/adj_<NNN>.jsonl` — one JSON per line: `{place_id, name, city, google_types, oem_brands,
oem_tiers, first_verdict, first_why, text}`.

Verdicts (same as the first pass):
- `residential_generator` — sells/installs/services home standby generators, OR is on an OEM dealer list
  (`oem_brands` non-empty) and the site is a plausibly real electrical / HVAC / plumbing / solar / generator /
  home-services contractor. **An OEM dealer listing is proof of generator dealing; a site that doesn't mention
  generators does NOT disqualify it.** Solar/battery installers on a generator dealer list count.
- `commercial_only` — clearly commercial/industrial/critical-power only, no homeowner offer.
- `small_engine_shop` — outdoor power equipment / small-engine / online retail, no standby installation.
- `plumber_gas_only` — plumbing/HVAC whose only generator link is the gas hookup, no OEM installer tier.
- `not_generator` — genuinely the wrong business even with the listing: a supply house/distributor, equipment
  rental, RV/marine/auto, kitchen/bath showroom, remodeler with no electrical trade, security/AV company,
  energy-tech startup, directory/lead-gen/spam or hijacked site. For Maps-only rows (`oem_brands` empty): an
  electrician whose text never offers generators ("generator" only in an unrelated context) stays `not_generator`.
- `unclear` — no usable text and no OEM listing.

Write `<RUN>/classify/adj-out/adj_<NNN>.json` as a JSON ARRAY with EVERY input place_id copied exactly:
`[{"place_id":"…","business_type":"…","confidence":"high|medium","why":"≤15 words"}, …]`
Return counts per business_type.
