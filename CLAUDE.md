# silvergtm-gtm — read this first

This repo is Silver GTM's process library: skills (the engines), client folders (configs, plans,
state), and nothing else. Lead lists, contacts, and anything with a person's name or email are
gitignored. The repo holds process, not deliverables.

## The skills are the way work gets done

Every skill lives in `skills/<name>/SKILL.md` and is registered under `.claude/skills/`. Before
writing any script for a capability, find the skill that covers it:

| need | skill |
|---|---|
| decide where a vertical's leads live; any client sample / pilot / Data Foundation run | `icp-source-planner` (the front door; dispatches to the scrapers) |
| Google Maps list build → qualify → owner-finding → Clay feed | `google-maps-scrape` (start with its `README.md`) |
| a directory (Clutch, DesignRush) instead of Maps | `directory-lead-sourcing` |
| a page 403s, Cloudflare, a hidden API, a free SERP, the cheapest fetch | `web-scrape-triage` |
| a domain for a business name | `name-to-domain` |
| a keep/drop classifier over page text (Haiku per batch, never regex) | `web-visitor-deid-qualify` has the pattern |
| a work email for a named contact at a known domain (finder cascade, verified per rung) | `email-waterfall` |
| emails verified before a send | `email-verify-debounce-bounceban` |
| review a live cold-outreach account | `campaign-review` |
| build a HeyReach LinkedIn campaign | `heyreach-campaign-build` |
| ship silvergtm.com | `silvergtm-ship` |

Rules that hooks in `.claude/settings.json` enforce deterministically:

- A script under a dated run folder (`clients/<client>/YYYY-MM-DD_*/`) is not created or run until
  `<run>/.skill-check` exists. Write that file only after reading the sibling skills. An engine gap
  is fixed in the skill folder with a test and an `IMPROVEMENTS.md` entry, never with a run script.
- Nothing under `<run>/owner/` is touched until `<run>/owner-prompt.md` exists (STEP 6a).
- Stopping with a client `STATE.md` older than its run folder gets blocked once with a reminder.

## Facts about tool behaviour are tested, not remembered

Any claim about a tool or vendor that decides a design (does it parallelise, does it return the
field, is it keyless, does it clear a 403) is preceded by a 3-call probe and the probe output is
pasted. "I tested that" without the output in the transcript is not a test.

## Engine changes

Engine scripts are changed for bug fixes only, with operator approval, a test in `tests/`, and an
`IMPROVEMENTS.md` entry flipped to DONE. Job tuning goes in the client config, never in the engine.

## Secrets and PII

API keys live in gitignored `.env` files only. Verification and enrichment credits are never spent
without an explicit go. Client outputs stay gitignored; check `git status` before every commit.

## Write-back at the end of every run

`IMPROVEMENTS.md` for bugs, `SKILL.md` for gated method changes, `clients/<client>/STATE.md` for
the client's state, and a source profile in `skills/icp-source-planner/library/` for the vertical.
