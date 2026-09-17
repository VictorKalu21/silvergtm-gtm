# Fit note — one line per lead, specific, spot-checkable (optional polish step)

`assemble.mjs` already writes a templated `fit_note` per lead:

> `<role> at <company>; <company> is hiring a <posting title> (<ats>, posted <date>) whose JD reads: "<evidence sentence>"`

That template is deliberately mechanical: every claim in it maps to a column the reviewer can check
(`role` ← the person's title, `posting title` + `date` ← the ATS JSON, `evidence` ← the JD sentence).
Use this prompt only if the client wants the note to read more naturally. Rules when rewriting:

1. Keep every fact that is in the template; add nothing that is not in the row. No adjectives about the company.
2. Keep the tech term verbatim as it appears in `evidence` (Terraform / CloudFormation / Bicep / Terragrunt / OpenTofu).
3. ≤ 30 words. British or American English per the client; no em-dashes.
4. If `evidence` is longer than ~15 words, quote the shortest fragment that still contains the tech term.

Input: the `leads_<date>.csv` rows as JSON. Output: the same rows with `fit_note` rewritten, as `leads_<date>_notes.json`
keyed by `linkedin_url` (fallback `name|company`). No BOM.
