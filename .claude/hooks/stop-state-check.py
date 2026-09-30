#!/usr/bin/env python3
"""Stop hook: if a client's run folder changed more than STALE_H hours after its STATE.md was last
written, block the stop once and ask for STATE.md to be updated. stop_hook_active guards the loop."""
import json, os, sys, time
STALE_H = 4
def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    if data.get('stop_hook_active'):
        return
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'clients')
    if not os.path.isdir(root):
        return
    stale = []
    for client in sorted(os.listdir(root)):
        cdir = os.path.join(root, client)
        st = os.path.join(cdir, 'STATE.md')
        if not os.path.isfile(st):
            continue
        st_m = os.path.getmtime(st)
        for run in os.listdir(cdir):
            rdir = os.path.join(cdir, run)
            if not os.path.isdir(rdir) or not run[:4].isdigit():
                continue
            newest = 0.0
            for dp, dn, fn in os.walk(rdir):
                for f in fn:
                    try:
                        newest = max(newest, os.path.getmtime(os.path.join(dp, f)))
                    except OSError:
                        pass
            if newest - st_m > STALE_H * 3600:
                stale.append((client, run, (newest - st_m) / 3600))
    if stale:
        lines = '; '.join(f'clients/{c}/STATE.md is {h:.0f}h older than the newest file in {r}' for c, r, h in stale)
        print(json.dumps({"decision": "block", "reason": f"STATE.md is stale: {lines}. Update the client STATE.md "
               f"(current run stage, numbers, open items, directives) before stopping. If nothing changed for the client, "
               f"touch the file and say so."}))
main()
