#!/usr/bin/env bash
# run_verify.sh :: RUN-FOLDER ONE-OFF wrapper — the two-stage email verification gate for this run.
# Exists so the credit-spending command has ONE fixed spelling a Claude Code permission allow rule
# can name (the runner takes its input via IN / OUT_DIR env vars, which a prefix rule cannot match).
# Operator go for the 180 unique addresses: 2026-09-21 ("it should be dangerously skip anyway").
#   bash clients/atlas-growth/2026-09-20_au-foundation-repair-maps/run_verify.sh [--dry-run]
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN="$REPO/clients/atlas-growth/2026-09-20_au-foundation-repair-maps"
IN="$RUN/deliverable/verify_input.csv" OUT_DIR="$RUN/verify" \
  node "$REPO/skills/email-verify-debounce-bounceban/scripts/verify-millionverifier-bounceban.js" --concurrency 4 "$@" \
  2>&1 | grep -v '@'          # never echo addresses into the transcript
echo "---- report ----"
[ -f "$RUN/verify/report.json" ] && head -c 1500 "$RUN/verify/report.json"; echo
ls "$RUN/verify"
