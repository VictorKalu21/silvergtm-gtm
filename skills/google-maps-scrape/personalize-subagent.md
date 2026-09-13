# Personalize subagent — prompt template (SKILL STEP 7b)

One Haiku subagent per `batch-<N>-in.json`, `model: haiku`, all launched in one message. It applies the
client's `personalize-config.json` to on-disk website text. No API, no web, no spawning. After every batch
run `build-plusvibe.js fill` and read the two flag lists; redo the flagged leads as a higher-numbered batch
(its values override). Substitute `<config>`, `<in>`, `<out>`, `<N>`, `<n>`.

---

Read `<config>` (template, per-placeholder instructions, the `rules` line, fallbacks) and `<in>` (an array
of <n> companies with business_name, city, state, google_types, website, website_text).

For EACH company, do exactly what the personalization tool does:

You are helping personalize a cold outreach email to <business_name>.
Known facts (from a data provider): city, state, google_types, business_name as given.
Website content: the website_text field.
Task: Determine one value per placeholder — business_type, inspection_type, inspection_singular,
project_type, city — following each instruction in the config VERBATIM.

The four trade values must agree with each other. Decide business_type first, then derive the others
FROM IT:
- inspection_type = the TRADE NOUN of business_type + "inspections" or "estimates" (whichever word the
  company uses). Trade nouns: foundation, basement, crawl space, leveling, concrete. NEVER the whole
  business_type phrase ("basement waterproofing inspections" is wrong; "basement inspections" is right).
  Never the word "free".
- inspection_singular = the singular of inspection_type.
- project_type = the outcome noun OF THAT SAME TRADE, singular, homeowner wording, reads before "jobs":
  foundation repair → repair; basement waterproofing → waterproofing; crawl space repair → repair or
  encapsulation; concrete leveling → leveling or lifting; house leveling → leveling. A foundation repair
  company does NOT get "waterproofing" because waterproofing appears somewhere on its site.
Rules:
- Base every value on the facts above — do not invent details.
- Each value is a short phrase (1-4 words) dropped directly into a sentence; lowercase except the city.
- Do not include the company name, quotation marks, or trailing punctuation.
- If you truly cannot tell, use the config's fallback for that placeholder.
- For `city`: if the known city is non-empty, repeat it exactly WITHOUT any trailing state code; only read it
  from the website when it is blank, and then give the city the company is based in.

Write ONE JSON object to `<out>`, keyed by place_id, each value `{"business_type": "...",
"inspection_type": "...", "inspection_singular": "...", "project_type": "...", "city": "...", "evidence":
"one short verbatim phrase from the website supporting business_type"}`. Single quotes inside evidence,
never double quotes. Plain UTF-8, no BOM, use the Write tool. Every place_id in the input must appear in
the output. Do NOT spawn other agents, do NOT search the web, do NOT fetch any URL.

Reply with one line: batch <N>: <n> companies personalized.
