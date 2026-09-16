"""Stage C: best email per company + person-name hints.
email ranking: person-shaped local part (first.last / f.last / firstlast-confirmed) > named generic (info/enquiries/hello/sales/office/admin/contact/mail/enquiry) > other.
Own-domain emails preferred over 3rd-party; free-mail (gmail etc.) kept only if it is the Maps-listed email or found on the business's own site.
Name hints: (1) from a person-shaped email local part, confirmed if both tokens appear in site text; (2) role patterns in site text
('Managing Director John Smith' / 'John Smith, Director' / 'founded by John Smith' / 'owner John Smith')."""
import csv,json,re,collections
IN=__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'leads_classified.csv'
rows=list(csv.DictReader(open(IN,encoding='utf-8')))
site={}
for ln in open('owner/site_text.jsonl',encoding='utf-8'):
    ln=ln.strip()
    if ln:
        o=json.loads(ln); site[o['place_id']]=o
GENERIC_GOOD=['info','enquiries','enquiry','hello','sales','office','admin','contact','mail','enquire','email','hi','estimates','quotes','quote','team']
BAD=re.compile(r"noreply|no-reply|donotreply|privacy|webmaster|postmaster|abuse|jobs|careers|recruit|hr@|accounts|invoice|payroll|unsubscribe|example|sentry|wixpress|godaddy|squarespace|@.*\.(png|jpg|gif|webp|svg)$|dpo@|gdpr|complaints|press@|marketing@|newsletter",re.I)
THIRD=re.compile(r"checkatrade|trustatrader|ratedpeople|mybuilder|yell\.com|facebook|google|nhs\.uk|gov\.uk|\.ac\.uk|fmb\.org|which\.co|trustpilot|houzz|bark\.com|linkedin|fensa|gassafe|nicieic|trustmark",re.I)
FREE=re.compile(r"@(gmail|googlemail|hotmail|outlook|yahoo|live|aol|icloud|me|btinternet|btconnect|sky|talktalk|virginmedia|ntlworld|blueyonder|hotmail\.co|yahoo\.co|mail|protonmail|msn)\.",re.I)
ROLE=r"(managing director|operations director|technical director|sales director|commercial director|contracts director|company director|finance director|director|owner|founder|co-founder|co founder|proprietor|md|ceo|principal|partner|chairman|general manager|contracts manager|operations manager|office manager|business development manager|sales manager|project manager|site manager|estimator|surveyor|quantity surveyor|structural engineer|head of [a-z]+)"
NAME=r"([A-Z][a-z]{1,15}(?:[- ][A-Z][a-z]{1,15})?\s+(?:Mc|Mac|O')?[A-Z][a-z]{1,20}(?:[- ][A-Z][a-z]{1,15})?)"
P1=re.compile(NAME+r"\s*[,\-–|:]?\s*(?:is\s+(?:the|our)\s+|\(|-\s*)?"+ROLE+r"\b",re.I)
P2=re.compile(ROLE+r"\s*[,\-–|:]?\s*(?:is\s+|of\s+[A-Za-z&\. ]{2,40}?,?\s+)?"+NAME,re.I)
P3=re.compile(r"(?:founded|established|set up|started|run|owned|led|managed|headed)\s+(?:in\s+\d{4}\s+)?by\s+(?:its\s+|the\s+)?(?:owner\s+|founder\s+|director\s+)?"+NAME,re.I)
STOP=set("The This Our Your We Ltd Limited Company Services Service Group Roofing Paving Building Builders Construction Contact Us About Home Read More Click Here Call Now Get Quote Free Privacy Policy Terms Conditions Copyright All Rights Reserved Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December North South East West London Manchester Birmingham Leeds Liverpool Bristol United Kingdom England Scotland Wales Company Number Registered Office Email Phone Google Reviews Facebook Instagram Twitter LinkedIn Trustpilot Checkatrade Which Trusted Trader Damp Proofing Foundation Repair Structural Underpinning Basement Waterproofing Concrete Contractor".split())
BUCKETS=[("owner_or_partner",r"managing director|company director|\bdirector\b|owner|co-owner|founder|co-founder|co founder|president|proprietor|principal|partner|\bceo\b|\bmd\b|chairman"),
 ("gm",r"general manager|branch manager|operations manager|operations director|contracts manager|contracts director|\bvp\b|\bcoo\b"),
 ("marketing",r"marketing"),
 ("sales_manager",r"sales manager|director of sales|inside sales|sales director|commercial director|business development"),
 ("office_manager",r"office manager")]
EXCL=re.compile(r"estimator|technician|installer|crew|foreman|labou?rer|apprentice|inspector|production manager|project manager|site manager|dispatcher|scheduler|\bcsr\b|design specialist|advisor|controller|accountant|bookkeeper|recruiter|purchasing|surveyor|structural engineer|head of",re.I)
DEPARTED=re.compile(r"\b(former|ex-|late|retired|previous|outgoing)\b",re.I)
def bucket(role):
    r=role.lower()
    if EXCL.search(r): return "exclude"
    for b,p in BUCKETS:
        if re.search(p,r): return b
    return "exclude"
BORDER=[b for b,_ in BUCKETS]
def okname(n):
    toks=n.replace('-',' ').split()
    if len(toks)<2 or len(toks)>4: return False
    if any(t in STOP for t in toks): return False
    if re.search(r"\b(Ltd|Limited|Roofing|Paving|Services?|Group|Construction|Building|Builders|Contractors?|Concrete|Landscap\w*|Fencing|Damp|Solutions?|Repairs?|Installations?|Systems?|Design|Property|Homes?|Waterproof\w*)\b",n): return False
    return True
def name_from_local(local):
    l=local.lower()
    m=re.match(r"^([a-z]{2,})[._-]([a-z]{2,})$",l)
    if m and m.group(1) not in GENERIC_GOOD: return (m.group(1).title(),m.group(2).title(),'first.last')
    m=re.match(r"^([a-z])[._-]?([a-z]{3,})$",l)
    if m: return (m.group(1).upper()+'.',m.group(2).title(),'f.last')
    return None
out=[]; stats=collections.Counter()
for r in rows:
    s=site.get(r['place_id']) or {}
    txt=s.get('text') or ''
    dom=r['domain']
    cands=[]
    if r['email_maps']: cands.append((r['email_maps'],'maps'))
    for e in (s.get('emails') or []): cands.append((e.lower(),'site'))
    seen=set(); ranked=[]
    for e,src in cands:
        if e in seen or BAD.search(e) or THIRD.search(e): continue
        if not re.match(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$",e): continue
        seen.add(e)
        local,edom=e.split('@',1)
        own = dom and (edom==dom or edom.endswith('.'+dom) or dom.endswith('.'+edom))
        free=bool(FREE.search('@'+edom+'.'))
        if not own and not free and src=='site': continue   # 3rd-party domain scraped off site = not this business's mailbox
        person=name_from_local(local)
        kind='person' if person else ('generic' if local in GENERIC_GOOD else 'other')
        score=(3 if person else 2 if kind=='generic' else 1)*10+(3 if own else 2 if src=='maps' else 1)
        ranked.append((score,e,kind,own,person))
    ranked.sort(key=lambda x:-x[0])
    best=ranked[0] if ranked else None
    r2=dict(r)
    r2['email']=best[1] if best else ''
    r2['email_type']=best[2] if best else ''
    r2['email_own_domain']='Y' if best and best[3] else ''
    r2['all_emails']='; '.join(x[1] for x in ranked)
    # --- compare Maps-listed email vs what the site actually publishes ---
    site_set={e.lower() for e in (s.get('emails') or [])}
    maps_e=r['email_maps']
    r2['site_emails_all']='; '.join(sorted(site_set))
    r2['maps_email_on_site']=('Y' if maps_e in site_set else 'N') if (maps_e and s.get('status')=='ok') else ''
    if best:
        src=('both' if (best[1]==maps_e and best[1] in site_set) else 'maps' if best[1]==maps_e else 'site')
    else: src=''
    r2['email_source']=src
    if not maps_e and best: r2['email_change']='new_from_site'
    elif maps_e and best and best[1]!=maps_e: r2['email_change']='replaced_by_site_'+best[2]
    elif maps_e and best: r2['email_change']='kept_maps'
    elif maps_e and not best: r2['email_change']='maps_email_rejected'
    else: r2['email_change']='none'
    stats['had_maps_email']+=bool(maps_e); stats['new_from_site']+=(r2['email_change']=='new_from_site'); stats['maps_confirmed_on_site']+=(r2['maps_email_on_site']=='Y')
    # name hint from email
    fn=ln=conf=ev=''
    if best and best[4]:
        f,l,pat=best[4]
        if pat=='first.last':
            fn,ln=f,l
            if re.search(r"\b"+re.escape(f)+r"\b",txt,re.I) and re.search(r"\b"+re.escape(l)+r"\b",txt,re.I): conf='email+site'; m=re.search(r".{0,60}\b"+re.escape(f)+r"\b.{0,60}",txt,re.I); ev=re.sub(r"\s+"," ",m.group(0)) if m else ''
            else: conf='email_pattern'
        else:
            m=re.search(r"\b([A-Z][a-z]{2,})\s+"+re.escape(l)+r"\b",txt)   # F.Last -> find 'First Last' on site
            if m and m.group(1).lower().startswith(f[0].lower()): fn,ln,conf,ev=m.group(1),l,'email+site',re.sub(r"\s+"," ",txt[max(0,m.start()-60):m.end()+60])
            else: fn,ln,conf=f,l,'email_initial_only'
    # role-pattern names from site text
    found=[]
    for pat,order in ((P1,'name_role'),(P2,'role_name'),(P3,'founded_by')):
        for m in pat.finditer(txt):
            nm=m.group(1) if order!='role_name' else m.group(2)
            role=m.group(2) if order=='name_role' else (m.group(1) if order=='role_name' else 'founder/owner')
            if okname(nm):
                found.append((nm.strip(),role.lower(),re.sub(r"\s+"," ",txt[max(0,m.start()-70):m.end()+70])))
    dedup={}
    for nm,role,evd in found:
        k=nm.lower()
        if DEPARTED.search(evd[:90]): continue                       # "former MD John Smith"
        b=bucket(role)
        rank=BORDER.index(b) if b!='exclude' else 99
        if k not in dedup or rank < dedup[k][4]:
            dedup[k]=(nm,role,evd,b,rank)
    kept=sorted([v for v in dedup.values() if v[3]!='exclude'],key=lambda v:v[4])
    excl=[v for v in dedup.values() if v[3]=='exclude']
    r2['site_people_keep']=' || '.join(f"{nm} [{role} -> {b}]" for nm,role,_,b,_ in kept[:6])
    r2['site_people_excluded']=' || '.join(f"{nm} [{role}]" for nm,role,_,_,_ in excl[:4])
    r2['site_owner_evidence']=' || '.join(evd for _,_,evd,_,_ in kept[:2])[:600]
    r2['role_bucket']=''
    if not fn and kept:
        nm,role,evd,b,_=kept[0]
        parts=nm.split(); fn,ln,conf,ev=parts[0],' '.join(parts[1:]),'site_role_pattern:'+role,evd; r2['role_bucket']=b
    elif fn and kept and kept[0][0].lower().split()[-1]==ln.lower().split()[-1]:
        r2['role_bucket']=kept[0][3]; conf=conf+'+role:'+kept[0][1]
    r2['first_name']=fn; r2['last_name']=ln; r2['name_confidence']=conf; r2['name_evidence']=ev[:300]
    stats['email']+=bool(r2['email']); stats['person_email']+=(r2['email_type']=='person'); stats['name']+=bool(fn); stats['name_confirmed']+=(conf=='email+site')
    out.append(r2)
cols=list(out[0].keys())
OUT=IN.replace('.csv','_contacts.csv')
with open(OUT,'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(out)
print(len(out),"rows ->",OUT,dict(stats))
