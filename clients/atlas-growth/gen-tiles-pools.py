#!/usr/bin/env python3
"""gen-tiles-pools.py :: Atlas Growth / US swimming-pool builders — derive the nationwide tile anchors.

Anchors are DERIVED, never hand-typed (SKILL STEP 3). Source: geonamescache (GeoNames cities15000,
US subset ~3.4k cities with lat/lng + population). Population-ordered greedy selection with a minimum
spacing between accepted centres, so a dense metro gets a ring of suburb centres and a small state
still gets its top cities. Sunbelt (P1) states use tighter spacing and a lower population floor
because the pool-builder universe is far denser there. A rural-fill pass then adds any town >= 5k
that is farther than 0.8 deg from every accepted centre, so no populated area is left unsearched.

Usage: pip install geonamescache && python3 clients/atlas-growth/gen-tiles-pools.py --out <tiles.json>
Output is gitignored (*.json); paste the `tiles` array into gen-runsheet-pools.js (ANCHORS) — that file
is the committed record. Deterministic: re-running yields the same list.
"""
import json, math, argparse
from collections import Counter
import geonamescache

P1_STATES = {"FL","TX","AZ","CA","GA","NV","NC","SC","TN","AL","LA","MS","OK","AR","NM","HI","UT","VA"}
P1_SPACING_KM, P1_POP_MIN = 14.0, 20000
P2_SPACING_KM, P2_POP_MIN = 22.0, 40000
MIN_PER_STATE = 4
RURAL_FILL_POP, RURAL_FILL_DEG = 5000, 0.8
NAME_FIX = {"New York City": "New York"}
ALL_STATES = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())

def hav(a, b):
    la1, ln1, la2, ln2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((ln2-ln1)/2)**2
    return 2*6371.0*math.asin(math.sqrt(d))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); a = ap.parse_args()
    gc = geonamescache.GeonamesCache()
    cities = [c for c in gc.get_cities().values() if c["countrycode"] == "US" and c["admin1code"] in ALL_STATES]
    cities.sort(key=lambda c: -c["population"])
    by_state = {}
    for c in cities: by_state.setdefault(c["admin1code"], []).append(c)
    tiles, selected = [], []
    def accept(c, tier, kind):
        selected.append((c["latitude"], c["longitude"]))
        tiles.append({"state": c["admin1code"], "tier": tier, "kind": kind, "city": NAME_FIX.get(c["name"], c["name"]),
                      "lat": round(c["latitude"], 5), "lng": round(c["longitude"], 5), "population": c["population"]})
    for st, lst in sorted(by_state.items()):
        tier = "P1" if st in P1_STATES else "P2"
        spacing = P1_SPACING_KM if tier == "P1" else P2_SPACING_KM
        pop_min = P1_POP_MIN if tier == "P1" else P2_POP_MIN
        n_state = 0
        for c in lst:
            if c["population"] < pop_min and n_state >= MIN_PER_STATE: break
            pt = (c["latitude"], c["longitude"])
            if any(hav(pt, s) < spacing for s in selected): continue
            accept(c, tier, "metro"); n_state += 1
    # rural fill: any town >= RURAL_FILL_POP farther than RURAL_FILL_DEG (~89 km) from every centre
    for c in cities:
        if c["population"] < RURAL_FILL_POP: continue
        pt = (c["latitude"], c["longitude"])
        if all(max(abs(pt[0]-s[0]), abs(pt[1]-s[1])) > RURAL_FILL_DEG for s in selected):
            accept(c, "P1" if c["admin1code"] in P1_STATES else "P2", "rural_fill")
    tiles.sort(key=lambda t: (t["state"], -t["population"]))
    for t in tiles: assert t["lng"] < 0 and 18 < t["lat"] < 72, t   # western longitudes are negative
    with open(a.out, "w") as f:
        json.dump({"generated_by": "clients/atlas-growth/gen-tiles-pools.py", "source": "geonamescache (GeoNames cities15000)",
                   "p1_states": sorted(P1_STATES), "rules": {"P1": [P1_SPACING_KM, P1_POP_MIN], "P2": [P2_SPACING_KM, P2_POP_MIN],
                   "min_per_state": MIN_PER_STATE, "rural_fill": [RURAL_FILL_POP, RURAL_FILL_DEG]}, "tiles": tiles}, f, indent=1)
    cnt = Counter(t["state"] for t in tiles)
    print(f"tiles: {len(tiles)} | states: {len(cnt)} | P1: {sum(1 for t in tiles if t['tier']=='P1')} | P2: {sum(1 for t in tiles if t['tier']=='P2')} | rural_fill: {sum(1 for t in tiles if t['kind']=='rural_fill')}")
    print("missing states:", sorted(ALL_STATES - set(cnt)) or "none")
    print(" ".join(f"{s}:{cnt[s]}" for s in sorted(cnt)))
if __name__ == "__main__": main()
