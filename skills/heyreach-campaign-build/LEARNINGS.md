# Learnings store

Three sections, strict promotion flow: **Observations** (n=1, dated, with context) → **Confirmed** (seen twice independently, or proven by a definitive API error) → promoted into SKILL.md (then delete from here, note the promotion below). Never write a rule into SKILL.md from a single observation — one campaign's quirk may be account- or plan-specific.

When using this skill, read this whole file. When finishing a session that used this skill, ask: "did I hit anything not covered by SKILL.md?" If yes, append it under Observations before ending.

## Account facts (per-account, not promotable — just current state)

### AI Reserve (mcp key in C:\Users\victo\hr_call.js)
- Senders: 217586 + 217585 (Emerson), 213626 (Emerson alt), 212038 (Caroline), 226301 (Nir). Victor-run campaigns use 217586/217585.
- REST API key 401s; MCP endpoint only.
- Best repeatable CR (as of 2026-08-02): Emerson dual-variant ("came across your AI work at {COMPANY}..." / "founder/ops-focused, researching how teams manage AI costs..."), ~39% all-time n=85, 23% last-week in Technical Test (523492).
- Known campaigns: Technical Test 523492 (structure donor), Companies with AI Team (Vic) 532487 (list 833954, 630 leads, built 2026-08-02).
- List 1013140 "AI Cloud and MSP Cos, Tier A (Direct Offer)" — 670 leads pushed 2026-10-10 (Apollo export, persona-cut, DeBounce+BounceBan verified; 655 sendable + 15 risky, email_verdict in customUserFields). Mirrors Smartlead campaign 4116764 of the same name. No HeyReach campaign built on it yet.

## Observations (n=1 — do not treat as rules yet)

- 2026-08-02: `add_leads_to_list_v2` silently dedupes duplicate profileUrls within a list (631 sent → 630 added, no failed count).
- 2026-08-02: `create_campaign` accepted a sequence whose first LIKE_POST node had actionDelay 0 (first-node exception held in practice).
- 2026-08-02: customUserFields set at list-push time (track, company_score) — not yet verified they are usable as merge tags in messages; check before promising personalization off them.

- 2026-10-10: `create_empty_list` argument is **`listName`**, not `name` — `{"name":...}` returns the opaque "An error occurred invoking 'create_empty_list'" with no field hint. Confirmed via `tools/list` schema (required: `listName`, `listType`). Definitive schema → promote the field name into SKILL.md Step 1 on next touch.
- 2026-10-10: Opaque MCP errors ("An error occurred invoking '<tool>'") carry no detail. First move is a `tools/list` call (swap `tools/call` → `tools/list` in hr_call.js) and diff your args against `inputSchema.required`.
- 2026-10-10: `add_leads_to_list_v2` accepted 670 leads over 7 batches with `customUserFields` of 5 entries each, 0 failed; `cut_bucket`/`email_verdict` style segmentation fields pass through fine (still unverified as merge tags in messages — see 2026-08-02 note).
- 2026-10-10: The MCP endpoint is reachable direct from a Claude Code cloud container (no session-proxy injection needed — key is in the URL), unlike BounceBan/MillionVerifier which need `NODE_USE_ENV_PROXY=1` there.

## Confirmed (awaiting promotion or recently promoted)

- Promoted to SKILL.md 2026-08-02: double-brace tag bug, pause→update→resume, fallbackMessage requirement, ≥3h delay rule, MCP-over-curl access pattern, template-vs-create tradeoff. (Sources: 2026-07-07 review, 2026-07-08 paragraphing fix, 2026-08-02 build session.)
