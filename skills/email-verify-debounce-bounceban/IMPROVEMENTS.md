# email-verify-debounce-bounceban — improvement backlog

Technical backlog for the skill's engine. Not operator-facing (see SKILL.md for that).

## HIGH (verify-millionverifier-bounceban.js routing): BounceBan never saw the MV results it is best at — `invalid` was dropped outright and `error` rows silently never reached stage 2

**Status:** DONE 2026-09-17 — `invalid` now routes to BounceBan (a `deliverable` overrides to sendable with `bb:recovered_from_invalid`, anything else stays dropped with the MV reason), a stage-1 call that throws is checkpointed as `result: "error"` so the address still reaches stage 2, an address with no stage-1 record at all is selected too, `disposable` stays dropped, and `--bb-on` names the routed set (default `catch_all,unknown,error,invalid`; `--bb-on catch_all,unknown,error` is the old behaviour) · test: `tests/verify-dry-run.test.js` (24 checks, no network) · found 2026-09-17 (Atlas Growth, 2026-09-16 UK MAPS run, 444-address verification), HIGH impact — sendable addresses were being thrown away by the gate itself.

**Problem.** Two halves, both in the routing between the stages.
1. **`invalid` was dropped outright.** `classify()` returned `['dropped', 'mv:invalid…']` before BounceBan was ever consulted, on the assumption that a MillionVerifier `invalid` is final. It is not: MV's SMTP probe and BounceBan's disagree often enough to matter. Measured this run — of the first **4** MV-`invalid` addresses sent to BounceBan by hand (`bb_recover.py`), **3 came back `deliverable`**. On a 444-address list, 15 were `invalid`.
2. **`error` rows never reached stage 2 at all.** `NEEDS_BB` already contained `error`, so the set was right, but the selection was `const m = mv.get(e); return m && NEEDS_BB.has(…)`: an address only reached BounceBan if stage 1 had produced a **record**. A MillionVerifier call that *threw* (transport error, non-object body — the `catch (err) { console.error('MV fail', …) }` arm of the stage-1 pool) wrote no checkpoint at all, so `mv.get(e)` was `undefined`, the `m &&` test skipped it, `classify()` returned `['unverified', 'no stage-1 result']`, and a re-run repeated the whole thing: MV was retried, errored again, and the address was stranded again. **20 of this run's 444 addresses ended that way** ("persistent MillionVerifier API error across three attempts"), were reported as dropped, and cost 20 credits without ever being offered to the verifier that could have answered them.

**Fix (shipped).** The routing set is now a parsed `--bb-on` set (`parseBbOn`), and the selection is a named predicate (`needsBB`) that answers `true` for an address with **no** stage-1 record — BounceBan is the only chance such an address has left. The stage-1 pool's catch arm no longer swallows the failure: it appends `{result: 'error', error: <message>, mv_call_failed: true}` to `mv.jsonl`, which makes the failure resumable, visible and routable. `classify()` takes the routing set, so the `invalid` branch is `deliverable → sendable`, everything else → `dropped` with the MV reason (never `unverified`: an `invalid` is a verdict, not a pending question). `report.json` gained `bb_on`, `mv_call_failures` and `recovered_from_invalid`.

**Cost note.** The new set spends BounceBan credits on the `invalid` slice (~3% of a list here) and on MV failures. At the measured 3-in-4 recovery rate that is the cheapest sendable address in the whole pipeline; if a list is ever dominated by `invalid`, `--bb-on catch_all,unknown,error` turns it off without a code change.

**Job-side precedent:** `clients/atlas-growth/2026-09-16_uk-foundation-repair-maps/bb_recover.py` — the hand-rolled version this replaces. Nothing in a run folder should need to re-send a verifier's misses again.

## OPEN 2026-10-26 (verify-millionverifier-bounceban.js, HIGH): a BounceBan auth failure is classified as `bb:none` → `risky`, silently; and `process.env` beats the env file even when it holds a proxy placeholder

Found on Atlas Growth UK battery wave 2 (`clients/atlas-growth/2026-09-30_uk-battery-installers-mcs`): 292 BounceBan
calls all answered `{"msg":"Authorization information is missing or invalid."}`; the run finished with exit 0, a report
reading `risky: 250`, and no warning. Two causes stacked: (1) the key resolution is `process.env.BOUNCEBAN_KEY ||
ENV.BOUNCEBAN_KEY`, and the cloud container now injects `BOUNCEBAN_KEY=proxy…` (a 5-char placeholder meant for proxied
curl) when the operator stores the key as an environment credential — Node's fetch does not go through the proxy, so the
placeholder is sent raw; (2) `classify()` treats a BounceBan record with no `result` as "BounceBan did not answer" and
falls back to the MV verdict, so an auth failure looks like a catch-all. **Proposed fix (needs operator approval + a
test):** (a) probe each key once at startup (`/v1/verify/single/status` or `/api/v3/credits`) and abort with a clear
message on a non-success; (b) treat a `msg`-only BounceBan record as an `error` that is retried, then counted as
`bb_auth_failed` in the report and in `verify_detail`, never as `bb:none`; (c) when both an env var and an env-file value
exist and differ, warn and prefer the one that passes the startup probe. Workaround used: launch with the file key
exported explicitly.
