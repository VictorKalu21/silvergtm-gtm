#!/usr/bin/env bash
# One-call whole-network pulls (recipes: icp-source-planner library oem-dealer-locators profile).
set -euo pipefail
cd "$(dirname "$0")/.."
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
curl -sS --retry 3 -A "$UA" -H 'content-type: application/json' \
  -X POST https://energy.briggsandstratton.com/_hcms/api/dealer-locator \
  -d '{"siteName":"Energy Solutions","brandName":"Energy Solutions; Home Generator Systems","latitude":39.5,"longitude":-98.35,"radius":2000,"metricFlag":false}' \
  -o raw/briggs.json
curl -sS --retry 3 -A "$UA" -o raw/champion.json \
  'https://champion-power-equipment-hsb.locally.com/stores/conversion_data?has_data=true&company_id=327355&dealers_company_id=327355&inline=1&map_center_lat=39.5&map_center_lng=-98.35&map_distance_diag=6000&sort_by=proximity&no_variants=0&only_store_id=false&uses_alt_coords=false&q=false'
ls -la raw/briggs.json raw/champion.json
