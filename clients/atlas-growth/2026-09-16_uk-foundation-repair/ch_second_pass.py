"""Second Companies House pass for qualified leads still unnamed after the engine's conservative match + model read.
Looser but still deterministic acceptance: (a) normalised company title == normalised business name (ltd/limited/&/and/
punctuation stripped, 'the' dropped), or (b) title contains the business name's distinctive tokens AND the registered office
outward postcode or town matches the lead. Pulls active directors. Writes owner/companies_house_pass2.jsonl (confidence field)."""
import json,base64,urllib.request,urllib.parse,time,re,csv
KEY=[l.split('=',1)[1].strip() for l in open('/home/user/silvergtm-gtm/skills/google-maps-scrape/.env') if l.startswith('COMPANIES_HOUSE_KEY')][0]
AUTH='Basic '+base64.b64encode((KEY+':').encode()).decode()
def api(p):
    for a in range(4):
        try:
            req=urllib.request.Request('https://api.company-information.service.gov.uk'+p,headers={'Authorization':AUTH})
            with urllib.request.urlopen(req,timeout=20) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(6*(a+1)); continue
            return {}
        except Exception: time.sleep(2)
    return {}
STOP={'ltd','limited','llp','plc','the','and','co','uk','company','services','service','group'}
def norm(s): return re.sub(r"[^a-z0-9 ]"," ",s.lower().replace('&',' and ')).split()
def core(s): return [t for t in norm(s) if t not in STOP]
def outward(a):
    m=re.findall(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b",(a or '').upper()); return m[-1] if m else ''
q=list(csv.DictReader(open('leads_qualified.csv',encoding='utf-8')))
named=set()
for l in open('owner/contacts_read.jsonl'):
    if l.strip():
        d=json.loads(l)
        if d.get('contacts'): named.add(d['place_id'])
todo=[r for r in q if r['place_id'] not in named]
out=open('owner/companies_house_pass2.jsonl','w'); hit=0
for r in todo:
    name=re.sub(r"\s*[|(].*$","",r['name']).strip()          # 'Peter Cox | Preston' -> 'Peter Cox'
    s=api('/search/companies?q='+urllib.parse.quote(name)+'&items_per_page=10'); time.sleep(0.25)
    lead_ow=outward(r['full_address']); lead_town=(r['city'] or '').lower()
    best=None
    for it in (s.get('items') or []):
        if it.get('company_status')!='active': continue
        t=it.get('title','')
        exact=(core(t)==core(name)) or (norm(t)==norm(name))
        addr=it.get('address') or {}; ow=outward(addr.get('postal_code') or ''); town=(addr.get('locality') or '').lower()
        geo=(lead_ow and ow==lead_ow) or (lead_town and town==lead_town)
        toks=set(core(name)); ttoks=set(core(t))
        contains=bool(toks) and toks<=ttoks
        if exact: best=(it,'exact_title'); break
        if contains and geo and not best: best=(it,'title_contains+geo')
    if not best: continue
    it,conf=best
    o=api('/company/'+it['company_number']+'/officers?items_per_page=50'); time.sleep(0.25)
    offs=[{'name':x.get('name'),'role':x.get('officer_role'),'appointed_on':x.get('appointed_on')} for x in (o.get('items') or []) if not x.get('resigned_on') and re.search(r'director|member',x.get('officer_role','')) and not re.search(r'corporate|secretary|nominee',x.get('officer_role',''))]
    if not offs: continue
    out.write(json.dumps({'place_id':r['place_id'],'business_name':r['name'],'ch_company':it['title'],'ch_number':it['company_number'],'ch_address':it.get('address_snippet',''),'confidence':conf,'officers':offs})+'\n'); hit+=1
print('unnamed',len(todo),'| pass2 matched with directors',hit)
