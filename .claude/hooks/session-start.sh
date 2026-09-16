#!/usr/bin/env bash
# SessionStart: put the operator's skill inventory into context. stdout becomes model context.
cd "$(dirname "$0")/../.." || exit 0
echo "## Operator skills in this repo (skills/<name>/SKILL.md, registered under .claude/skills/)"
for f in skills/*/SKILL.md; do
  n=$(basename "$(dirname "$f")")
  d=$(awk 'BEGIN{p=0} /^description:/{p=1; sub(/^description: *>?-? */,""); if(length($0)) print; next} p&&/^[a-z_-]+:/{exit} p{print}' "$f" | tr '\n' ' ' | cut -c1-220)
  echo "- $n: $d"
done
echo
echo "RULE (google-maps-scrape SKILL.md STEP 0): before writing any script for a capability, read the sibling skill that covers it. A PreToolUse hook blocks run-folder scripts until <run>/.skill-check exists, and blocks owner-finding until <run>/owner-prompt.md exists."
