"""Stage A: normalise the raw export into the engine schema + cheap $0 pre-filter.
Drops obvious non-trades (charities, colleges, hospitals, retail, ...) and pure suppliers
BEFORE any site fetch. Every drop carries an auditable drop_reason. Dedupe on place_id then domain."""
import csv,re,collections,sys
rows=list(csv.DictReader(open('input_raw.csv',encoding='utf-8-sig')))

# --- deny by ANY tag matching a non-trade pattern (scope:any for must-drop institution types) ---
NONTRADE=re.compile(r"charity|non-profit|foundation$|college|universit|school|hospital|hospice|clinic|mosque|church|temple|cathedral|chapel|abbey|monastery|synagogue|place of worship|community centre|community garden|foodbank|homeless|housing association|council|government|social services|museum|gallery|library|cricket|football|rugby|golf|gym|pilates|yoga|sports|leisure|club$|stadium|park|tourist|attraction|landmark|castle|manor|zoo|hotel|hostel|lodging|campsite|restaurant|cafe|pub$|bar$|takeaway|bakery|nightclub|venue|pharmacy|medical|doctor|health|dental|nhs|ambulance|care|therap|salon|beauty|cosmetic|make-up|barber|tattoo|nail|spa$|shop$|store$|supermarket|shopping centre|department store|boutique|outlet|market|dealer|school|tutor|training|education|learning|coaching|recruit|lawyer|law firm|legal|solicitor|accountant|financial|mortgage|bank|insurance|estate agent|letting|student|nursery|childbirth|dog|pet|animal|vet|marketing agency|software|printing|courier|shipping|logistic|trucking|car wash|valeting|mot centre|mechanic|vehicle|auto|motor|bicycle|boat|sailing|canoe|kayak|dive|surf|ski |skating|fishing|hunting|gun|watch|clock|shoe|clothing|clothes|tailor|dressmaker|alteration|fabric|haberdashery|embroidery|upholster|curtain|blinds|carpet|furniture|sofa|lingerie|perfume|jewel|gift|toy|book|art |arts|music|dance|theatre|recording|video|photograph|escape room|amusement|water park|snowcentre|climbing|boxing|martial|jiu|karate|self storage|parking|car park|apartment|student halls|retirement|assisted living|sheltered|office rental|co-working|business centre|business park|conference|exhibition|events|wedding|funeral|dry clean|laundr|launderette|cleaners$|house cleaning|cleaning service|window cleaning|carpet cleaning|key duplication|locksmith|phone repair|mobile phone|data recovery|computer|electronics|internet|e-commerce|3d printing|engraver|screen print|copy shop|sign|reiki|hypno|acupunct|massage|herbalist|physio|audiolog|foot care|skin care|hair|wax|image consultant|immigration|criminal|tour|travel|airline|farm|produce|food|frozen|seafood|convenience|duty free|pound shop|discount|secondhand|fleamarket|auction|trading card|memorabilia|army|uniform|work clothes|sportswear|running|camping|outdoor clothing|golf shop|army|religious|meditation|retreat|cultural|heritage|historical|research|association|organisation|organization|voluntary|youth|children|conservative|social club|scout|wellness|fitness|personal trainer|driving school|motorcycle|dressmaker|packaging|pallet|container|promotional|sticker|toilet|fireworks|utility|utilities|water works|reservoir|fountain|sewage|waste", re.I)
# suppliers / merchants / hire / manufacturers -> not a repair contractor (unless the NAME says otherwise)
SUPPLIER=re.compile(r"supplier|supply|shop|store|merchant|wholesal|manufactur|factory|hire|rental|plant and machinery|home improvement shop|diy|hardware|tool|fabricat|showroom|warehouse|distribution", re.I)
# trade allow: at least one tag must look like a construction / property trade for a row to survive
TRADE=re.compile(r"contractor|builder|building|construction|civil|engineer|surveyor|waterproof|damp|concrete|foundation|underpin|piling|pile|groundwork|excavat|drainage|drain|restoration|masonry|brick|plaster|render|structural|concrete repair|structural repair|property maintenance|paving|landscap|roofing|insulation|demolition|drilling|geotechnical|inspector|architect|developer|home builder|garage builder|deck|fence|asphalt|road|railway|scaffold|cladding|conservatory|joiner|carpenter|handyman|stucco|painter|decorat|tile|floor|window|glazing|electrician|plumber|gas|heating|hvac|air conditioning|septic|tree|arborist|pressure washing|gutter|chimney|pest|asbestos|kitchen|bathroom|shed|log cabin|garden building|pond|railing|countertop|lift|utilities|water damage", re.I)
# name-level foundation-repair signal: overrides supplier/non-trade denies (a "Foundation Repairs Ltd" tagged as 'Foundation' must survive)
NAMEKW=re.compile(r"underpin|subsidence|foundation repair|foundation solution|structural repair|structural solution|piling|mini pile|basement|waterproof|tanking|damp|ground ?work|groundwork|structural|resin inject|crack|stabilis|helical|geotech|concrete repair", re.I)

def pid(u):
    m=re.search(r"1s(0x[0-9a-f]+:0x[0-9a-f]+)",u or "")
    return m.group(1) if m else ""

seen_pid=set(); seen_dom={}
out=[]; exc=[]; reasons=collections.Counter()
for r in rows:
    p=pid(r['google_maps_url']) or ("name:"+r['name'].lower())
    tags=[t.strip() for t in r['categories'].split(',') if t.strip()]
    dom=r['domain'].strip().lower().replace('www.','')
    rec={'place_id':p,'name':r['name'],'google_types':' | '.join(tags),'primary_type':tags[0] if tags else '',
         'full_address':r['address'],'zip':r['zip_code'],'city':r['city'],'region':r['state'],'phone_number':r['phone'],
         'website':r['website'].strip(),'domain':dom,'email_maps':r['email'].strip().lower(),'rating':r['rating'],
         'review_count':r['review_count'],'claimed':r['claimed'],'place_link':r['google_maps_url'],'locations':1}
    reason=''
    if p in seen_pid: reason='dup_place'
    elif dom and dom in seen_dom:
        seen_dom[dom]['locations']+=1; reason='dup_domain'
    else:
        name_ok=bool(NAMEKW.search(r['name']))
        prim=tags[0] if tags else ''
        if not name_ok:
            if not any(TRADE.search(t) for t in tags): reason='not_a_trade'
            elif NONTRADE.search(prim) and not TRADE.search(prim): reason='non_trade_primary'
            elif SUPPLIER.search(prim): reason='supplier_not_contractor'
    seen_pid.add(p)
    if reason: rec['drop_reason']=reason; exc.append(rec); reasons[reason]+=1
    else:
        if dom: seen_dom[dom]=rec
        out.append(rec)
cols=list(out[0].keys())
with open('leads_universe.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(out)
with open('excluded_stageA.csv','w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=cols+['drop_reason']); w.writeheader(); w.writerows(exc)
print("input",len(rows),"| kept",len(out),"| dropped",len(exc),dict(reasons))
print("kept with website",sum(1 for r in out if r['website']),"| kept no website",sum(1 for r in out if not r['website']))
print("kept primary types:",collections.Counter(r['primary_type'] for r in out).most_common(40))
