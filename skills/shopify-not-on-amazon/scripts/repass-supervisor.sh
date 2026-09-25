#!/usr/bin/env bash
# Throttle-aware supervisor for the term-override re-pass (ONLY=... REPASS=1). A row is done when its stored `query`
# equals the override term; a blocked re-pass keeps the prior verdict and stamps repassBlockedAt, so it stays in the todo set.
set -u
cd "${DIR:-.}"
S="$(cd "$(dirname "$0")" && pwd)"
RUN=${RUN:-run}; CONC=${CONC:-2}; MAXBLOCK=${MAXBLOCK:-40}; COOL_MIN=${COOL_MIN:-120}; LOG=verify_query.log; SUP=repass-supervisor.log
UA="Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
say() { echo "$(date -u +%H:%M:%S) $*" >> "$SUP"; }
probe() { local code sz; code=$(curl -s -o /tmp/probe.html -w "%{http_code}" -A "$UA" -H "Accept-Language: en-US,en;q=0.9" --compressed --max-time 25 "https://www.amazon.com/gp/aw/s?k=probe+brand+$RANDOM"); sz=$(wc -c < /tmp/probe.html); [ "$code" = "200" ] && [ "$sz" -gt 20000 ]; }
# prints "<done> <blockedSince> <remainingCSV>" for the override set; blockedSince counts repassBlockedAt >= $1 (ISO)
state() { python3 - "$1" <<'EOF'
import json,sys
since=sys.argv[1]
o=json.load(open(''"$RUN"'_query_overrides.json')); v=json.load(open(''"$RUN"'_amazon_verify.json'))
done=[d for d,t in o.items() if (v.get(d,{}).get('query') or '').lower().strip()==t]
rem=[d for d,t in o.items() if d not in set(done)]
blk=[d for d in rem if (v.get(d,{}).get('repassBlockedAt') or '')>=since]
print(len(done),len(blk),','.join(rem))
EOF
}
prev_rem=999999; stale=0
while true; do
  read -r done0 _ rem < <(state "9999")
  nrem=$(python3 -c "print(len('$rem'.split(',')) if '$rem' else 0)")
  say "override rows done=$done0 remaining=$nrem"
  if [ "$nrem" -eq 0 ]; then say "DONE: every override re-passed"; echo "REPASS SUPERVISOR DONE" >> "$LOG"; exit 0; fi
  if [ "$nrem" -ge "$prev_rem" ]; then stale=$((stale+1)); else stale=0; fi; prev_rem=$nrem
  if [ "$stale" -ge 3 ]; then say "DONE: remaining not shrinking for 3 passes ($nrem left)"; echo "REPASS SUPERVISOR DONE" >> "$LOG"; exit 0; fi
  if ! probe; then say "probe: walled, cooling ${COOL_MIN}m"; sleep $((COOL_MIN*60)); continue; fi
  start=$(date -u +%Y-%m-%dT%H:%M:%S); say "probe: open, re-pass on $nrem rows (CONC=$CONC)"
  ONLY="$rem" RUN=$RUN DIR=. REPASS=1 SEARCH_PASSES=2 BF_VARIANTS=3 MAX_DP=8 CONC=$CONC node --max-old-space-size=4096 "$S/amazon-verify.mjs" >> "$LOG" 2>&1 &
  pid=$!; pd=0; pb=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 120
    read -r d b _ < <(state "$start")
    dd=$((d-pd)); db=$((b-pb)); pd=$d; pb=$b
    if [ $((dd+db)) -ge 15 ] && [ $((db*100/(dd+db))) -gt "$MAXBLOCK" ]; then say "block share ${db}/$((dd+db)) > ${MAXBLOCK}%: pausing"; kill "$pid"; wait "$pid" 2>/dev/null; break; fi
  done
  wait "$pid" 2>/dev/null
  say "pass ended; cooling ${COOL_MIN}m"; sleep $((COOL_MIN*60))
done
