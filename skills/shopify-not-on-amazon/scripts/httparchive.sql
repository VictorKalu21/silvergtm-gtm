-- STEP 0 · Source: every Shopify storefront with a CrUX popularity rank, from HTTP Archive.
-- Run in the BigQuery console (public dataset, 1 TB/month free scan; this is ~30-60 GB).
-- Export the result as CSV -> prep-input.mjs.
--
-- Notes
--  * `httparchive.technologies` / `httparchive.all.*` are RETIRED (Apr-2025) -> use crawl.pages + UNNEST.
--  * `rank` = CrUX popularity bucket (1000, 5000, 10k, 50k, 100k, 500k, 1M, 5M, 10M, 50M). It is the
--    FREE traffic proxy: <=100k ~ comfortably 50k+/mo; 500k-1M = "estimate it" (traffic.mjs).
--  * There is NO country column. The US gate happens in pipeline.mjs via /meta.json (store address).
--  * Root pages only, mobile client (largest crawl). One row per origin.
--  * `stack` = a few maturity tells (Shopify Plus / Klaviyo / Recharge ...). Names must match the
--    HTTP Archive Wappalyzer fork; an empty stack means "none of these", not "not detected".

DECLARE crawl    DATE  DEFAULT '2026-09-01';   -- first of the month = the latest crawl
DECLARE rank_max INT64 DEFAULT 1000000;        -- widen to 5000000 for a long-tail run

SELECT
  NET.REG_DOMAIN(page)  AS domain,
  page,
  rank,
  ARRAY_TO_STRING(ARRAY(
    SELECT DISTINCT x.technology FROM UNNEST(technologies) x
    WHERE x.technology IN ('Shopify Plus','Klaviyo','Recharge','Yotpo','Gorgias','Judge.me','Okendo','Loop Returns','Attentive','Postscript','Rebuy')
  ), '|') AS stack
FROM `httparchive.crawl.pages`
WHERE date = crawl
  AND client = 'mobile'
  AND is_root_page
  AND rank <= rank_max
  AND EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Shopify')
ORDER BY rank, domain;
