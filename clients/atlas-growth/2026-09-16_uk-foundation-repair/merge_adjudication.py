"""Merge adjudication verdicts onto leads_classified.csv -> leads_qualified.csv (+ excluded_officp.csv with drop_reason).
Standing directives (STATE.md): keep roll-ups/franchises but flag brand; review floor 30 as a flag; residential focus."""
import csv,json,glob,collections,re
rows=list(csv.DictReader(open('leads_classified.csv',encoding='utf-8')))
verd={}
for f in sorted(glob.glob('adjudicate/out/*.json'))+sorted(glob.glob('adjudicate2/out/*.json')):
    for o in json.load(open(f,encoding='utf-8-sig')):
        verd[o['place_id']]=o
UKPC=re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b")
BRANDS=re.compile(r"peter cox|rentokil|timberwise|kenwood|prokil|dampmaster|preservation treatments|helifix|mainmark|geobear|uretek|abbey|protectahome|wise property care|sovereign|richardson & starling|brick-tie|twistfix|permagard|safeguard",re.I)
q=[];x=[];c=collections.Counter()
for r in rows:
    v=verd.get(r['place_id'])
    r2=dict(r)
    r2['adjudication']=v['offers_foundation_repair'] if v else ''
    r2['service_bucket']=v['bucket'] if v else ''
    r2['adjudication_reason']=v['reason'] if v else ''
    r2['brand_flag']=BRANDS.search(r['name']).group(0).title() if BRANDS.search(r['name']) else ''
    r2['below_review_floor_30']='Y' if int(r['review_count'] or 0)<30 else ''
    # --- geography gate (footprint = UK). The export bled US service-area pins tagged with UK regions. ---
    addr=r['full_address'].upper(); ph=r['phone_number']
    uk=bool(UKPC.search(addr)) or ph.startswith('+44') or bool(re.match(r'^0[123578]\d{8,9}$',ph.replace(' ',''))) or r['domain'].endswith('.uk')
    us=ph.startswith('+1') or bool(re.search(r",\s*[A-Z]{2}\s+\d{5}\b|\bUNITED STATES\b|\bUSA\b",addr))
    r2['geo_check']='uk' if uk and not us else ('us' if us else 'unverified')
    if us or (not uk and not r['full_address'] and not r['domain'].endswith('.uk')): reason='out_of_footprint_'+r2['geo_check']
    elif r['tier'] in ('A','B','C') and v:
        if v['offers_foundation_repair']=='yes': reason=''
        elif v['offers_foundation_repair']=='unclear': reason=''   # kept, flagged
        else: reason='adjudicated_no:'+v['bucket']
    elif r['tier'] in ('A','B'):
        if not v: reason='not_adjudicated'
        elif v['offers_foundation_repair']=='yes': reason=''
        elif v['offers_foundation_repair']=='unclear': reason=''   # kept, flagged
        else: reason='adjudicated_no:'+v['bucket']
    elif r['tier']=='C': reason='groundworks_new_foundations_only' if not v else reason
    else: reason='no_foundation_signal' if r['site_status']=='ok' else 'site_'+r['site_status'].split(':')[0]
    if reason: r2['drop_reason']=reason; x.append(r2); c[reason.split(':')[0]]+=1
    else: q.append(r2); c['QUALIFIED_'+r2['adjudication']]+=1
cols=list(q[0].keys())
csv.DictWriter(open('leads_qualified.csv','w',newline='',encoding='utf-8'),fieldnames=cols).writeheader()
with open('leads_qualified.csv','a',newline='',encoding='utf-8') as f: csv.DictWriter(f,fieldnames=cols).writerows(q)
with open('excluded_officp.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols+['drop_reason']); w.writeheader(); w.writerows(x)
print(dict(c)); print('qualified',len(q),'| buckets',collections.Counter(r['service_bucket'] for r in q).most_common()); print('brand-flagged',sum(1 for r in q if r['brand_flag']),'| below 30 reviews',sum(1 for r in q if r['below_review_floor_30']))
