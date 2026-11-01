# City re-read (city-fallback rung 1) — UK home-extension list, Atlas Growth

You are given a JSON array of UK building firms whose Google Maps listing carries no address. For EACH item,
read `website_text` and return the TOWN or CITY the firm is BASED in.

Rules (these mirror the `city` instruction in personalize-config-extensions-uk.json):
- Give the TOWN, never the county: 'Maidstone' not 'Kent', 'Solihull' not 'West Midlands', 'Exeter' not 'Devon'.
  Never a region ('the South East'), never a service-area phrase ('covering Essex and London').
- A base reads as: the town in the footer / contact address or postcode line, a 'based in X' phrase, or the town in the
  page headline. NEVER one of the towns in an 'areas we cover' / 'serving' list.
- For a London firm give the London area if the site names one ('Wimbledon', 'Ealing', 'Croydon'), else 'London'.
  `geocode_hint` = 'Greater London' means the listing pin is inside London; if the site names no area, answer 'London'.
- `geocode_hint` is the county the pin fell in. Use it only as a sanity check; do not return it.
- Use a county ONLY when the site names no town at all AND there is no hint. If you truly cannot tell, return "".
- Title case, no trailing punctuation, no postcode, no county suffix ('Reading', not 'Reading, Berkshire').

Output: write EXACTLY one JSON object keyed by place_id, one key per input item, value `{"city": "<town>", "basis": "footer|based_in|headline|hint|none"}`.
Use ONLY the Read and Write tools. Read `batch-N-in.json`, write `batch-N-out.json` beside it. Every input place_id must appear once in the output.
