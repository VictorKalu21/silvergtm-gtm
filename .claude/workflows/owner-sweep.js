export const meta = {
  name: 'owner-sweep',
  description: 'Web-search sweep for still-unnamed leads: one Haiku agent per 20-lead batch, at most two WebSearch calls per lead',
  phases: [{ title: 'Sweep', detail: 'one Haiku agent per batch-N-in.json under owner/sweep2, writes batch-N-out.json' }],
}
const RUN = args.run
const N = args.batches
const idx = Array.from({ length: N }, (_, i) => i)
const results = await pipeline(idx, i => agent(
`Read \`${RUN}/owner-prompt.md\` in full and apply it exactly (KEEP / EXCLUDE roles, ENTITY-MATCH, guardrails, few-shots).

Then read \`${RUN}/owner/sweep2/batches/batch-${i}-in.json\`: an array of leads with business_name, city, state, zip, website, brand_family, a ready-made query, and a registry domain. Before anything else, load the search tool: call ToolSearch with query "select:WebSearch" (it is a deferred tool and is not callable until loaded). Then, for EACH lead:
1. Run WebSearch with the lead's query. If the results name nobody for THIS business, run it once more restricted to the registry: the same query with allowed_domains set to [the lead's registry]. At most two searches per lead. Do not fetch pages.
2. Read the result titles and snippets. Output only a person whose result names THIS business (name closely matches business_name) in THIS city or state. Branch trap: a multi-location company returns a real president for the WRONG branch; if the result's city differs from the lead's city, drop it. evidence is a verbatim quote from a snippet that contains the name.
3. [] when nobody qualifies. Never invent a name, title, or email.

Write ONE JSON object to \`${RUN}/owner/sweep2/batches/batch-${i}-out.json\` keyed by place_id, each value shaped:
{"contacts":[{"name":"...","first_name":"...","title":"...","role_bucket":"owner_or_partner|gm|marketing|sales_manager|office_manager|other","is_likely_owner":true,"evidence":"verbatim snippet quote containing the name","source":"web_search","email":""}],"primary_name":"...","primary_first_name":"...","primary_role":"...","primary_is_owner":true,"best_send_email":"","best_website":"","confidence":"high|medium|low","needs_review":false}
Every lead in the batch appears in the object. Plain UTF-8, no BOM, written with the Write tool. Do NOT spawn or delegate to other agents.

Reply with exactly one line: batch ${i}: <leads> leads, <searches> searches, <n> with contacts`,
  { label: `sweep:batch-${i}`, phase: 'Sweep', model: 'haiku' }))
const done = results.filter(Boolean)
log(`${done.length}/${N} sweep batches returned`)
return { returned: done.length, lines: done }