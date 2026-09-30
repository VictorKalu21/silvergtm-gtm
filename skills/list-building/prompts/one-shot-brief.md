# One-shot list-building brief (paste, fill the blanks, run)

Build a verified company list using the `list-building` skill in this repo.

**Client and deliverable:** <who is buying the list and what they will do with it>
**Target:** <N> companies that are <criteria in the client's words>.
**Hard exclusions:** <e.g. retailers, marketplaces, dropship/POD, alcohol/tobacco/CBD, non-US, licensed merch>.
**Budget and keys:** <DataForSEO / enrichment / proxy budgets; keys are given as env vars only, never written to the repo>.

Do it in this order and stop for my go where marked:

1. Turn the brief into the criteria table (criterion → signal → source → cost → false-positive risk). Name the census source with `icp-source-planner`. **Stop and show me the table.**
2. Pull the universe, apply the cheapest gates, and give me the ceiling with a scenario table (each floor combination × category cap). **Stop and show me the ceiling before any paid step over $5.**
3. Run the funnel cheapest-first: free gates → Haiku classify (100/batch, validate every batch file) → verification with stored evidence → search-term sanity pass and re-crawl → offline rescore → Haiku lead review with the drop-reason guard → demand signal on lead rows only.
4. Ship `POOL_all.csv`, `POOL_strict_capped.csv`, `TOP<N>.csv`, one `scenario_*.csv` per floor combination, and `FUNNEL.md` with counts per step, keep rates, costs, what was hand-checked, and the ceiling statement. Hand-check every row in the strict cut and add junk to `denylist.json`.
5. **Do not run contact enrichment or spend paid credits until I say so, and then only on the rows I name.**

Constraints: key everything by domain, never by index; every step resume-safe with checkpoints; never write credentials or data outputs into the repo; if a hostile source starts blocking, use the supervisor pattern or tell me and send me the kit to run it from my connection; report progress as a fixed table with an ETA in hours.
