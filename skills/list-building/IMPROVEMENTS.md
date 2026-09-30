# Improvements (open items for the general method)

Ordered by expected payoff. The Shopify instance keeps its own list in `skills/shopify-not-on-amazon/IMPROVEMENTS.md`.

1. **Ceiling calculator.** A script that takes the census + cheap-gate outputs and the observed keep rates (gates 55–70%, classify 45–60%, absence 40–46%, review 75–80%) and prints the scenario table before any crawl. Today this is done by hand in the funnel doc.
2. **Proxy transport in the verifier.** An `HTTPS_PROXY`-style residential proxy option (undici ProxyAgent) with bytes-per-brand logging, so runs above ~3k brands do not depend on one IP or on a laptop. Ten lines; test on 20 brands; log GB used.
3. **Term-review post-filter inside `prep-query-review.mjs --merge`.** The hand filter from run four (junk characters, length, concatenation regression, dropped domain word, leading "the") should be the default; keep a `--no-filter` escape.
4. **Domain mapping in `review-guard.mjs`.** Map each output row to the nearest input domain (difflib-style) before applying the guard, and re-run any batch whose count or domain set still mismatches automatically.
5. **Streaming gate crawler.** Write each store's signal row as it finishes and drop page text once scored; today the pipeline holds every row in memory and needs a 4 GB heap above ~10k rows.
6. **Cost ledger.** One script that reads each provider's balance endpoint before and after a step and appends `(step, rows, cost)` to `FUNNEL.md`. Response bodies are not to be trusted for cost.
7. **Generic supervisor.** Merge `verify-supervisor.sh` and `repass-supervisor.sh` into one script parameterised by the pass command and the "row done" predicate, so any hostile-source crawl gets the probe/pause loop for free.
8. **Hand-check helper.** A script that prints the strict-cut rows with a name-pattern flag, vendor list and first 120 chars of page text, and writes accepted denylist entries in one go. Run four's 15-minute pass would be 5.
9. **Funnel doc generator.** Build `FUNNEL.md` from the per-run counts files instead of by hand; keeps the table identical run to run.
10. **One-shot runner.** `run-all.sh` for the general method: census → cheap gate → free gates → classify batches → (stop) → verify with supervisor → term review → rescore → lead review + guard → volume → merge → select → funnel doc, with the two forced stops from the brief template.
11. **Contact enrichment as a separate skill invocation**, never inside the list run, with a credit estimate printed before the first paid call and a hard stop at the named row count.
12. **Retry pass for unresolved rows.** Track rows whose re-pass kept a prior verdict because of a wall (55 on run four) and re-run them when the wall lifts, so the term correction is complete before delivery.
