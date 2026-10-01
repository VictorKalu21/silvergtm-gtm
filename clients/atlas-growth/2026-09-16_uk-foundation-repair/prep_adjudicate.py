"""Build adjudication batches for tier A + B leads: services-preferred text slice (~2.5k chars) + evidence, 25 leads per batch."""
import csv,json,re,os,sys
TIERS=set(sys.argv[1].split(',')) if len(sys.argv)>1 else {'A','B'}
rows=[r for r in csv.DictReader(open('leads_classified.csv',encoding='utf-8')) if r['tier'] in TIERS]
site={}
for ln in open('owner/site_text.jsonl',encoding='utf-8'):
    ln=ln.strip()
    if ln:
        o=json.loads(ln); site[o['place_id']]=o
def slice_for(rec,cap=2500):
    if not rec: return ''
    pages=rec.get('pages') or []
    svc=[p for p in pages if re.search(r"serv|underpin|subsid|structur|foundation|basement|waterproof|tanking|damp|piling|groundwork|what-we-do",(p.get('label','')+' '+p.get('url','')),re.I)]
    home=[p for p in pages if p.get('label')=='home']
    txt='\n'.join(p['text'] for p in (svc[:2]+home))
    if not txt: txt=rec.get('text','')
    return re.sub(r"\s+"," ",txt).strip()[:cap]
os.makedirs('adjudicate',exist_ok=True)
for f in os.listdir('adjudicate'):
    if f.startswith('batch_'): os.remove(os.path.join('adjudicate',f))
B=25; n=0
for i in range(0,len(rows),B):
    recs=[{'place_id':r['place_id'],'name':r['name'],'google_types':r['google_types'],'city':r['city'],'tier':r['tier'],'matched_terms':r['matched_terms'],'evidence':r['evidence'],'text':slice_for(site.get(r['place_id']))} for r in rows[i:i+B]]
    with open(f'adjudicate/batch_{n:03d}.jsonl','w',encoding='utf-8') as f:
        for o in recs: f.write(json.dumps(o,ensure_ascii=False)+'\n')
    n+=1
print(len(rows),'leads ->',n,'batches in adjudicate/')
