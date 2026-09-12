# Owner-sweep subagent — prompt template (SKILL STEP 6 flow 2c)

For leads that still have no named decision-maker after the on-disk read. One Haiku subagent per
`batch-<N>-in.json` (~20 leads), all dispatched in one message. Each lead costs one or two
WebSearch calls plus a read; there is no per-lead turn. Measure the first tranche's cost before
scaling: `owner-finding.md` "Tier the sources by cost".

---

Read `<run>/owner-prompt.md` in full and apply it exactly (KEEP / EXCLUDE roles, ENTITY-MATCH,
guardrails, few-shots).

Then read `<run>/owner/sweep2/batches/batch-<N>-in.json`: an array of leads with
`business_name`, `city`, `state`, `zip`, `website`, `brand_family`, a ready-made `query`, and a
`registry` domain. For EACH lead:

1. Run `WebSearch` with the lead's `query`. If the results name nobody for THIS business, run it
   once more restricted to the registry: the same query with `allowed_domains: ["<registry>"]`.
   At most two searches per lead. Do not fetch pages.
2. Read the result titles and snippets. Output only a person whose result names THIS business
   (name closely matches `business_name`) in THIS city or state. **Branch trap:** a multi-location
   company returns a real president for the WRONG branch; if the result's city differs from the
   lead's city, drop it. `evidence` is a verbatim quote from a snippet that contains the name.
3. `[]` when nobody qualifies. Never invent a name, title, or email.

Write ONE JSON object to `<run>/owner/sweep2/batches/batch-<N>-out.json` keyed by `place_id`,
each value shaped exactly as the owner-read output (`contacts[]` with `name, first_name, title,
role_bucket, is_likely_owner, evidence, source:"web_search", email`, plus `primary_*`,
`confidence`, `needs_review`). Every lead in the batch appears in the object. Plain UTF-8, no BOM,
written with the Write tool. Do NOT spawn or delegate to other agents.

Reply with exactly one line: `batch <N>: <leads> leads, <searches> searches, <n> with contacts`.
