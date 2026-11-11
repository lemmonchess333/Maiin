import json, collections
rows=[json.loads(l) for l in open('/tmp/work/train/adapt-sweep.jsonl')]
def key(r,drop=()):
    return tuple((k,r[k]) for k in ('g','l','m','d','k','b','inj') if k not in drop)
def struct(r, loads=False):
    return tuple((d['n'], tuple((x[0],x[1],x[2],x[3]) + ((x[4],) if loads else ()) for x in d['x'])) for d in r['days'])
idx={key(r):r for r in rows}
# C: intermediate vs advanced
same=diff=0; ex=[]
for r in rows:
    if r['l']!='intermediate': continue
    k=dict(key(r)); k['l']='advanced'
    a=idx[tuple(k.items())]
    if struct(r)==struct(a): same+=1
    else:
        diff+=1
        if len(ex)<3: ex.append((key(r),[ (d['n'],[x[0] for x in d['x']]) for d in r['days']],[(d['n'],[x[0] for x in d['x']]) for d in a['days']]))
print("intermediate vs advanced: identical structure",same,"different",diff)
# what differs: collect id diffs
c=collections.Counter()
for r in rows:
    if r['l']!='intermediate': continue
    k=dict(key(r)); k['l']='advanced'
    a=idx[tuple(k.items())]
    si=collections.Counter(x[0] for d in r['days'] for x in d['x']); sa=collections.Counter(x[0] for d in a['days'] for x in d['x'])
    for i in (si-sa): c[('int-only',i)]+=1
    for i in (sa-si): c[('adv-only',i)]+=1
    ts_i=sum(x[1] for d in r['days'] for x in d['x']); ts_a=sum(x[1] for d in a['days'] for x in d['x'])
    c[('setdiff',ts_a-ts_i)]+=1
print(c.most_common(30))
# beginner vs intermediate: total sets
c=collections.Counter()
for r in rows:
    if r['l']!='beginner' or r['inj'] or r['k']!='full_gym': continue
    k=dict(key(r)); k['l']='intermediate'
    a=idx[tuple(k.items())]
    ts_b=sum(x[1] for d in r['days'] for x in d['x']); ts_i=sum(x[1] for d in a['days'] for x in d['x'])
    c[(r['g'],r['d'],r['m'])]=(ts_b,ts_i)
print("beginner vs intermediate total sets (hypertrophy, full gym, no injury):")
for d in range(1,7):
    print("  days",d,[ (m,c[('hypertrophy',d,m)]) for m in (30,45,60,75)])
# E home vs minimal
same=diff=0
for r in rows:
    if r['k']!='home_gym' or r['b']: continue
    k=dict(key(r)); k['k']='minimal'
    a=idx[tuple(k.items())]
    if struct(r,True)==struct(a,True): same+=1
    else: diff+=1
print("home_gym(no barbell) vs minimal identical",same,"different",diff)
# F fat_loss vs hypertrophy
same=diff=0
for r in rows:
    if r['g']!='fat_loss': continue
    k=dict(key(r)); k['g']='hypertrophy'
    a=idx[tuple(k.items())]
    if struct(r,True)==struct(a,True): same+=1
    else: diff+=1
print("fat_loss vs hypertrophy identical incl loads",same,"different",diff)
for g2 in ('general','strength','running'):
    same=diff=0
    for r in rows:
        if r['g']!=g2: continue
        k=dict(key(r)); k['g']='hypertrophy'
        a=idx[tuple(k.items())]
        ids=lambda rr: tuple((d['n'],tuple(x[0] for x in d['x'])) for d in rr['days'])
        if ids(r)==ids(a): same+=1
        else: diff+=1
    print(g2,"vs hypertrophy: same exercise list",same,"different",diff)
# D minutes: estimated vs budget
print("minutes fit (no injury, full gym): per budget -> min/median/max est minutes over all days; share of days >budget+2; share of days < budget-10")
import statistics
for m in (30,45,60,75):
    for l in ('beginner','intermediate'):
        est=[d['s']/60 for r in rows if r['m']==m and r['l']==l and not r['inj'] and r['k']=='full_gym' for d in r['days']]
        print(f"  {m}min {l:12} n={len(est)} min={min(est):.0f} med={statistics.median(est):.0f} max={max(est):.0f} over(+2)={sum(e>m+2 for e in est)/len(est):.0%} under(-10)={sum(e<m-10 for e in est)/len(est):.0%} under(-20)={sum(e<m-20 for e in est)/len(est):.0%}")
# sets per day & count of exercises at 2 sets
print("share of exercises at <=2 sets, and exercises per day (hypertrophy+general+fat_loss, full gym, no inj):")
for l in ('beginner','intermediate','advanced'):
    for m in (30,45,60,75):
        xs=[x for r in rows if r['m']==m and r['l']==l and not r['inj'] and r['k']=='full_gym' and r['g'] in('hypertrophy',) for d in r['days'] for x in d['x']]
        dn=[len(d['x']) for r in rows if r['m']==m and r['l']==l and not r['inj'] and r['k']=='full_gym' and r['g'] in('hypertrophy',) for d in r['days']]
        print(f"  {l:12} {m}: two-set share={sum(x[1]<=2 for x in xs)/len(xs):.0%} ex/day med={statistics.median(dn)} max={max(dn)}")
