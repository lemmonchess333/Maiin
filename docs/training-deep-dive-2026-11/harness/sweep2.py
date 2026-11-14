import json, collections, statistics
rows=[json.loads(l) for l in open('/tmp/work/train/adapt-sweep.jsonl')]
def key(r):
    return tuple((k,r[k]) for k in ('g','l','m','d','k','b','inj'))
idx={key(r):r for r in rows}
CONTRA=json.load(open('/tmp/work/train/contra.json')) if False else None
inj_list=['lower_back','shoulder','knee','elbow','wrist','knee+lower_back']
for inj in inj_list:
    sub=[r for r in rows if r['inj']==inj]
    ids=collections.Counter(); swaps=collections.Counter(); nosafe=collections.Counter(); nokit=collections.Counter()
    plans_nosafe=0; plans_nokit=0
    for r in sub:
        f1=f2=False
        for d in r['days']:
            for x in d['x']:
                ids[x[0]]+=1
                if x[7]: swaps[(x[7],x[0])]+=1
                if x[8]=='NOSAFE': nosafe[x[0]]+=1; f1=True
                if x[8]=='NOKIT': nokit[x[0]]+=1; f2=True
        plans_nosafe+=f1; plans_nokit+=f2
    print("=====",inj,"plans",len(sub),"| plans with a 'No safe substitute' lift:",plans_nosafe,"| with a 'needs equipment' lift:",plans_nokit)
    print("  nosafe:",nosafe.most_common(10))
    print("  nokit:",nokit.most_common(10))
    print("  swaps (from->to: count):")
    for (a,b),n in sorted(swaps.items(), key=lambda t:-t[1])[:40]: print(f"     {a} -> {b}: {n}")
    print("  all lifts present (count of slots):")
    print("    ", ", ".join(f"{i}:{n}" for i,n in ids.most_common()))
    # volume change vs no injury (same config)
    deltas=collections.defaultdict(list); tot=[]
    for r in sub:
        k=dict(key(r)); k['inj']=''
        base=idx[tuple(k.items())]
        for mu in set(list(r['vol'])+list(base['vol'])):
            deltas[mu].append(r['vol'].get(mu,0)-base['vol'].get(mu,0))
        tot.append(sum(x[1] for d in r['days'] for x in d['x'])-sum(x[1] for d in base['days'] for x in d['x']))
    print("  mean weekly-set change vs same plan without the injury: total %.1f |"%statistics.mean(tot), ", ".join(f"{m}:{statistics.mean(v):+.1f}" for m,v in sorted(deltas.items())))
