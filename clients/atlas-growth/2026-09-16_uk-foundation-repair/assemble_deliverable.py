"""Assemble the run deliverable: one row per QUALIFIED lead with the best email (Maps vs site compared), the named
decision-maker (model read over site text + Companies House, plus pass-2 CH), the role bucket, evidence, and QA flags.
Outputs: deliverable/atlas_uk_foundation_repair_qualified.csv (leads) + deliverable/contacts_all.csv (every contact)
        + deliverable/verify_input.csv (Email column, for the MillionVerifier+BounceBan runner; NOT run without a go)."""
import csv,json,re,os,collections
os.makedirs('deliverable',exist_ok=True)
q=list(csv.DictReader(open('leads_qualified.csv',encoding='utf-8')))
c=list(csv.DictReader(open('leads_classified_contacts.csv',encoding='utf-8')))
cmap={r['place_id']:r for r in c}
read={}
for l in open('owner/contacts_read.jsonl'):
    if l.strip():
        d=json.loads(l); read[d['place_id']]=d
p2={}
if os.path.exists('owner/companies_house_pass2.jsonl'):
    for l in open('owner/companies_house_pass2.jsonl'):
        if l.strip():
            d=json.loads(l); p2[d['place_id']]=d
ch_company={}
for f in ('owner/companies_house.jsonl','owner/companies_house_lowconf.jsonl'):
    if os.path.exists(f):
        for l in open(f):
            if l.strip():
                d=json.loads(l)
                if d.get('ch_company'): ch_company[d['place_id']]=d['ch_company']
STOP={'ltd','limited','llp','plc','the','and','co','uk','company','services','service','group','damp','proofing','waterproofing','solutions','specialists','specialist','building','builders','construction','preservation','remedial','remedials','treatments','property','maintenance'}
def core(s): return {t for t in re.sub(r"[^a-z0-9 ]"," ",(s or '').lower().replace('&',' and ')).split() if t not in STOP}
def natural(n):   # 'BIRD, Martin Paul' -> ('Martin','Bird')
    if ',' in n:
        sur,fore=[x.strip() for x in n.split(',',1)]
        return fore.split()[0].title() if fore else '', sur.title()
    p=n.split(); return (p[0],' '.join(p[1:])) if len(p)>1 else (n,'')
BUCKET_ORDER=['owner_or_partner','gm','marketing','sales_manager','office_manager','other']
rows=[]; contacts=[]; stats=collections.Counter()
for r in q:
    cc=cmap.get(r['place_id'],{})
    row={k:r[k] for k in ('place_id','name','google_types','full_address','zip','city','region','phone_number','website','domain','rating','review_count','locations','tier','service_bucket','adjudication','adjudication_reason','brand_flag','geo_check','site_status')}
    for k in ('email','email_type','email_own_domain','email_source','email_change','email_maps','site_emails_all','maps_email_on_site','all_emails'): row[k]=cc.get(k,'')
    # contacts: model read first, then CH pass-2
    cs=[]; src=''
    d=read.get(r['place_id'])
    if d and d.get('contacts'):
        for x in d['contacts']:
            cs.append({'name':x.get('name',''),'first_name':x.get('first_name','') or x.get('name','').split()[0],'title':x.get('title',''),'role_bucket':x.get('role_bucket','other'),'source':x.get('source',''),'evidence':x.get('evidence','')})
        src='read'
    elif r['place_id'] in p2:
        d2=p2[r['place_id']]
        for x in d2['officers'][:5]:
            fn,ln=natural(x['name'])
            cs.append({'name':(fn+' '+ln).strip(),'first_name':fn,'title':'Director','role_bucket':'owner_or_partner','source':'companies_house_pass2','evidence':f"Companies House [{d2['confidence']}]: {d2['ch_company']} ({d2['ch_number']}): {x['name']} — {x['role']} (appointed {x.get('appointed_on','')})"})
        src='ch_pass2'
    # QA: CH company vs business name overlap; departed; trade word in name
    cs=[x for x in cs if x['name'] and not re.search(r"\b(former|retired|ex-)\b",x['evidence'][:60],re.I)]
    cs.sort(key=lambda x:BUCKET_ORDER.index(x['role_bucket']) if x['role_bucket'] in BUCKET_ORDER else 9)
    qa=[]
    def same_company(chn,biz):
        a=core(chn); b=core(biz)
        if a&b: return True
        sa=re.sub(r"[^a-z0-9]","",re.sub(r"\b(ltd|limited|llp|plc|the)\b","",chn.lower().replace('&','and')))
        sb=re.sub(r"[^a-z0-9]","",re.sub(r"\b(ltd|limited|llp|plc|the)\b","",biz.lower().replace('&','and')))
        return bool(sa and sb) and (sa in sb or sb in sa)
    kept=[]
    for x in cs:
        if x['source'].startswith('companies_house'):
            m=re.search(r"Companies House[^:]*:\s*([^(]+)\(",x['evidence']); chn=(m.group(1).strip() if m else ch_company.get(r['place_id'],''))
            if chn and not same_company(chn,r['name']):
                qa.append('dropped_ch_name_mismatch:'+chn+'->'+x['name']); continue
        kept.append(x)
    cs=kept
    if r['brand_flag']: qa.append('brand:'+r['brand_flag'])
    if r['adjudication']=='unclear': qa.append('icp_unclear')
    prim=cs[0] if cs else None
    # name for a person-shaped email: prefer the read contact whose surname matches the local part
    if row['email_type']=='person' and cs:
        loc=row['email'].split('@')[0].lower()
        m=[x for x in cs if x['name'].split()[-1].lower() in loc]
        if m: prim=m[0]; qa.append('email_matches_named_contact')
    if prim: row.update({'primary_name':prim['name'],'first_name':prim['first_name'],'last_name':' '.join(prim['name'].split()[1:]),'primary_title':prim['title'],'role_bucket':prim['role_bucket'],'name_source':prim['source'],'name_evidence':prim['evidence'][:300]})
    elif row['email_type']=='person' and cc.get('first_name'):
        row.update({'primary_name':(cc['first_name']+' '+cc['last_name']).strip(),'first_name':cc['first_name'],'last_name':cc['last_name'],'primary_title':'','role_bucket':'','name_source':'email_local_part:'+cc['name_confidence'],'name_evidence':cc.get('name_evidence','')[:300]}); qa.append('name_from_email_only')
    else: row.update({'primary_name':'','first_name':'','last_name':'','primary_title':'','role_bucket':'','name_source':'','name_evidence':''})
    row['other_contacts']=' || '.join(f"{x['name']} [{x['title']} -> {x['role_bucket']}]" for x in cs[1:5])
    row['qa_flags']='; '.join(qa)
    rows.append(row)
    for x in cs: contacts.append({'place_id':r['place_id'],'business':r['name'],'city':r['city'],'domain':r['domain'],**x})
    stats['named']+=bool(row['primary_name']); stats['email']+=bool(row['email']); stats['named+email']+=bool(row['primary_name'] and row['email']); stats['ch_mismatch_dropped']+=('dropped_ch_name_mismatch' in row['qa_flags'])
cols=list(rows[0].keys())
with open('deliverable/atlas_uk_foundation_repair_qualified.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(rows)
with open('deliverable/contacts_all.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(contacts[0].keys())); w.writeheader(); w.writerows(contacts)
with open('deliverable/verify_input.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['Email','place_id','business','first_name','last_name','email_type'])
    seen=set()
    for r in rows:
        if r['email'] and r['email'] not in seen: seen.add(r['email']); w.writerow([r['email'],r['place_id'],r['name'],r['first_name'],r['last_name'],r['email_type']])
print('leads',len(rows),dict(stats),'| contacts',len(contacts),'| verify rows',len(seen))
print('role buckets',collections.Counter(r['role_bucket'] for r in rows if r['primary_name']))
print('email types',collections.Counter(r['email_type'] for r in rows))
print('name source',collections.Counter(r['name_source'].split(':')[0] for r in rows if r['primary_name']))
