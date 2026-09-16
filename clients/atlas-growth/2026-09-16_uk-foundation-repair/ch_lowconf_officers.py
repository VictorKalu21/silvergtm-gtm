"""Job-side pass: for Companies House candidates the engine left as low_confidence (name overlap >= 0.6, active),
pull the candidate's active directors so the model read can judge them. Writes owner/companies_house_lowconf.jsonl.
Engine untouched (companies-house.js matching is deliberately conservative)."""
import json,base64,urllib.request,urllib.parse,time,re,os
KEY=[l.split('=',1)[1].strip() for l in open('/home/user/silvergtm-gtm/skills/google-maps-scrape/.env') if l.startswith('COMPANIES_HOUSE_KEY')][0]
AUTH='Basic '+base64.b64encode((KEY+':').encode()).decode()
def api(p):
    for a in range(4):
        try:
            req=urllib.request.Request('https://api.company-information.service.gov.uk'+p,headers={'Authorization':AUTH})
            with urllib.request.urlopen(req,timeout=20) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(5*(a+1)); continue
            return {}
        except Exception: time.sleep(2); 
    return {}
recs=[json.loads(l) for l in open('owner/companies_house.jsonl') if l.strip()]
low=[r for r in recs if not r.get('matched') and r.get('candidate') and r.get('candidate_status')=='active' and (r.get('name_overlap') or 0)>=0.6]
out=open('owner/companies_house_lowconf.jsonl','w'); n=0
for r in low:
    s=api('/search/companies?q='+urllib.parse.quote(r['candidate'])+'&items_per_page=5') if False else api('/search/companies?q='+urllib.parse.quote(r['candidate'])+'&items_per_page=5')
    items=[i for i in (s.get('items') or []) if i.get('title','').upper()==r['candidate'].upper()] or (s.get('items') or [])[:1]
    if not items: continue
    c=items[0]; time.sleep(0.3)
    o=api('/company/'+c['company_number']+'/officers?items_per_page=50')
    offs=[{'name':x.get('name'),'role':x.get('officer_role'),'appointed_on':x.get('appointed_on')} for x in (o.get('items') or []) if not x.get('resigned_on') and re.search(r'director|member',x.get('officer_role','')) and not re.search(r'corporate|secretary|nominee',x.get('officer_role',''))]
    rec={'place_id':r['place_id'],'business_name':r['business_name'],'ch_company':c.get('title'),'ch_number':c['company_number'],'ch_status':c.get('company_status'),'ch_address':(c.get('address_snippet') or ''),'name_overlap':r['name_overlap'],'confidence':'low','officers':offs}
    out.write(json.dumps(rec)+'\n'); n+=1; time.sleep(0.3)
print('low-confidence candidates',len(low),'| officers pulled for',n)
