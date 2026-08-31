# Learnings store

Three sections, strict promotion flow: **Observations** (n=1, dated, with context) → **Confirmed** (seen twice independently, or proven by a definitive API error) → promoted into SKILL.md (then delete from here, note the promotion below). Never write a rule into SKILL.md from a single observation — one campaign's quirk may be account- or plan-specific.

When using this skill, read this whole file. When finishing a session that used this skill, ask: "did I hit anything not covered by SKILL.md?" If yes, append it under Observations before ending.

## Account facts (per-account, not promotable — just current state)

### AI Reserve (mcp key in C:\Users\victo\hr_call.js)
- Senders: 217586 + 217585 (Emerson), 213626 (Emerson alt), 212038 (Caroline), 226301 (Nir). Victor-run campaigns use 217586/217585.
- REST API key 401s; MCP endpoint only.
- Best repeatable CR (as of 2026-08-02): Emerson dual-variant ("came across your AI work at {COMPANY}..." / "founder/ops-focused, researching how teams manage AI costs..."), ~39% all-time n=85, 23% last-week in Technical Test (523492).
- Known campaigns: Technical Test 523492 (structure donor), Companies with AI Team (Vic) 532487 (list 833954, 630 leads, built 2026-08-02).

## Observations (n=1 — do not treat as rules yet)

- 2026-08-02: `add_leads_to_list_v2` silently dedupes duplicate profileUrls within a list (631 sent → 630 added, no failed count).
- 2026-08-02: `create_campaign` accepted a sequence whose first LIKE_POST node had actionDelay 0 (first-node exception held in practice).
- 2026-08-02: customUserFields set at list-push time (track, company_score) — not yet verified they are usable as merge tags in messages; check before promising personalization off them.

## Confirmed (awaiting promotion or recently promoted)

- Promoted to SKILL.md 2026-08-02: double-brace tag bug, pause→update→resume, fallbackMessage requirement, ≥3h delay rule, MCP-over-curl access pattern, template-vs-create tradeoff. (Sources: 2026-07-07 review, 2026-07-08 paragraphing fix, 2026-08-02 build session.)
