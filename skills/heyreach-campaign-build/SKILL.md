---
name: heyreach-campaign-build
description: Build and launch HeyReach LinkedIn campaigns end-to-end - push a lead CSV into a HeyReach list, pick the best-performing connection request from recent account data, and create a new campaign with a custom message sequence (cloned from a proven campaign's structure). Use whenever the user wants to create/launch/duplicate a HeyReach campaign, push leads into HeyReach, load a list into LinkedIn outreach, find the best connection note in an account, or edit a campaign sequence. NOT for diagnosing why an existing campaign underperforms - that is campaign-review.
---

# HeyReach Campaign Build

Turn a verified lead list into a launched (DRAFT) HeyReach campaign: list → best-performer research → sequence build. Works for any HeyReach account reachable via its MCP key.

**Before anything else, read `LEARNINGS.md` in this skill folder** — it holds account-specific facts and newly observed gotchas that supplement this file.

## Access pattern (critical)

Some HeyReach accounts' REST keys 401; the reliable path is the **MCP endpoint**, driven two ways:
1. **MCP tools** (`mcp__heyreach__*`) for small calls: create list, get campaigns, stats, sequences.
2. **Stateless node helper** for bulk payloads: `scripts/hr_call.js <toolName> '@payload.json'` POSTs JSON-RPC to `https://mcp.heyreach.io/mcp?xMcpKey=<KEY>` and parses the SSE response. Use `@file` payloads — inline JSON breaks on Windows arg-length/quoting for anything big. The key is inline in the script; for a different account, swap the key (find it in the client's key file, e.g. `db2b\_keys\agency-handover.env` or `Client Details.txt`).

## Step 1 — Push leads into a list

1. `create_empty_list` with `listType: "USER_LIST"` (campaigns only accept USER_LISTs). Note the returned `id`.
2. Batch the CSV into ≤100-lead chunks and call `add_leads_to_list_v2` per chunk via the helper script. Per lead send: `profileUrl` (required in practice — skip rows without a LinkedIn URL and report the count), `firstName`, `lastName`, `position`, `companyName`, `emailAddress`, `location`.
3. Put segmentation data (persona/track, company score, signal fields) into `customUserFields: [{name, value}]` — this is the only way sequences and exports can see it later.
4. Duplicate `profileUrl`s dedupe silently (added count < sent count is normal). Report added/updated/failed per batch.

## Step 2 — Find the best recent connection request

Recency matters: all-time stats hide decay, and small-n winners collapse (a note that hit 38% at n=39 fell to 21% at n=171). So:

1. `get_all_campaigns` (limit 100) — identify which campaigns actually sent recently (status IN_PROGRESS, or recent `startedAt`).
2. For each candidate, `get_overall_stats` with `campaignIds` and a **dated window** (e.g. last 7 days). Compare `connectionsSent` vs `connectionsAccepted` from `overallStats`.
3. Only trust rates with meaningful volume (roughly n≥30 sent in-window); cite the exact numbers to the user, not just percentages.
4. `get_campaign_sequence` on the winner to extract the exact CR text (in `payload.messages` of the CONNECTION_REQUEST node) — reuse it verbatim unless the user supplies their own.

## Step 3 — Create the campaign

Prefer `create_campaign` with an inline `sequenceJson` over `create_campaign_from_template`: the template route copies a sequence but does not let you change messages in the same call. Standard flow:

1. `get_campaign_sequence` on the best current campaign and **mirror its structure** (node order, delays, warmup touches) — proven structure, new copy.
2. Swap in the user's messages, then apply the message rules below.
3. Create with the same sender `linkedInAccountIds` as the account's active campaigns (confirm with user if ambiguous) and exclusions ON unless told otherwise: `excludeContactedFromOtherCampaigns`, `excludeHasOtherAccConversations`, `excludeContactedFromSenderInOtherCampaign` — these are set at creation time and protect against colliding with live campaigns on the same senders.
4. Campaign lands in **DRAFT**. Do not `start_campaign` without explicit user go-ahead — starting sends real messages.

### Message rules (each one is a burned lesson)

- **Merge tags are single-brace:** `{FIRST_NAME}`, `{COMPANY}`, `{MY_FIRST_NAME}`. Double-brace `{{name}}` tags render literally and tank acceptance (a real campaign fell to 4–6% accept vs 20–44% on its correctly-tagged twin). Convert any user-supplied `{{...}}` tags and tell the user you did.
- **Every message node needs a `fallbackMessage`** (no-first-name variant) or leads without parsed names get broken text.
- **Paragraphing:** use `\n\n` between paragraphs. Single `\n` renders as cramped text in LinkedIn.
- Keep connection notes <20 words, curiosity/peer-framed, zero product mention — the pitch belongs in the post-accept message.

### Sequence JSON rules

The sequence is a nested tree. Per node: `nodeType`, `actionDelay`, `actionDelayUnit`, `payload`, `unconditionalNode`, `conditionalNode`.

- `CONNECTION_REQUEST`: `conditionalNode` = accepted path, `unconditionalNode` = not-accepted path (both required).
- `MESSAGE`/`INMAIL`: `conditionalNode` MUST be an END node (the reply-exit), `unconditionalNode` = next step if no reply.
- Every path must terminate in an END node.
- `actionDelay` ≥ 3 with `actionDelayUnit: "HOUR"` on every node that follows an action (including ENDs) — 0/omitted delay is rejected by the API for those nodes. 0 is only safe on the very first node.
- `MESSAGE` only after the lead is a connection (accepted side of CONNECTION_REQUEST or CHECK_IS_CONNECTION).
- Warmup touches that the proven campaigns use: LIKE_POST before the CR; VIEW_PROFILE before the breakup message; not-accepted path gets VIEW_PROFILE → LIKE_POST → END.
- In `create_campaign` args, `sequenceJson` is a **string** (JSON.stringify the tree).

### Editing a live campaign instead

`update_campaign_sequence` refuses IN_PROGRESS campaigns → `pause_campaign` → update → `resume_campaign`. Safe-update preserves lead states and does not re-message. Fix `payload.messages[]` AND `payload.fallbackMessage` — both render.

## Output to the user

Report: list id + leads loaded (and skipped/deduped counts), the winning CR with its measured sent→accepted numbers and window, campaign id + status DRAFT, every edit you made to their copy (tag conversions, added fallbacks, appended text), and that starting requires their go.

## Self-learning

After any session where this skill was used and something new was learned — an API behavior not documented here, a rejection message decoded, an account-specific quirk, a copy-performance fact — append it to `LEARNINGS.md` under **Observations** with a date and context. Follow the promotion gate described there: observations seen once stay observations; promote into this SKILL.md only after a second independent confirmation (or a definitive API error message that proves the rule). This keeps the skill growing from data, not speculation.
