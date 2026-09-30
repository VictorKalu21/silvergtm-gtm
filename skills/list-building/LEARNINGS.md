# Learnings (from the Shopify-not-on-Amazon project, 4 runs, Sept 22–26 2026)

Ordered by what it cost to learn. Numbers are real.

## Scoping and client
1. **Size the ceiling before promising a count.** The brief said 1,000 at 50k visits + 1,000 branded searches. The whole ≤5M-rank Shopify universe holds 417 at that bar (321 after the 25% category cap). 1,000 only exists at 20k visits with no search floor (2,248). Knowing this on day two would have saved most of the detours; it took until day three.
2. **Every adjective in a brief must become a signal with a source and a cost** before any data moves. "Established" was the ambiguous one; DataForSEO visits made it a number and made the ceiling computable.
3. **Scenario tables end arguments.** One CSV per floor combination (20k/50k × 0/500/1,000 searches × cap/no cap) turned "can we get to 1,000" into a lookup.
4. **Contacts are a separate deliverable.** The client said "I just need the website" halfway through; two enrichment providers had already been wired. Ask before enriching.

## Data and verification
5. **The search term is the verdict.** Site titles are taglines a third of the time. A Haiku term review changed 38% of lead-row terms; the re-crawl moved 237 "not on Amazon" rows to a real store. 12% of Haiku's suggestions were junk and needed a post-filter (`|`, `:`, `.com`, `llc`, >5 words, concatenation regressions, dropped domain words).
6. **Store evidence per row, rescore offline.** Byline, seller, store link, ASINs checked. Eight matcher-rule changes across the project each re-ran in minutes as a `RESCORE` instead of a day of crawling.
7. **Keep a rule test suite.** 78 byline/seller cases caught every over-correction (Alo, MAC, PENN, DIFF lost when single-word rules were tightened) before it shipped.
8. **Absence claims need full strength.** A lighter first pass missed BulkSupplements, BrüMate, Koss, Stride Rite. Every deliverable row gets 2 searches + brand filter + product pages, accumulated across passes.
9. **Reviewers rename domains.** 2 of 29 lead-review batches came back with an altered domain; map outputs to the nearest input domain before merging.
10. **Guards need the full vocabulary.** The drop-reason guard reverted 34 valid drops (team merch, licensed, artist, restaurant) because its allowed list knew only "fan merch", "band", "celebrity". Extend it from each run's override notes.
11. **Hand-check the strict cut, say what you did not hand-check.** 36 retailers, florists, restaurants and B2B suppliers survived Haiku + guard into the strict pool on run four; a name-pattern scan plus a look at vendors/text caught them in 15 minutes.

## Crawling hostile sources
12. **Per-IP budget is the real constraint.** Amazon: ~3,000 brands per open window from a datacenter IP on the legacy mobile endpoints, then a 503 wall on every search endpoint for every UA. The first wall lifted after 4 h of silence; the second held 20+ h.
13. **A home IP beats every proxy tried.** 847 brands in 2 h, zero blocks. Spider Cloud cost ~11 credits a store (60× the number its response body reported), and returned empty pages once the balance hit zero, which the crawler scored as "not Shopify" until caught. Per-GB residential proxy is the right product for future runs (~2–3 MB a brand).
14. **Shopify's bot wall is per IP and rate-based.** 20% of 16k stores blocked at CONC 5 with a 1 s delay; a same-day retry at CONC 2 / 3 s recovered 70%; the wall lifts within hours.
15. **Supervisors, not babysitting.** Probe → pass → pause when >40% of the last 20 rows are blocked → cool 2 h. Both crawls finished unattended once this existed.
16. **Node holds everything in memory.** A 16k-row gate pass OOM'd at ~11k rows; checkpoints made the retry free. Run with `--max-old-space-size=4096` or stream.

## Cost and process
17. **Measure paid cost on 3 rows and read the balance endpoint.** Response bodies lied (Spider) or reported per-batch cost on every row (DataForSEO, summed to $662 for a $0.66 pull).
18. **Never spend credits without a named row count and an explicit go.** One unasked lookup on 100 rows cost ~100 credits and a hard conversation.
19. **Keys only as env vars; rotate anything pasted in chat.** Six providers' keys went through the chat during this project.
20. **Check-ins cost the client's usage budget.** Hourly wakes on a 20-hour wall were waste; 3–4 h with a background watcher for completion was right.
21. **Background work survives container restarts, watchers do not.** Re-create the wait loops after every restart; the processes and checkpoints were always intact.
22. **Report as the same table every time**, with an ETA in hours and what could move it, and state what was skipped. Long prose updates got "update?" back.

## What I would do differently on the next list
- Steps 1–2 of the one-shot brief (criteria table, ceiling) before any crawl.
- Verification from a residential IP or per-GB proxy from the start.
- Term review with the post-filter built into the merge, not by hand.
- Hand-check pass budgeted as a step, not squeezed in at the end.
