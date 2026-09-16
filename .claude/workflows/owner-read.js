export const meta = {
  name: 'owner-read',
  description: 'Apply the job owner-prompt.md to pre-scraped evidence: one Haiku reader per batch file',
  phases: [{ title: 'Read', detail: 'one Haiku agent per batch-N-in.json, writes batch-N-out.json' }],
}
const RUN = args.run
const N = args.batches
const idx = Array.from({ length: N }, (_, i) => i)
const results = await pipeline(idx, i => agent(
`Read \`${RUN}/owner-prompt.md\` in full. It is the decision-maker prompt for this vertical: the DECISIONS block, the KEEP / EXCLUDE roles, the vertical traps, the contact schema, the ENTITY-MATCH rule, the guardrails, and the few-shots. Apply it exactly.

Then read \`${RUN}/owner/read/batches/batch-${i}-in.json\`. It is an array of leads. Each lead carries its identity (business_name, full_address, zip, neighborhood, city, state, website, brand_family) and up to four evidence sources:
- site_text: the business's own website pages (people-bearing pages first)
- owner_page_text: a dedicated team / about / owner page, if one was fetched (owner_page_url)
- serp_text: search-result snippets for this business, if any
- web_search_evidence: earlier unverified candidates as 'Name — Title: "quote"' lines; treat the quote as the source text and re-judge each one against the prompt

For EACH lead in the batch, output the prompt's OUTPUT FIELDS. Write ONE JSON object to \`${RUN}/owner/read/batches/batch-${i}-out.json\`, keyed by place_id, with this shape per lead:
{"contacts":[{"name":"...","first_name":"...","title":"...","role_bucket":"owner_or_partner|gm|marketing|sales_manager|office_manager|other","is_likely_owner":true,"evidence":"verbatim quote containing the name","source":"website|owner_page|serp|web_search","email":""}],"primary_name":"...","primary_first_name":"...","primary_role":"...","primary_is_owner":true,"best_send_email":"","best_website":"","confidence":"high|medium|low","needs_review":false}

Rules that override everything else: evidence must be a verbatim quote from the sources that contains the person's name, or the person is not output. A candidate whose employer or city does not match THIS lead is dropped. [] is the correct contacts value when nobody is named, and every lead in the batch must appear in the output object. Never invent a name, title, or email. Do the work yourself: do NOT spawn, launch, or delegate to other agents, and do NOT use web search or fetch any URL. Write the file with plain UTF-8, no BOM, using the Write tool.

Reply with exactly one line: batch ${i}: <leads read> leads, <n> with contacts`,
  { label: `read:batch-${i}`, phase: 'Read', model: 'haiku' }))
const done = results.filter(Boolean)
log(`${done.length}/${N} batch reads returned`)
return { returned: done.length, lines: done }