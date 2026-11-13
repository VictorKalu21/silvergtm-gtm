# Owner-read task, sweep pass (one batch)

RUN = /home/user/silvergtm-gtm/clients/atlas-growth/2026-11-12_us-concrete-contractors-maps
N = the batch number you were given (no zero padding).

1. Read /home/user/silvergtm-gtm/skills/google-maps-scrape/owner-read-subagent.md in full and follow it exactly.
   Wherever it names a batch path, use RUN/sweep_in/read/batches/ .
2. Read RUN/owner-prompt.md in full: it defines who counts as the decision-maker for this offer (KEEP / EXCLUDE roles).
3. Read RUN/sweep_in/read/batches/batch-N-in.json in full (page through it if a read is truncated).
4. Write RUN/sweep_in/read/batches/batch-N-out.json: one JSON object keyed by place_id, one key per input lead, in the
   format the instruction file gives. Evidence must be a verbatim quote containing the name; `contacts: []` when nobody
   is named. Emails only when they appear in the text given. Plain UTF-8, no BOM.
5. Validate: the file parses as JSON and its keys are exactly the input place_ids.

Do the work yourself. Do not spawn agents, do not search the web, do not call any other tool or write any other file.
Reply with only: leads in batch, leads with a named contact, leads with a best_send_email.

Sweep-pass note: each lead carries its own site text PLUS search-result snippets. Snippets often name people at
same-name or similar-name firms elsewhere. Accept a person only when the snippet ties them to THIS business (matching
business name AND city/state or the lead's own domain/phone). When in doubt, `contacts: []`. Set `source` to `serp` or
`website` per contact.
