#!/usr/bin/env bash
# Throttle-aware supervisor for amazon-verify.mjs.
# Loop: probe Amazon's mobile search endpoint; when it answers, run a RETRY=1 pass (new rows + blocked rows)
# at low concurrency and watch the block share of the last 40 rows; if it climbs past MAXBLOCK, stop the pass and
# cool down. Ends when a pass finishes with no blocked rows left (or blocked stops shrinking across 3 passes).
set -u
cd "${DIR:-.}"
S="$(cd "$(dirname "$0")" && pwd)"
RUN=${RUN:-run}; CONC=${CONC:-2}; MAXBLOCK=${MAXBLOCK:-35}; COOL_MIN=${COOL_MIN:-20}; WINDOW=${WINDOW:-20}; INITIAL_SLEEP=${INITIAL_SLEEP:-0}; LOG=verify.log; SUP=supervisor.log
UA="Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
say() { echo "$(date -u +%H:%M:%S) $*" >> "$SUP"; }
probe() {  # 0 = search endpoint answers with a real page
  local ok=0 i
  for i in 1 2; do
    local code sz
    code=$(curl -s -o /tmp/probe.html -w "%{http_code}" -A "$UA" -H "Accept-Language: en-US,en;q=0.9" --compressed --max-time 25 "https://www.amazon.com/gp/aw/s?k=probe+brand+$RANDOM")
    sz=$(wc -c < /tmp/probe.html)
    [ "$code" = "200" ] && [ "$sz" -gt 20000 ] && ok=$((ok+1))
    sleep 3
  done
  [ "$ok" -ge 1 ]
}
blocked_left() { python3 -c "import json;d=json.load(open('${RUN}_amazon_verify.json'));print(sum(1 for v in d.values() if v.get('amazon_status')=='blocked'))"; }
prev_blocked=999999; stale=0
[ "$INITIAL_SLEEP" -gt 0 ] && { say "initial sleep ${INITIAL_SLEEP}s"; sleep "$INITIAL_SLEEP"; }
while true; do
  if ! probe; then say "probe: walled, cooling ${COOL_MIN}m"; sleep $((COOL_MIN*60)); continue; fi
  say "probe: open, starting pass (CONC=$CONC)"
  start_lines=$(wc -l < "$LOG")
  RUN=$RUN DIR=. RETRY=1 CONC=$CONC node --max-old-space-size=4096 "$S/amazon-verify.mjs" >> "$LOG" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep 90
    recent=$(tail -n +"$((start_lines+1))" "$LOG" | grep "^ *[0-9]*/" | tail -"$WINDOW")
    n=$(printf "%s\n" "$recent" | grep -c "/" || true)
    if [ "$n" -ge "$WINDOW" ]; then
      b=$(printf "%s\n" "$recent" | grep -c -- "-> blocked" || true)
      if [ "$((b*100/n))" -gt "$MAXBLOCK" ]; then say "block share ${b}/${n} > ${MAXBLOCK}%: pausing pass"; kill "$pid"; wait "$pid" 2>/dev/null; break; fi
    fi
  done
  wait "$pid" 2>/dev/null
  left=$(blocked_left)
  say "pass ended; blocked left=$left"
  if grep -q "AMAZON VERIFY DONE" <(tail -n +"$((start_lines+1))" "$LOG") && [ "$left" -eq 0 ]; then say "DONE: no blocked rows"; echo "SUPERVISOR DONE" >> "$LOG"; exit 0; fi
  if [ "$left" -ge "$prev_blocked" ]; then stale=$((stale+1)); else stale=0; fi
  prev_blocked=$left
  if [ "$stale" -ge 3 ]; then say "DONE: blocked not shrinking for 3 passes ($left left)"; echo "SUPERVISOR DONE" >> "$LOG"; exit 0; fi
  say "cooling ${COOL_MIN}m"; sleep $((COOL_MIN*60))
done
