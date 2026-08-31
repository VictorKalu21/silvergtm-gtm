#!/usr/bin/env bash
# Canonical build for the Silver GTM site (Cloudflare Pages).
# Assembles dist/ with clean-URL folders from the source HTML + assets.
#   index.html         -> /
#   clay.html          -> /clay
#   clay-playbook.html -> /clay-playbook
# Add new pages here: source foo.html -> dist/foo/index.html (serves at /foo),
# and add any new OG image to the root copy line.
# Deploy:  ./build.sh && wrangler pages deploy dist --project-name silver-gtm --branch main
set -euo pipefail
cd "$(dirname "$0")"

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST/clay" "$DIST/clay-playbook"

cp index.html          "$DIST/index.html"
cp clay.html           "$DIST/clay/index.html"
cp clay-playbook.html  "$DIST/clay-playbook/index.html"
cp clay-og.png clay-playbook-og.png victor.jpg "$DIST/"

echo "Built $DIST/ :"
find "$DIST" -type f | sed "s#^$DIST/#  #"
echo "Deploy: wrangler pages deploy $DIST --project-name silver-gtm --branch main"
