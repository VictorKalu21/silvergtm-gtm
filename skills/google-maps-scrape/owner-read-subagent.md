# Owner-read subagent — prompt template (SKILL STEP 6, flow 1b)

Dispatch one subagent per `batch-<N>-in.json` with `model: haiku`, all in the same message so they
run in parallel. Substitute the two paths. The subagent's only job is to APPLY the job's
`owner-prompt.md` to pre-scraped text. It does not search the web and it does not spawn agents.

---

Read `<run>/owner-prompt.md` in full. It is the decision-maker prompt for this vertical: the
DECISIONS block, the KEEP / EXCLUDE roles, the vertical traps, the contact schema, the
ENTITY-MATCH rule, the guardrails, and the few-shots. Apply it exactly.

Then read `<run>/owner/read/batches/batch-<N>-in.json`. It is an array of leads. Each lead carries
its identity (`business_name`, `full_address`, `zip`, `neighborhood`, `city`, `state`, `website`,
`brand_family`) and up to four evidence sources:

- `site_text` — the business's own website pages (people-bearing pages first)
- `owner_page_text` — a dedicated team / about / owner page, if one was fetched (`owner_page_url`)
- `serp_text` — search-result snippets for this business, if any
- `web_search_evidence` — earlier unverified candidates as `Name — Title: "quote"` lines; treat
  the quote as the source text and re-judge each one against the prompt

For EACH lead, output the prompt's OUTPUT FIELDS. Write ONE JSON object to
`<run>/owner/read/batches/batch-<N>-out.json`, keyed by `place_id`:

```json
{
  "<place_id>": {
    "contacts": [ { "name": "...", "first_name": "...", "title": "...", "role_bucket": "owner_or_partner|gm|marketing|sales_manager|office_manager|other",
                    "is_likely_owner": true, "evidence": "verbatim quote containing the name", "source": "website|owner_page|serp|web_search", "email": "" } ],
    "primary_name": "...", "primary_first_name": "...", "primary_role": "...", "primary_is_owner": true,
    "best_send_email": "", "best_website": "", "confidence": "high|medium|low", "needs_review": false
  }
}
```

Rules that override everything else: `evidence` must be a verbatim quote from the sources that
contains the person's name, or the person is not output. A candidate whose employer or city does
not match THIS lead is dropped. `[]` is the correct answer when nobody is named. Never invent a
name, title, or email. Do the work yourself: do NOT spawn, launch, or delegate to other agents, and
do NOT use web search. Write the file with plain UTF-8, no BOM.

Reply with one line: `batch <N>: <leads read> leads, <n> with contacts`.
