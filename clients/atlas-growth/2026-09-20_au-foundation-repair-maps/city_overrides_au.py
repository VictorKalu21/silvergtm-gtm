#!/usr/bin/env python3
"""city_overrides_au.py :: RUN-FOLDER ONE-OFF — the `--city-overrides` file for the Plusvibe base, Australian rules.

build-plusvibe.js city-fallback (rung 2) reverse-geocodes with Nominatim and prefers town > city > village.
Probed 2026-09-21 on three AU coordinates: Nominatim returns the locality a tradie would say as `suburb`
("Endeavour Hills", "Woodridge", "Glendale") and puts the metro or the local-government area in `city`
("Melbourne", "Logan City", "Newcastle"); `town`/`village` are null in the suburbs. So the engine's picker
would write "Logan City" for a Woodridge business and never say the suburb. Job-side rule (IMPROVEMENTS.md:
city-fallback should take a per-country locality preference):
   suburb > town > village > city with a trailing " City" stripped ("Logan City" -> "Logan") and
   "City of X" / "Shire of X" / "X Council" rejected; else the state-less area token from the business name.
Only rows whose base `city` is blank are looked up (one request per second, a User-Agent, the country-centroid
placeholder skipped). Writes owner/city_overrides.json (place_id -> city) and prints per-rung counts.

Usage: python3 city_overrides_au.py [--dry-run]
"""
import csv, json, os, re, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
UA = 'silvergtm-gtm city-fallback (gtm@audacityinvestments.com)'
CENTROID = (-32.2054, 136.1074)
DRY = '--dry-run' in sys.argv
csv.field_size_limit(10 ** 7)
base = list(csv.DictReader(open('owner/plusvibe_base.csv', encoding='utf-8')))
leads = {r['place_id']: r for r in csv.DictReader(open('leads_qualified.csv', encoding='utf-8'))}
AREA = re.compile(r"\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Hobart|Canberra|Darwin|Geelong|Ballarat|Bendigo|Newcastle|Wollongong|Gold Coast|Sunshine Coast|Toowoomba|Townsville|Cairns|Ipswich|Launceston|Mornington Peninsula|Hunter Valley|Central Coast|Northern Rivers|Wide Bay|Gippsland|Shepparton|Wodonga|Albury|Mackay|Rockhampton|Bundaberg|Hervey Bay|Mandurah|Bunbury|Mildura|Warrnambool|Dubbo|Tamworth|Orange|Bathurst|Coffs Harbour|Port Macquarie|Byron)\b", re.I)

def geocode(lat, lon):
    url = 'https://nominatim.openstreetmap.org/reverse?' + urllib.parse.urlencode({'format': 'jsonv2', 'lat': lat, 'lon': lon, 'zoom': 14})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return json.load(r).get('address') or {}
    except Exception as e:
        return {'_err': type(e).__name__}

def pick(a):
    for k in ('suburb', 'town', 'village'):
        if a.get(k): return a[k], k
    c = a.get('city') or ''
    if c and not re.match(r'^(City|Shire|Council|Municipality|Region|Rural City|Borough) of\b', c, re.I) and not re.search(r'\bCouncil$', c, re.I):
        return re.sub(r'\s+(City|Shire|Regional)$', '', c), 'city'
    return '', ''

out, rep = {}, {'blank': 0, 'geocoded': 0, 'from_name': 0, 'centroid_skipped': 0, 'no_coords': 0, 'lookup_failed': 0, 'unresolved': 0, 'by_field': {}}
for r in base:
    if r.get('city'): continue
    rep['blank'] += 1
    L = leads.get(r['place_id'], {})
    try: lat, lon = float(L.get('latitude') or 'x'), float(L.get('longitude') or 'x')
    except ValueError: lat = lon = None
    city, field = '', ''
    if lat is None: rep['no_coords'] += 1
    elif abs(lat - CENTROID[0]) < 0.01 and abs(lon - CENTROID[1]) < 0.01: rep['centroid_skipped'] += 1
    elif not DRY:
        a = geocode(lat, lon); time.sleep(1.1)
        if '_err' in a: rep['lookup_failed'] += 1
        else:
            city, field = pick(a)
            if city: rep['geocoded'] += 1; rep['by_field'][field] = rep['by_field'].get(field, 0) + 1
    if not city:
        m = AREA.search(r.get('business_name') or '')
        if m: city, field = m.group(0).title(), 'name'; rep['from_name'] += 1
    if city: out[r['place_id']] = city
    else: rep['unresolved'] += 1
if not DRY:
    json.dump(out, open('owner/city_overrides.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps(rep), '->', 'owner/city_overrides.json' if not DRY else '(dry run)')
for pid, c in list(out.items())[:12]: print('  ', (leads.get(pid, {}).get('name') or '')[:40].ljust(40), '->', c)
