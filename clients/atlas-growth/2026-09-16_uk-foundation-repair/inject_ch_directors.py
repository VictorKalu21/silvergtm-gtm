"""Add Companies House officers to each owner-read batch as `ch_directors` (AUTHORITATIVE source per the owner-prompt
template). matched = engine match; low-confidence = name-overlap candidate the reader must judge against the business name."""
import json,glob,os
ch={}
for f,conf in (('owner/companies_house.jsonl','matched'),('owner/companies_house_lowconf.jsonl','low_confidence')):
    if not os.path.exists(f): continue
    for l in open(f):
        if not l.strip(): continue
        o=json.loads(l)
        if o.get('officers'): ch[o['place_id']]={'confidence':conf,'company':o.get('ch_company'),'number':o.get('ch_number'),'officers':o['officers']}
n=0
for f in sorted(glob.glob('owner/read/batches/batch-*-in.json')):
    b=json.load(open(f,encoding='utf-8-sig'))
    for lead in b:
        c=ch.get(lead['place_id'])
        if c:
            lines=[f"{x['name']} — {x['role']} (appointed {x.get('appointed_on','')})" for x in c['officers'][:8]]
            lead['ch_directors']=f"Companies House [{c['confidence']} match]: {c['company']} ({c['number']})\n"+"\n".join(lines); n+=1
        else: lead['ch_directors']=''
    json.dump(b,open(f,'w',encoding='utf-8'),ensure_ascii=False,indent=0)
print('leads with ch_directors',n,'of 180')
