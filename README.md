# GTM Processes

Repeatable, documented go-to-market processes. Each file in `processes/` is one self-contained SOP: what it does, when to run it, the exact steps, and the scripts it uses.

**Why this exists:** execution is commoditizing — everyone can wire Claude Code → Clay → Smartlead. The moat is the *mapping and the proprietary process*, not the tools. This repo is that moat, written down and versioned.

## Conventions

- One process = one numbered markdown file in `processes/`.
- Root `scripts/` serves `processes/` only.
- Skill-owned scripts live in `skills/<name>/scripts/` and must be **self-contained** — a skill
  gets copied out of this repo to be used, so it can never reach `../../scripts/`.
- **Data outputs (client lists, contacts, PII) are gitignored** — this repo holds *process*, not deliverables. Run outputs stay in the client working dir.
- Each SOP ends with a **worked example** (real numbers from a real run) so the process is proven, not theoretical.

## Index

| # | Process | Use when |
|---|---------|----------|
| [01](processes/01-job-board-trigger-sourcing.md) | Job-board-trigger sourcing → clean Apollo list | You want net-new companies showing a hire-trigger (e.g. posting a GTM/RevOps role) sourced, gated to ICP, and handed to Apollo for contacts. |
| [02](processes/02-email-verification.md) | Email verification — two-stage gate (worked example; procedure lives in the `email-verify-debounce-bounceban` skill) | You have a raw contact list and need to gate it before uploading to a cold-email tool. Pick Stage 1 (DeBounce or MillionVerifier), BounceBan recovers the catch-alls. |

## Skills

A **skill** is a folder an agent loads to do one job properly: a `SKILL.md` with the procedure,
plus optional `scripts/` and `references/`. Where a process is written for a person to follow,
a skill is written for an agent to execute — and the `description` line at the top of each one is
what makes an agent reach for it unprompted.

**Install:** copy the skill's folder into `~/.claude/skills/`. Keep the folder intact —
`references/` and `scripts/` must travel with `SKILL.md`.

### Sourcing

| Skill | Use when |
|---|---|
| [`icp-source-planner`](skills/icp-source-planner/) | You need a *sourcing plan* before scraping anything: "where should we source leads for X", "build the data foundation for \<client\>". Free-first source research → rubric → ~50-row test → full volume. Entry point for every Data Foundation deliverable. |
| [`directory-lead-sourcing`](skills/directory-lead-sourcing/) | Sourcing companies from a business directory (Clutch, DesignRush, Manifest, Sortlist) — firmographics *and* contacts, filtered to a budget/team band. |
| [`google-maps-scrape`](skills/google-maps-scrape/) | Building a local-business list from Google Maps for any country, qualifying it to an ICP, and optionally finding each owner/decision-maker. |
| [`name-to-domain`](skills/name-to-domain/) | You have company names and no websites. Cache + parallel web-verify subagents, no paid keys. Run before any Apollo/Clay people-pull — domain-match beats name-match. |
| [`web-scrape-triage`](skills/web-scrape-triage/) | Getting data off any site or public dataset, cheapest path first: registry API → hidden JSON API → server-rendered HTML → SERP → unlocker. Also: a site is "blocked", 403, or Cloudflare-walled. |

### List hygiene

| Skill | Use when |
|---|---|
| [`email-verify-debounce-bounceban`](skills/email-verify-debounce-bounceban/) | Any contact list, before it goes near a sending tool. Two-stage gate: DeBounce or MillionVerifier, then BounceBan on the catch-alls. |

### Outreach

| Skill | Use when |
|---|---|
| [`heyreach-campaign-build`](skills/heyreach-campaign-build/) | Building or launching a HeyReach LinkedIn campaign — push leads into a list, pick the best-performing connection note, create the sequence. |
| [`campaign-review`](skills/campaign-review/) | Diagnosing a live cold-email or LinkedIn account: is the bottleneck deliverability, copy, offer, or targeting? Weekly roster reviews, reply-pool categorisation, inbox-placement tests. |

### Site

| Skill | Use when |
|---|---|
| [`silvergtm-ship`](skills/silvergtm-ship/) | Putting silvergtm.com changes live. Restore point → build → deploy → verify → roll back. Use it before any raw `wrangler` command. |
