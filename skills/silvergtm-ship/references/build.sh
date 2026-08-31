#!/usr/bin/env bash
# Reproducible build for the Silver GTM site (Cloudflare Pages).
# Assembles dist/ with clean-URL folders from the source HTML + assets, then generates
# one accent-color variant of the homepage per sending domain and drops in _worker.js
# so each domain serves its own color. See _worker.js for the host -> color map.
#   index.html         -> /            (also copied to /emerald/ = control)
#   index.html (recol) -> /<color>/    (one folder per accent, served per-domain by the worker)
#   clay.html          -> /clay
#   clay-playbook.html -> /clay-playbook
#   sample.html        -> /sample
# Deploy:  ./build.sh && wrangler pages deploy dist --project-name silver-gtm --branch main
set -euo pipefail
cd "$(dirname "$0")"

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST/clay" "$DIST/clay-playbook" "$DIST/sample"

cp index.html          "$DIST/index.html"
cp clay.html           "$DIST/clay/index.html"
cp clay-playbook.html  "$DIST/clay-playbook/index.html"
cp sample.html         "$DIST/sample/index.html"
cp clay-og.png clay-playbook-og.png victor.jpg "$DIST/"
cp robots.txt sitemap.xml llms.txt "$DIST/"
cp -r logos            "$DIST/logos"
cp _worker.js          "$DIST/_worker.js"

# --- Color variants -------------------------------------------------------------------
# color   base      dark(hover)   The base site accent is emerald (#157A4D / #0f5e3b);
# each variant swaps those two hexes (they cover :root --emerald/--emerald-d AND the
# Cal.com embed brand color). emerald = straight copy (the control).
VARIANTS="
emerald    #157A4D  #0f5e3b
cobalt     #1E4F9C  #17407F
oxblood    #9B2D3A  #7C232E
teal       #0E6E70  #0A5658
plum       #5E2A7E  #4A2163
terracotta #A8431E  #863518
forest     #2F6B34  #245328
navy       #22396B  #1A2C54
ochre      #8A6212  #6E4E0E
slate      #3B5566  #2E4351
burgundy   #7A2140  #611A33
pine       #14584A  #0F473B
indigo     #3D3A8E  #302D71
copper     #8A5A2B  #6E4822
"
while read -r color base dark; do
  [ -z "$color" ] && continue
  mkdir -p "$DIST/$color"
  sed -e "s/#157A4D/$base/g" -e "s/#0f5e3b/$dark/g" index.html > "$DIST/$color/index.html"
done <<< "$VARIANTS"

echo "Built $DIST/ :"
find "$DIST" -type f | sed "s#^$DIST/#  #" | sort
echo "Deploy: wrangler pages deploy $DIST --project-name silver-gtm --branch main"
