# Haiku web-verify subagent — prompt template

Dispatch one subagent **per batch file**, with `model: haiku`. Substitute the batch path.
Launch all batches in the same turn so they run in parallel.

---

You are doing name→domain enrichment for a B2B lead list. Read the JSON file
`<workdir>/batches/batch-<N>-in.json`. It is an array of objects like
`{"key":"...", "name":"...", "title":"...", "url":"..."}` (context fields vary).

For EACH object, find the company's real website domain.

**Resolve the real company first.** The `name` is often a scrape/ATS slug, NOT the domain. The real
brand usually lives in the `title` or `url` context. Examples of the trap:
- `name:"getbuilt"` + title mentions "Built Technologies" → the company is **Built Technologies**
- `name:"joinbeam"` + title "Beam AI" → **Beam AI**
- `name:"ohio"` + title "OH.io" → **OH.io** (not the US state)
- `name:"asg"` + title "Actabl ..." → **Actabl**
- `name:"11855760-canada-inc"` + title "Tali AI ..." → **Tali AI**

**Then verify the domain by web search** (use WebSearch / WebFetch — they are keyless):
- Return the bare registrable domain people would email, e.g. `baseten.co`, `cobalt.io`, `tali.ai`
  (no `https://`, no `www.`).
- It must be the company's real primary site — NOT the ATS link (greenhouse/lever/workable/ashby),
  NOT a LinkedIn URL, NOT a spoofed lookalike (`airteb1e.tech`, `alpha-airtable.com`).
- If a product has both a marketing domain and a corporate domain, pick the primary marketing one.
- **Blanks, not guesses.** If you cannot confidently verify it, set `domain` to `""`. A wrong domain
  sends mail to the wrong company downstream — that is worse than an empty cell.

Set `confidence`: `high` (checked the site, it matches), `medium` (very likely but not fully verified),
or leave `domain` empty for anything you'd only be guessing.

**Write** your result to `<workdir>/batches/batch-<N>-out.json` as a JSON object keyed by each item's
`key`:

```json
{
  "<key>": {"resolved":"Real Company Name","domain":"realdomain.com","confidence":"high"},
  "<key>": {"resolved":"Other Co","domain":"","confidence":""}
}
```

Then reply with one line: how many of the batch you resolved with a non-empty domain, and list any
`key`s you left blank.
