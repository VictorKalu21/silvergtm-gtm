# Handoff guide — running a Google Maps lead build (for a non-technical operator)

You do **not** run scripts or touch code. You **talk to Claude Code**, answer its questions, and check the output. Claude runs every script for you. This guide is the intake form + a plain-language glossary + a "what good looks like" checklist.

## One-time setup (ask a technical person to do this once)
1. **Claude Code desktop app** (Windows/Mac) installed — the chat window *is* the UI, no separate tool to build. Also requires **Node.js** on the machine (the scripts are Node).
2. The `google-maps-scrape` skill folder placed in `~/.claude/skills/`.
3. API keys funded and saved in the skill's `.env` (`SCRAPER_TECH_KEY`, `SCRAPER_TECH_SEARCH_KEY`). You never edit these; if a run says "quota," tell the technical person to fund/rotate the key.

## How to start a job
Open Claude Code and say, plainly, e.g.:
> "Do a Google Maps lead build for <client>. Footprint is <cities>. ICP is <business types>."

Claude will then ask you the intake questions below. Answer them; Claude does the rest and reports back.

## Intake form — what Claude needs from you (answer each)
1. **Client** — whose campaign is this?
2. **Footprint** — exactly which cities/areas/ZIPs? (If a big city is "only the good parts," say which neighborhoods — Claude will turn it into a ZIP list and read it back to you.)
3. **ICP business types** — what kinds of businesses? (e.g. dentists; or car dealers + jewelry + furniture.)
4. **Target role — WHO at each business do we want to reach?** The person who'd say yes to the offer (e.g. the owner, OR the office/general manager, OR the marketing manager). Be specific; this decides who Claude looks for.
5. **Disqualifiers** — exclude national chains? require a website? minimum reviews?
6. **The offer** — one line on what you're selling them (so Claude picks the right decision-maker).

## Glossary (no jargon)
- **Footprint** = the geographic area you want leads in.
- **ICP** = the kinds of businesses you want (Ideal Customer Profile).
- **Target role** = which person at the business is the buyer (owner / manager / etc.).
- **Qualification** = Claude automatically drops businesses that came back but don't fit (e.g. a repair shop that showed up under "car dealer"). Expect ~30–40% to drop here — that's normal and good.
- **Owner-finding** = Claude searches the web (LinkedIn, BBB, the company site) to name the decision-maker. Claude first writes a **per-vertical decision-maker prompt** for your trade — the rules for who counts as the owner differ by industry (an electrician isn't the owner; a dental hygienist isn't the dentist-owner), so this is built fresh each job. Claude won't start owner-finding until that prompt exists.
- **Email waterfall** = the step that turns names + websites into verified email addresses, cheapest source first.
- **Sequencer upload** = the final CSV for your sending tool (Plusvibe): name, email, city, and the personalization variables.

## What good looks like (check before you upload the list to your sending tool)
- Claude reports a **qualified count** and shows you the **drop reasons** (repair shops, chains, off-category). Skim them — do they look right?
- Spot-check 5–10 rows in the final CSV: real business, address inside your footprint, has a website, not a national chain.
- Owner-finding reports a **named-decision-maker rate**. Healthcare runs high (~80%); used-car/retail runs lower (~40%) — that's expected, not a bug. The ones without a name still get a generic email + phone to contact.
- If Claude flags **coverage gaps** (areas with no results) it will offer to re-run them — say yes.
- **On a monthly "new location" job, Claude runs the same sheet 3 times on purpose.** Google returns a different slice of results each time it is asked — one pass finds only about 86% of what is there. Three passes combined gets it to ~99%. The repeat is not a fault or a double-charge; it is what stops last month's misses from showing up next month looking like brand-new businesses.
- On that same job, expect **two lists**: the confirmed one to work now, and a smaller "pending" one Claude is holding back because it only saw those places once. They are not discarded — they get promoted if they show up again.

## Cost awareness
Each web search spends a credit from a shared budget. Claude qualifies the list **before** spending owner-finding credits, so you're not paying to research businesses you'd drop. If you only need a quick count, ask Claude for "scrape only, no owner-finding."

## When to call the technical person
- "quota" / "key" errors · the skill or Claude Code isn't installed · the output looks structurally broken (no websites, wrong columns). Everything else, just ask Claude.
