# Handoff guide — running a campaign review (for a non-technical operator)

You do **not** call APIs or read JSON. You **talk to Claude Code**, answer its questions, and read the verdict. This is the intake form + a "what good looks like" checklist.

## One-time setup (ask a technical person to do this once)
1. **Claude Code desktop app** installed — the chat window is the whole UI.
2. The `campaign-review` skill folder placed in `~/.claude/skills/` (this folder — keep `vertical-patterns.md` next to SKILL.md, it's the skill's accumulated experience).
3. The agency `db2b/` folder on this machine (client folders with `STATE.md` files + the key files under `db2b\_keys\`).

## How to start a review
Open Claude Code and say, plainly:
> "Review <client>'s cold email campaigns" — or "Run the weekly roster review" — or "Why are <client>'s replies so low?"

Claude reads the client's STATE.md + the pattern ledger first, then asks you for what's missing.

## What Claude needs from you
1. **Which client** (and platform if you know it — Instantly / Smartlead / HeyReach).
2. **The API key** — as a FILE path (e.g. `db2b\_keys\Client Details.txt`), never pasted into chat.
3. **The client's GTM / ICP doc** — required before Claude is allowed to call "wrong targeting" or "copy drift." Most live in the client's `db2b/<client>/` folder.
4. **The symptom in your words** — "low replies", "replies but no bookings", "high bounce", "client says it's not working."

## What good looks like (the output you should expect)
- **A one-line verdict naming the ONE binding constraint** — deliverability, copy/offer, targeting/list, or copy-drift — backed by numbers, not vibes.
- Tables: portfolio totals, per-campaign, and the reply pool categorized with verbatim quotes.
- A **prioritized fix list with a recommendation** (not a menu of options).
- Claude should UPDATE the client's `STATE.md` and log lessons before finishing. If it didn't, say: "run your self-improvement protocol."

## Red flags (push back if you see these)
- A "bad domains / bad copy" verdict with no placement evidence or reply-body reading.
- A "wrong vertical" verdict when Claude never opened the client's GTM doc.
- Advice to rewrite copy while bounce is high or mail is provably in spam — no copy converts from the spam folder.

## When to call the technical person / Victor
- A key is missing or expired · a fix requires spending money (placement test, new domains, new lead lists) · anything client-facing needs approval (copy changes go through the client).
