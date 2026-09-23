# Prompt: pull every Shopify storefront from HTTP Archive (run on a machine with `bq` authenticated)

Paste the block below into Claude Code on the machine that has BigQuery access. Fill in the project id.
Output: one CSV, `httparchive_shopify_<crawl-month>.csv`, columns `domain,page,rank,stack`, which `prep-input.mjs`
(or `run-all.sh` with `SOURCE_CSV=`) consumes directly. Expect roughly 1-2 million rows at rank <= 50M; ~30-60 GB
scanned, inside BigQuery's 1 TB/month free tier.

---

Pull every Shopify storefront with a CrUX popularity rank from the HTTP Archive public dataset and give me one CSV.

Setup: `bq` is already authenticated; use project `concise-ranger-487621-f4`. Do not use `httparchive.technologies` or
`httparchive.all.*` (retired April 2025); use `httparchive.crawl.pages` with `UNNEST(technologies)`.

1. Find the latest crawl month: `SELECT MAX(date) FROM httparchive.crawl.pages WHERE client='mobile'`. Call it CRAWL.
2. Run this query with `--use_legacy_sql=false`, writing to a destination table in a dataset you create in my project
   (`bq mk --dataset shopify_census` if needed), so the result is not truncated:

```sql
SELECT
  NET.REG_DOMAIN(page) AS domain,
  page,
  rank,
  ARRAY_TO_STRING(ARRAY(
    SELECT DISTINCT x.technology FROM UNNEST(technologies) x
    WHERE x.technology IN ('Shopify Plus','Klaviyo','Recharge','Yotpo','Gorgias','Judge.me','Okendo','Loop Returns','Attentive','Postscript','Rebuy')
  ), '|') AS stack
FROM `httparchive.crawl.pages`
WHERE date = DATE 'CRAWL'
  AND client = 'mobile'
  AND is_root_page
  AND EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Shopify')
ORDER BY rank, domain
```

   No rank cap: I want every Shopify origin, including rank 50,000,000. `rank` is the CrUX bucket
   (1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000).
3. Export the table to CSV. Preferred: `bq extract --destination_format CSV` to a GCS bucket in the project, then
   `gsutil cp` it down and concatenate the shards with a single header. Fallback if there is no bucket:
   `bq query --format=csv --max_rows=5000000` on `SELECT * FROM shopify_census.<table>` and redirect to the file.
4. Sanity-check before you hand it back: row count per rank bucket (`GROUP BY rank`), no duplicate `page`, the header
   is exactly `domain,page,rank,stack`, and spot-check five rows resolve to live Shopify stores. Tell me the total row
   count, the count at rank <= 1,000,000, and the bytes billed.
5. Name it `httparchive_shopify_<CRAWL>.csv`, zip it, and tell me the path. Do not commit it anywhere.
