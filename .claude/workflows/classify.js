export const meta = {
  name: 'classify',
  description: 'STEP 5e site-text fit classification: one Haiku reader per classify/in/batch_NNN.jsonl, applying the run classify-prompt.md',
  phases: [{ title: 'Classify', detail: 'one Haiku agent per batch_NNN.jsonl, writes classify/out/batch_NNN.json' }],
}
const RUN = args.run
const ids = Array.isArray(args.batchIds) ? args.batchIds : Array.from({ length: args.batches }, (_, i) => i)
const pad = i => String(i).padStart(3, '0')
const results = await pipeline(ids, i => agent(
`Read \`${RUN}/classify-prompt.md\` in full. It is the fit rubric for this vertical: the business_type table, the extra fields (pool_types, evidence, services), the rules, and the output contract. Apply it exactly.

Then read \`${RUN}/classify/in/batch_${pad(i)}.jsonl\` — one JSON object per line: {place_id, name, city, google_types, source, text}. Classify EVERY line.

Write \`${RUN}/classify/out/batch_${pad(i)}.json\` as a JSON ARRAY with one object per input line, every place_id present, exactly this shape:
[{"place_id":"…","business_type":"<one of the rubric's labels>","confidence":"high|medium","why":"≤12 words","pool_types":["fiberglass"|"gunite_concrete"|"vinyl_liner"|"other"],"evidence":"verbatim ≤25 words from the text, or empty","services":"≤10 words"}]

Rules that override everything else: a builder verdict needs the construction phrase quoted in evidence; no phrase to quote means it is not a builder. A Google category alone never makes a builder. No usable text is "unclear". Never invent a phrase. Do the work yourself: do NOT spawn, launch, or delegate to other agents, and do NOT use web search or fetch any URL. Write the file with plain UTF-8, no BOM, using the Write tool.

Reply with exactly one line: batch ${pad(i)}: <n> leads, counts per business_type`,
  { label: `classify:batch-${pad(i)}`, phase: 'Classify', model: 'haiku' }))
const done = results.filter(Boolean)
log(`${done.length}/${ids.length} classify batches returned`)
return { returned: done.length, lines: done }
