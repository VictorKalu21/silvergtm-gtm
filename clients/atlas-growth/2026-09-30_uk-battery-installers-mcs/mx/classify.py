import json,csv,collections,re,sys
# provider by MX host (lowest-priority exchange)
RULES=[('google',r'google\.com|googlemail\.com'),('microsoft',r'outlook\.com|hotmail\.com|office365|microsoft'),('ionos',r'ionos|kundenserver|1and1|1und1'),('godaddy',r'secureserver\.net'),('123-reg/host-europe',r'123-reg|hosteurope|webfusion'),('fasthosts/livemail',r'fasthosts|livemail'),('zoho',r'zoho'),('proofpoint',r'pphosted|proofpoint'),('mimecast',r'mimecast'),('yahoo/aol/bt',r'yahoodns|yahoo|aol\.com|bt\.lon|btinternet|bt\.com'),('apple',r'icloud|apple\.com'),('tsohost/20i/krystal',r'tsohost|20i\.com|krystal|stackmail|names\.co\.uk'),('heart/cloudflare/other',r'.')]
FREE={'gmail.com':'google (free)','googlemail.com':'google (free)','hotmail.com':'microsoft (free)','hotmail.co.uk':'microsoft (free)','outlook.com':'microsoft (free)','live.co.uk':'microsoft (free)','live.com':'microsoft (free)','msn.com':'microsoft (free)','yahoo.com':'yahoo (free)','yahoo.co.uk':'yahoo (free)','btinternet.com':'bt (free)','icloud.com':'apple (free)','me.com':'apple (free)','aol.com':'aol (free)','sky.com':'sky (free)','talktalk.net':'talktalk (free)','virginmedia.com':'virgin (free)'}
mx={}
for l in open('owner/mx/mx.jsonl'):
    try: d=json.loads(l)
    except: continue
    ans=(d.get('r') or {}).get('Answer') or []
    hosts=sorted([(int(a['data'].split()[0]),a['data'].split()[1].lower()) for a in ans if a.get('type')==15], key=lambda x:x[0])
    mx[d['domain']]=hosts[0][1] if hosts else ''
def prov(dom):
    if dom in FREE: return FREE[dom]
    h=mx.get(dom)
    if h is None: return 'unresolved'
    if not h: return 'no MX'
    for name,rx in RULES:
        if re.search(rx,h): return name
emails=[r['email'].lower().strip() for r in csv.DictReader(open(sys.argv[1])) if r.get('email')]
c=collections.Counter(prov(e.split('@')[1]) for e in emails if '@' in e)
tot=sum(c.values())
for k,v in c.most_common(): print(f'{k:28s} {v:5d}  {100*v/tot:5.1f}%')
print('total',tot)
