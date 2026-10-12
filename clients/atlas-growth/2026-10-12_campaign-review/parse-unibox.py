import openpyxl,sys,json,collections
wb=openpyxl.load_workbook(sys.argv[1],read_only=True); ws=wb.worksheets[0]
rows=list(ws.iter_rows(values_only=True)); hdr=rows[0]
threads=[]; cur=None
for r in rows[1:]:
    d=dict(zip(hdr,r))
    if d['Thread ID']:
        cur={'tid':d['Thread ID'],'from':d['Thread From Email'],'to':d['Thread To'],'subj':d['Thread Subject'],'date':str(d['Date']),'msgs':[]}; threads.append(cur)
    elif cur and d['Email ID']:
        cur['msgs'].append({k:(str(d[k]) if d[k] is not None else None) for k in ['Campaign ID','Lead ID','Label','Direction','Body','From Email','To','Subject','Email Date','Email Account ID']})
json.dump(threads,open('exports/threads.json','w'),indent=1)
print('threads',len(threads),'msgs',sum(len(t['msgs']) for t in threads))
by=collections.defaultdict(lambda:{'leads':set(),'labels':collections.Counter(),'in':0,'out':0,'to':collections.Counter(),'dates':[]})
seen=set()
for t in threads:
    for m in t['msgs']:
        b=by[m['Campaign ID']]
        if m['Direction']=='IN':
            b['in']+=1; b['leads'].add(m['Lead ID']); b['to'][(m['To'] or '').split('<')[-1].rstrip('>')]+=1; b['dates'].append(m['Email Date'] or '')
            if (m['Campaign ID'],m['Lead ID']) not in seen:
                seen.add((m['Campaign ID'],m['Lead ID'])); b['labels'][str(m['Label'])]+=1
        else: b['out']+=1
for cid,b in sorted(by.items(),key=lambda x:-x[1]['in']):
    ds=[d for d in b['dates'] if d]
    print('\n==',cid,'IN msgs',b['in'],'OUT',b['out'],'unique leads replied',len(b['leads']))
    print('  labels (first IN per lead):',dict(b['labels']))
    print('  sending inboxes:',dict(b['to']))
    print('  dates',min(ds)[:10] if ds else None,'->',max(ds)[:10] if ds else None)
